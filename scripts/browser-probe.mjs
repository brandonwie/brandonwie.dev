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
	let out = '';
	const port = await new Promise((resolve, reject) => {
		const onData = (chunk) => {
			out += String(chunk);
			const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
			if (m) resolve(Number(m[1]));
		};
		child.stdout.on('data', onData);
		child.stderr.on('data', onData);
		child.once('exit', (code) => reject(new Error(`server exited early (${code}): ${out}`)));
		setTimeout(() => reject(new Error(`server did not report a port: ${out}`)), 10000);
	});
	return {
		port,
		close: () => {
			child.kill('SIGTERM');
		},
	};
}

/**
 * Launch Chrome and connect to its page target.
 *
 * The profile is a fresh temp directory per launch and is removed in `close()`,
 * so no probe inherits another's storage, and a crashed run leaves at most one
 * directory under the OS temp dir.
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

	const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
	let err = '';
	const wsUrl = await new Promise((resolve, reject) => {
		child.stderr.on('data', (chunk) => {
			err += String(chunk);
			const m = /ws:\/\/[^\s]+/.exec(err);
			if (m) resolve(m[0]);
		});
		child.once('exit', (code) => reject(new Error(`chrome exited (${code}): ${err}`)));
		setTimeout(() => reject(new Error(`chrome did not expose DevTools: ${err}`)), 15000);
	});

	const cdp = await connect(wsUrl);
	const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
	const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

	return {
		binary,
		profile,
		cdp,
		sessionId,
		send: (method, params) => cdp.send(method, params, sessionId),
		on: (method, handler) => cdp.on(method, handler),
		close: async () => {
			try {
				await cdp.send('Target.closeTarget', { targetId });
			} catch {
				/* target may already be gone; teardown continues */
			}
			cdp.close();
			child.kill('SIGTERM');

			// Wait for the process to actually exit before removing its profile.
			// Found by running the spike: rmSync immediately after SIGTERM threw
			// ENOTEMPTY because Chrome was still flushing, and that throw escaped
			// the probe's finally block -- turning a legitimate assertion FAIL into
			// exit 2. A teardown fault must never overwrite an assertion result.
			await new Promise((resolve) => {
				if (child.exitCode !== null || child.signalCode !== null) return resolve();
				const timer = setTimeout(resolve, 5000);
				child.once('exit', () => {
					clearTimeout(timer);
					resolve();
				});
			});
			try {
				rmSync(profile, { recursive: true, force: true });
			} catch (error) {
				console.warn(`WARN  could not remove ${profile}: ${error.message}`);
			}
		},
	};
}

/** Minimal CDP client over the built-in WebSocket. */
async function connect(wsUrl) {
	const ws = new WebSocket(wsUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
	});

	let nextId = 1;
	const pending = new Map();
	const listeners = new Map();

	ws.addEventListener('message', (event) => {
		const msg = JSON.parse(event.data);
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
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
			const id = nextId++;
			const payload = { id, method, params };
			if (sessionId) payload.sessionId = sessionId;
			ws.send(JSON.stringify(payload));
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				setTimeout(() => {
					if (pending.delete(id)) reject(new Error(`${method} timed out`));
				}, 20000);
			});
		},
		on(method, handler) {
			if (!listeners.has(method)) listeners.set(method, []);
			listeners.get(method).push(handler);
		},
		close: () => ws.close(),
	};
}

/** Evaluate an expression in the page and return its JSON value. */
export async function evaluate(page, expression) {
	const { result } = await page.send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
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

/** Dispatch a modified key chord as three real input events. */
export async function chord(page, key, { meta = false, ctrl = false } = {}) {
	const modifiers = (meta ? 4 : 0) | (ctrl ? 2 : 0);
	const base = {
		key,
		text: key,
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
