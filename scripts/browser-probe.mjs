/**
 * browser-probe — the runner half of a rendered-stage assertion.
 *
 * SPIKE. This exists to answer S35-R3's seven unknowns with running code rather
 * than an estimate: serving, startup, teardown, local and CI availability, async
 * propagation, behavioral mutation, and failure handling. It is deliberately
 * dependency-free — Node 22+ ships a global `WebSocket`, and Chrome speaks the
 * DevTools Protocol over it directly, so no browser-automation package enters
 * `package.json`.
 *
 * WHY NOT A LIBRARY. The rendered-stage fallback check already drove the
 * installed Chrome this way. Adding playwright or puppeteer to assert five
 * behaviors would put a large dependency and its browser download in a repo
 * whose whole migration is measured in file counts.
 *
 * EXIT CODES ARE THE CONTRACT: 0 pass, 1 assertion failed, 2 harness error,
 * 3 SKIPPED because no browser is available. 3 is not a pass — callers must
 * distinguish it, or "no browser in CI" silently becomes a green suite.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const EXIT = { PASS: 0, FAIL: 1, ERROR: 2, SKIPPED: 3 };

/** Discovered candidates, most specific first. `CHROME_BINARY` preempts these. */
const CANDIDATES = [
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
];

/**
 * An explicit override THROWS when it does not exist; it never falls through.
 *
 * Found by running the spike: the first version listed `CHROME_BINARY` as
 * candidate zero and `.find(existsSync)` skipped it silently, so pointing the
 * probe at a wrong path still passed against whatever Chrome happened to be
 * installed. "I aimed it somewhere else and it went green" is the same class of
 * false green as a control that cannot fail.
 */
export function findBrowser() {
	const override = process.env.CHROME_BINARY;
	// `CHROME_BINARY=none` declares the environment browserless on purpose. It
	// exists so CI can EXERCISE the skip path rather than assume it: a skip
	// branch that never runs is a branch nobody has seen work.
	if (override === 'none') return null;
	if (override) {
		if (!existsSync(override)) {
			throw new Error(`CHROME_BINARY does not exist: ${override}`);
		}
		return override;
	}
	return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/** Wait for a predicate, polling. Returns false on timeout rather than throwing. */
async function until(predicate, { timeoutMs = 10000, everyMs = 50 } = {}) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await predicate()) return true;
		if (Date.now() > deadline) return false;
		await new Promise((r) => setTimeout(r, everyMs));
	}
}

/**
 * Serve a build directory. Resolves with `{ port, close }`.
 *
 * Port 0 lets the OS choose, so concurrent suites cannot collide — the
 * fallback check earlier in this migration failed exactly once because a
 * previous run still held 4173.
 */
export async function serve(buildDir) {
	const child = spawn(process.execPath, ['scripts/serve-build.mjs', buildDir, '0'], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	// The server is an acquired resource from the spawn call onward, so its
	// release is defined once and used by both the failure path and the caller.
	// Found in review: a server that never reported readiness timed out and its
	// child survived -- and because the child inherited the parent's stdio pipes,
	// the parent then never exited at all. A leaked helper is not merely untidy;
	// it hangs whoever leaked it.
	const stop = async () => {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
		await new Promise((resolve) => {
			if (child.exitCode !== null || child.signalCode !== null) return resolve();
			const timer = setTimeout(() => {
				child.kill('SIGKILL');
				resolve();
			}, 5000);
			child.once('exit', () => {
				clearTimeout(timer);
				resolve();
			});
		});
	};

	let out = '';
	let port;
	try {
		port = await new Promise((resolve, reject) => {
			let timer;
			// Every settlement clears the readiness timer and detaches the output
			// listeners. Found in review: the timer stayed armed for its full 10
			// seconds after the port had already been reported, so an importing
			// caller that closed the server still sat in the event loop -- measured
			// at 10,049ms for a probe whose work took under a second.
			const settle = (fn, value) => {
				clearTimeout(timer);
				child.stdout.off('data', onData);
				child.stderr.off('data', onData);
				fn(value);
			};
			const onData = (chunk) => {
				out += String(chunk);
				const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
				if (m) settle(resolve, Number(m[1]));
			};
			child.stdout.on('data', onData);
			child.stderr.on('data', onData);
			// An unspawnable interpreter arrives on 'error', not as a throw -- the
			// same asynchronous shape that made a bad CHROME_BINARY crash the probe.
			child.once('error', (error) =>
				settle(reject, new Error(`could not start the server: ${error.message}`)),
			);
			child.once('exit', (code) =>
				settle(reject, new Error(`server exited early (${code}): ${out.trim()}`)),
			);
			timer = setTimeout(
				() => settle(reject, new Error(`server did not report a port: ${out.trim()}`)),
				10000,
			);
		});
	} catch (error) {
		await stop();
		throw error;
	}

	return { port, close: stop };
}

/**
 * Launch Chrome and connect to its page target.
 *
 * The profile is a fresh temp directory per launch and is removed in `close()`
 * ONLY after the browser's exit is confirmed, so no probe inherits another's
 * storage, and a crashed run leaves at most one directory under the OS temp dir.
 * A browser that cannot be confirmed dead keeps its profile on disk on purpose.
 */
export async function launch({ headless = true } = {}) {
	const binary = findBrowser();
	if (!binary) return null;

	const profile = mkdtempSync(join(tmpdir(), 'browser-probe-'));
	const args = [
		'--remote-debugging-port=0',
		`--user-data-dir=${profile}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-background-networking',
		'--disable-extensions',
		'about:blank',
	];
	if (headless) args.unshift('--headless=new');

	// EVERY acquisition from here is covered by rollback. Found in review: when
	// the DevTools handshake failed, the profile directory and the Chrome process
	// both leaked, and the caller's own `finally` had not been entered yet
	// because `launch()` threw before it. A partially acquired resource is the
	// acquirer's to release.
	let child = null;
	let cdp = null;
	/**
	 * TRUE means the child is CONFIRMED gone; FALSE means the wait expired and
	 * its state is unknown. The previous revision returned nothing, so a wedged
	 * browser and an exited one were indistinguishable to every caller, and
	 * cleanup continued as if the process were dead.
	 */
	const waitForExit = async (timeoutMs) => {
		if (!child?.pid) return true;
		if (child.exitCode !== null || child.signalCode !== null) return true;
		return await new Promise((resolve) => {
			const timer = setTimeout(() => resolve(false), timeoutMs);
			child.once('exit', () => {
				clearTimeout(timer);
				resolve(true);
			});
		});
	};
	/**
	 * Terminate the browser and CONFIRM it. Returns null on confirmed exit, or a
	 * reason string when termination could not be confirmed.
	 *
	 * SCOPE — this signals the DIRECT child of this launch and nothing else.
	 * Chrome forks helper processes, so confirmed exit of the direct child is NOT
	 * a guarantee that every descendant is gone; this function does not claim
	 * one. Group termination was assessed: it would require spawning detached
	 * into a new process group and signalling the group, which is a larger change
	 * whose own failure mode (signalling a group this launch does not exclusively
	 * own) is worse than the gap it closes. The chosen mitigation is that removal
	 * is CONDITIONAL on confirmation rather than that termination is total.
	 */
	const terminate = async ({ graceMs = 5000, forceMs = 5000 } = {}) => {
		if (!child?.pid) return null;
		if (child.exitCode !== null || child.signalCode !== null) return null;
		child.kill('SIGTERM');
		if (await waitForExit(graceMs)) return null;
		// The grace period expired, not the process. Escalate rather than assume.
		child.kill('SIGKILL');
		if (await waitForExit(forceMs)) return null;
		return `chrome (pid ${child.pid}) did not exit within ${graceMs + forceMs}ms of SIGTERM then SIGKILL`;
	};
	/** Returns null on success, or the reason removal failed. */
	const removeProfile = () => {
		try {
			rmSync(profile, { recursive: true, force: true });
			return null;
		} catch (error) {
			return `could not remove ${profile}: ${error.message}`;
		}
	};
	/**
	 * Confirmed termination THEN removal. Returns null on success, or the reason
	 * cleanup failed.
	 *
	 * The ORDER is the point. Removing a profile out from under a browser that
	 * may still be running is how a removed directory comes back: the live
	 * process recreates what it still has open. When termination cannot be
	 * confirmed the profile is RETAINED and reported — a directory left on disk
	 * is a visible, diagnosable fault; a delete racing a live writer is not.
	 */
	const cleanup = async () => {
		const undead = await terminate();
		if (undead) return `${undead}; profile retained at ${profile}`;
		return removeProfile();
	};
	const rollback = async () => {
		try {
			cdp?.close();
		} catch {
			/* socket may already be gone */
		}
		// A launch that already failed has no session worth a grace period, so
		// rollback kills outright — but it still CONFIRMS the exit before removing.
		if (child && child.exitCode === null && child.signalCode === null) {
			child.kill('SIGKILL');
		}
		const failure = (await waitForExit(5000))
			? removeProfile()
			: `chrome (pid ${child?.pid}) did not exit within 5000ms of SIGKILL; profile retained at ${profile}`;
		// The LAUNCH error is what the caller must see. A teardown failure is
		// reported alongside it and must never replace it.
		if (failure) console.warn(`WARN  rollback cleanup: ${failure}`);
	};

	try {
		child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let err = '';
		const wsUrl = await new Promise((resolve, reject) => {
			let timer;
			const settle = (fn, value) => {
				clearTimeout(timer);
				fn(value);
			};
			// `spawn` reports an unspawnable binary asynchronously on 'error', not
			// by throwing. Without this, CHROME_BINARY=/etc/hosts raised an
			// unhandled EACCES and the process died with the wrong exit code.
			child.once('error', (error) =>
				settle(reject, new Error(`could not start ${binary}: ${error.message}`)),
			);
			child.stderr.on('data', (chunk) => {
				err += String(chunk);
				const m = /ws:\/\/[^\s]+/.exec(err);
				if (m) settle(resolve, m[0]);
			});
			child.once('exit', (code) =>
				settle(reject, new Error(`chrome exited (${code}): ${err.trim() || 'no output'}`)),
			);
			timer = setTimeout(
				() => settle(reject, new Error(`chrome did not expose DevTools: ${err.trim()}`)),
				15000,
			);
		});

		cdp = await connect(wsUrl);
		var { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
		var { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
	} catch (error) {
		await rollback();
		throw error;
	}

	return {
		binary,
		profile,
		cdp,
		sessionId,
		send: (method, params) => cdp.send(method, params, sessionId),
		on: (method, handler) => cdp.on(method, handler),
		/**
		 * Teardown THROWS when it cannot finish. Found in review: this path sent
		 * SIGTERM, waited at most five seconds, and then removed the profile
		 * whether or not the browser had actually exited — and a removal failure
		 * was only warned about, so a caller could not tell a clean teardown from
		 * a failed one. Callers that warn instead of failing (the palette probe)
		 * still surface it, and the control suite's own leak inventory catches
		 * what a warning would hide.
		 */
		close: async () => {
			try {
				await cdp.send('Target.closeTarget', { targetId });
			} catch {
				/* target may already be gone; teardown continues */
			}
			cdp.close();
			const failure = await cleanup();
			if (failure) throw new Error(`teardown failed: ${failure}`);
		},
	};
}

/** Minimal CDP client over the built-in WebSocket. */
async function connect(wsUrl) {
	const ws = new WebSocket(wsUrl);
	await new Promise((resolve, reject) => {
		// Settled handshake listeners must not observe later transport failures.
		const cleanup = () => {
			clearTimeout(timer);
			ws.removeEventListener('open', onOpen);
			ws.removeEventListener('error', onError);
		};
		const onOpen = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error('CDP socket failed'));
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error('CDP socket did not open'));
		}, 15000);
		ws.addEventListener('open', onOpen, { once: true });
		ws.addEventListener('error', onError, { once: true });
	});

	let nextId = 1;
	let closed = false;
	const pending = new Map();
	const listeners = new Map();

	// A disconnected peer must fail its in-flight requests NOW. Found in review:
	// after `Browser.close` dropped the connection, an outstanding evaluation sat
	// pending until its own 20-second timeout -- reproduced at 20,002ms -- and
	// reported "timed out" rather than "the socket went away". Every subsequent
	// teardown call then paid the same 20 seconds.
	const failAll = (reason) => {
		closed = true;
		for (const [id, entry] of pending) {
			clearTimeout(entry.timer);
			pending.delete(id);
			entry.reject(new Error(reason));
		}
	};
	ws.addEventListener('close', () => failAll('CDP socket closed with a request in flight'), {
		once: true,
	});
	ws.addEventListener('error', () => failAll('CDP socket errored with a request in flight'), {
		once: true,
	});

	ws.addEventListener('message', (event) => {
		const msg = JSON.parse(event.data);
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject, timer } = pending.get(msg.id);
			clearTimeout(timer);
			pending.delete(msg.id);
			if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
			else resolve(msg.result ?? {});
			return;
		}
		const handlers = listeners.get(msg.method);
		if (handlers) for (const h of handlers) h(msg.params, msg.sessionId);
	});

	return {
		send(method, params = {}, sessionId) {
			// Sending into a dead socket must fail immediately rather than wait out
			// a timeout, so teardown after a disconnect stays fast and truthful.
			if (closed) {
				return Promise.reject(new Error(`${method} sent on a closed CDP socket`));
			}
			const id = nextId++;
			const payload = { id, method, params };
			if (sessionId) payload.sessionId = sessionId;
			try {
				ws.send(JSON.stringify(payload));
			} catch (error) {
				failAll(`CDP send failed: ${error.message}`);
				return Promise.reject(new Error(`${method} could not be sent: ${error.message}`));
			}
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					if (pending.delete(id)) reject(new Error(`${method} timed out`));
				}, 20000);
				pending.set(id, { resolve, reject, timer });
			});
		},
		on(method, handler) {
			if (!listeners.has(method)) listeners.set(method, []);
			listeners.get(method).push(handler);
		},
		close: () => {
			failAll('CDP socket closed with a request in flight');
			ws.close();
		},
	};
}

/** Evaluate an expression in the page and return its JSON value. */
export async function evaluate(page, expression) {
	const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	// A throwing expression returns `{ result: { value: undefined } }` with the
	// error only in `exceptionDetails`. Ignoring it — as the first version did —
	// turns every runtime fault into a falsy value, so a broken selector reads as
	// "the element is not there" and a harness bug becomes an assertion failure.
	if (exceptionDetails) {
		const text = exceptionDetails.exception?.description ?? exceptionDetails.text;
		throw new Error(`page evaluation threw: ${text}`);
	}
	return result.value;
}

/**
 * Wait for the page to be interactive, not merely parsed.
 *
 * `readyState === 'complete'` is necessary and NOT sufficient: React attaches
 * its listeners during hydration, which runs after load. A probe that dispatches
 * a key on `complete` races hydration and fails intermittently — the async
 * propagation problem S35-R3 named. `hydratedWhen` is the caller's own signal
 * that the app is listening.
 */
export async function ready(page, hydratedWhen, opts) {
	const complete = await until(
		async () => (await evaluate(page, 'document.readyState')) === 'complete',
		opts,
	);
	if (!complete) return false;
	if (!hydratedWhen) return true;
	return until(async () => Boolean(await evaluate(page, hydratedWhen)), opts);
}

/** Dispatch a shortcut as rawKeyDown and keyUp; printable text input is separate. */
export async function chord(page, key, { meta = false, ctrl = false } = {}) {
	const modifiers = (meta ? 4 : 0) | (ctrl ? 2 : 0);
	const base = {
		key,
		// CDP defaults text to empty for rawKeyDown/keyUp; shortcuts insert no character.
		unmodifiedText: key,
		modifiers,
		windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
	};
	await page.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' });
	await page.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

/**
 * Install a behavioral mutation before any page script runs.
 *
 * This is the answer to "what does a negative control look like when the input
 * is a live DOM rather than a file": instead of editing the built bundle, the
 * probe suppresses the behavior under test at the DOM level and asserts the SAME
 * assertion now fails. The application bytes are untouched, so the control can
 * never leave a mutated tree behind — the failure mode that made file-mutating
 * controls need a scratch copy.
 */
export async function mutateBehavior(page, script) {
	await page.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
}

export { until };
