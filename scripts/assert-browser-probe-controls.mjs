/**
 * migration:browser:controls — the runner's own negative controls.
 *
 * A probe that only ever passes proves nothing about the probe. These rows
 * execute the fault paths the runner advertises, so "the exit contract holds"
 * is a result rather than a claim. Every row here corresponds to a defect the
 * spike actually had.
 *
 * EVERY ROW CHECKS THREE THINGS: the process outcome (exit code, signal, and
 * whether it had to be killed), the resources it left behind, and — where the
 * row is about timing — how long it took. Found in review: the first two
 * process-level rows checked neither exit code nor resources, so injecting
 * `process.exit(1)` into the BC-07 child and `process.exit(2)` into the BC-08
 * child still produced "8 controls: 8 behaved as specified" and suite exit 0.
 * BC-07's line even read "exited without process.exit" while the child was
 * calling exactly that. A control that reads one signal out of three is a
 * control that can pass a broken subject.
 *
 * Exit 0 all rows behaved as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-palette.mjs';
const RUNNER = new URL('./browser-probe.mjs', import.meta.url).href;

/** Profiles the runner may have left behind; the name prefix is its own. */
const profiles = () => {
	try {
		return readdirSync(tmpdir()).filter((n) => n.startsWith('browser-probe-'));
	} catch {
		return [];
	}
};

const servers = () => {
	const result = spawnSync('pgrep', ['-f', 'serve-build.mjs'], { encoding: 'utf8' });
	if (result.error) throw new Error(`pgrep could not run: ${result.error.message}`);
	// Exit 1 means no matches; other failures cannot certify a leak-free run.
	if (result.status !== 0 && result.status !== 1) {
		throw new Error(`pgrep failed (${result.status}): ${result.stderr?.trim() || result.signal}`);
	}
	if (typeof result.stdout !== 'string') throw new Error('pgrep did not return text output');
	return result.stdout.trim().split('\n').filter(Boolean);
};

/** One measurement of everything a row is allowed to assert on. */
function observe(run) {
	const before = { profiles: profiles().length, servers: servers().length };
	const started = Date.now();
	const result = run();
	const elapsedMs = Date.now() - started;
	// The PRE-run inventory may throw freely: nothing has been spawned yet. The
	// POST-run inventory may not. By the time it runs the child has executed and
	// may own resources the caller still has to release, so a throw here would
	// skip the caller's cleanup entirely. The error is carried back as data and
	// surfaced by faults(), which keeps it non-success without losing the
	// lifecycle boundary.
	let after = null;
	let inventoryError = null;
	try {
		after = { profiles: profiles().length, servers: servers().length };
	} catch (error) {
		inventoryError = error.message;
	}
	return {
		code: result.status,
		signal: result.signal ?? null,
		timedOut: result.error?.code === 'ETIMEDOUT',
		stdout: (result.stdout ?? '').trim(),
		stderr: (result.stderr ?? '').trim(),
		elapsedMs,
		inventoryError,
		leakedProfile: after ? after.profiles > before.profiles : false,
		leakedServer: after ? after.servers > before.servers : false,
	};
}

const runChild = (source, timeout, cwd) =>
	observe(() =>
		spawnSync(process.execPath, ['--input-type=module', '-e', source], {
			encoding: 'utf8',
			timeout,
			cwd,
		}),
	);

/** Shared complaints, so no row can quietly check fewer things than its siblings. */
function faults(
	id,
	o,
	{ expect = EXIT.PASS, underMs = null, stdoutIncludes = null, stderrIncludes = null } = {},
) {
	const out = [];
	if (o.timedOut) out.push(`${id}: had to be killed after ${o.elapsedMs}ms`);
	if (o.signal) out.push(`${id}: died on ${o.signal}`);
	if (o.code !== expect) out.push(`${id}: exit ${o.code}, expected ${expect}`);
	if (stdoutIncludes !== null && !o.stdout.includes(stdoutIncludes)) {
		out.push(`${id}: expected output containing ${JSON.stringify(stdoutIncludes)}`);
	}
	if (stderrIncludes !== null && !o.stderr.includes(stderrIncludes)) {
		out.push(`${id}: expected error containing ${JSON.stringify(stderrIncludes)}`);
	}
	if (underMs !== null && o.elapsedMs >= underMs) {
		out.push(`${id}: took ${o.elapsedMs}ms, expected under ${underMs}ms`);
	}
	if (o.inventoryError) {
		out.push(`${id}: post-run inventory failed, leak state unknown: ${o.inventoryError}`);
	}
	if (o.leakedProfile) out.push(`${id}: leaked a profile directory`);
	if (o.leakedServer) out.push(`${id}: leaked a server process`);
	return out;
}

const ROWS = [
	{
		id: 'BC-01',
		kind: 'BASELINE',
		what: 'an untouched probe passes',
		env: {},
		expect: EXIT.PASS,
	},
	{
		id: 'BC-02',
		kind: 'DEFECT',
		what: 'the behavior under test is suppressed in the live DOM',
		args: ['--suppress'],
		env: {},
		expect: EXIT.FAIL,
	},
	{
		id: 'BC-03',
		kind: 'FAULT',
		what: 'CHROME_BINARY points at a path that does not exist',
		env: { CHROME_BINARY: '/nonexistent/chrome' },
		expect: EXIT.ERROR,
	},
	{
		id: 'BC-04',
		kind: 'FAULT',
		what: 'CHROME_BINARY points at an unspawnable file (EACCES)',
		env: { CHROME_BINARY: '/etc/hosts' },
		expect: EXIT.ERROR,
	},
	{
		id: 'BC-05',
		kind: 'FAULT',
		what: 'the browser starts and exits before exposing DevTools',
		env: { CHROME_BINARY: '/usr/bin/false' },
		expect: EXIT.ERROR,
	},
	{
		id: 'BC-06',
		kind: 'INVARIANCE',
		what: 'a declared-browserless environment skips rather than fails',
		env: { CHROME_BINARY: 'none' },
		expect: EXIT.SKIPPED,
	},
	{
		id: 'BC-11',
		kind: 'DEFECT',
		what: 'bootstrap globals without client hydration fail before dispatching the chord',
		args: ['--block-hydration'],
		env: {},
		expect: EXIT.FAIL,
		stdoutIncludes: 'the page never reached an interactive state',
	},
];

/**
 * BC-07 — an IMPORTING caller must exit on its own, having held BOTH resources.
 *
 * The CLI calls `process.exit`, which masks a live handle. A suite that imports
 * the runner has no such escape. The row now acquires the server as well as the
 * browser, because the two armed their timers separately: the server's readiness
 * timer stayed armed for its full 10 seconds after the port had been reported,
 * measured at 10,049ms for work that took under a second, and no browser-only
 * row could see it.
 */
const naturalExitSource = `
	import { serve, launch } from ${JSON.stringify(RUNNER)};
	const server = await serve('next/build');
	const page = await launch();
	if (page) await page.close();
	await server.close();
	console.log('CLOSED port ' + server.port);
	// No process.exit: an armed timer on either resource outlives this line.
`;

/** BC-08 — a throwing page expression must be a harness error, not `false`. */
const evaluateThrowSource = `
	import { launch, evaluate } from ${JSON.stringify(RUNNER)};
	const page = await launch();
	try {
		await page.send('Runtime.enable');
		await evaluate(page, 'throw new Error("bc-evaluation-fault")');
		console.log('SWALLOWED');
	} catch (error) {
		console.log(error.message.includes('bc-evaluation-fault') ? 'PROPAGATED' : 'WRONG');
	} finally {
		await page.close();
	}
`;

/**
 * BC-09 — a server that never reports readiness must fail AND release its child.
 *
 * serve() resolves its script relative to the caller's cwd, so this row can
 * substitute a silent server there. A script-path refactor must preserve an
 * explicit substitution seam; the TIMED-OUT check rejects using the real server.
 */
const silentServerSource = `
	import { serve } from ${JSON.stringify(RUNNER)};
	try {
		await serve('anything');
		console.log('RESOLVED');
	} catch (error) {
		console.log(error.message.startsWith('server did not report a port') ? 'TIMED-OUT' : 'WRONG');
	}
`;

/**
 * BC-10 — a request in flight when the peer disconnects must reject promptly.
 *
 * Reproduced before the repair at 20,002ms with the message "Runtime.evaluate
 * timed out": the pending entry was cleared only by explicit `close()`, so a
 * dead browser cost every outstanding call its full timeout and reported the
 * wrong cause.
 */
const disconnectSource = `
	import { launch, evaluate } from ${JSON.stringify(RUNNER)};
	const page = await launch();
	await page.send('Runtime.enable');
	const started = Date.now();
	const inflight = evaluate(page, 'new Promise(r => setTimeout(r, 60000))').then(
		() => 'RESOLVED',
		(error) => ({ ms: Date.now() - started, message: error.message }),
	);
	await new Promise((r) => setTimeout(r, 500));
	page.cdp.send('Browser.close').catch(() => {});
	const outcome = await inflight;
	// Teardown AFTER the peer is already gone: it must still remove the profile
	// rather than throw on a socket that no longer answers. Found by this row's
	// own leak check, which the previous revision did not have.
	await page.close();
	if (typeof outcome === 'string') console.log('RESOLVED');
	else console.log(outcome.message.includes('socket') && outcome.ms < 5000 ? 'REJECTED' : 'WRONG ' + outcome.ms + 'ms ' + outcome.message);
`;

async function main() {
	if (!findBrowser()) {
		console.log('SKIP  no browser; the control suite cannot distinguish its rows');
		return EXIT.SKIPPED;
	}

	const failures = [];
	const reported = [];
	const report = (id, kind, detail, rowFaults) => {
		reported.push(rowFaults.length === 0);
		failures.push(...rowFaults);
		console.log(`${rowFaults.length === 0 ? 'PASS' : 'FAIL'}  ${id}  ${kind.padEnd(10)} ${detail}`);
	};

	for (const row of ROWS) {
		const o = observe(() =>
			spawnSync(process.execPath, [PROBE, ...(row.args ?? [])], {
				env: { ...process.env, ...row.env },
				encoding: 'utf8',
				timeout: 60000,
			}),
		);
		report(
			row.id,
			row.kind,
			`exit ${o.code} (expected ${row.expect})  ${o.leakedProfile || o.leakedServer ? 'LEAKED' : 'no leak'}  ${row.what}`,
			faults(row.id, o, { expect: row.expect, stdoutIncludes: row.stdoutIncludes }),
		);
	}

	const natural = runChild(naturalExitSource, 30000);
	report(
		'BC-07',
		'IMPORTED',
		`exited in ${natural.elapsedMs}ms holding a server and a browser  an armed timer on either would hold the loop`,
		[
			...faults('BC-07', natural, { expect: EXIT.PASS, underMs: 8000 }),
			...(natural.stdout.startsWith('CLOSED port')
				? []
				: [`BC-07: child reported ${natural.stdout || 'nothing'}`]),
		],
	);

	const propagation = runChild(evaluateThrowSource, 60000);
	report(
		'BC-08',
		'FAULT',
		'a throwing page expression surfaces as a harness error, not a falsy value',
		[
			...faults('BC-08', propagation, { expect: EXIT.PASS }),
			...(propagation.stdout === 'PROPAGATED'
				? []
				: [`BC-08: page exception was ${propagation.stdout || 'not observed'}`]),
		],
	);

	// The stub lives in its own tree so `serve()` resolves the silent script by
	// its usual relative path without touching the repository's real one.
	const stub = mkdtempSync(join(tmpdir(), 'browser-probe-stub-'));
	let silent;
	try {
		mkdirSync(join(stub, 'scripts'));
		writeFileSync(join(stub, 'scripts', 'serve-build.mjs'), 'setInterval(() => {}, 1000);\n');
		silent = runChild(silentServerSource, 30000, stub);
	} finally {
		rmSync(stub, { recursive: true, force: true });
	}
	report(
		'BC-09',
		'FAULT',
		`a server that never reports readiness fails in ${silent.elapsedMs}ms and leaves no child behind`,
		[
			...faults('BC-09', silent, { expect: EXIT.PASS, underMs: 15000 }),
			...(silent.stdout === 'TIMED-OUT'
				? []
				: [`BC-09: child reported ${silent.stdout || 'nothing'}`]),
		],
	);

	const disconnect = runChild(disconnectSource, 60000);
	report(
		'BC-10',
		'FAULT',
		`a request in flight rejects when the peer disconnects, and teardown still cleans up (${disconnect.elapsedMs}ms)`,
		[
			...faults('BC-10', disconnect, { expect: EXIT.PASS }),
			...(disconnect.stdout === 'REJECTED'
				? []
				: [`BC-10: outstanding request was ${disconnect.stdout || 'not observed'}`]),
		],
	);

	const missingInventory = runChild(
		`process.env.PATH = '/nonexistent-browser-inventory'; await import(${JSON.stringify(import.meta.url)});`,
		5000,
	);
	report(
		'BC-12',
		'FAULT',
		'a missing process inventory tool produces an explicit harness error',
		faults('BC-12', missingInventory, { expect: EXIT.ERROR, stderrIncludes: 'ERROR pgrep' }),
	);

	const failedInventory = runChild(
		`
			import cp from 'node:child_process';
			import { syncBuiltinESMExports } from 'node:module';
			const original = cp.spawnSync;
			cp.spawnSync = (command, ...args) => command === 'pgrep'
				? { status: 2, stdout: '', stderr: 'inventory failure control', signal: null }
				: original(command, ...args);
			syncBuiltinESMExports();
			await import(${JSON.stringify(import.meta.url)});
		`,
		5000,
	);
	report(
		'BC-13',
		'FAULT',
		'a failed process query cannot be mistaken for no matching processes',
		faults('BC-13', failedInventory, { expect: EXIT.ERROR, stderrIncludes: 'ERROR pgrep' }),
	);

	const shortcutEvents = runChild(
		`
			import assert from 'node:assert/strict';
			import { chord } from ${JSON.stringify(RUNNER)};
			for (const [options, modifiers] of [[{ meta: true }, 4], [{ ctrl: true }, 2]]) {
				const events = [];
				await chord({ send: async (method, params) => events.push({ method, ...params }) }, 'k', options);
				assert.deepEqual(events.map(event => event.type), ['rawKeyDown', 'keyUp']);
				for (const event of events) {
					assert.equal(event.method, 'Input.dispatchKeyEvent');
					assert.equal(event.modifiers, modifiers);
					assert.equal(event.key, 'k');
					assert.equal(event.text ?? '', '', 'a shortcut must not generate printable text');
				}
			}
			console.log('SHORTCUTS');
		`,
		5000,
	);
	report(
		'BC-14',
		'CONTRACT',
		'Meta and Ctrl shortcuts dispatch two input events without printable text',
		faults('BC-14', shortcutEvents, { stdoutIncludes: 'SHORTCUTS' }),
	);

	const rollback = runChild(
		`
			import cp from 'node:child_process';
			import fs from 'node:fs';
			import { syncBuiltinESMExports } from 'node:module';
			const spawn = cp.spawn, remove = fs.rmSync;
			let chrome, profile, removedBeforeExit = false;
			cp.spawn = (binary, args, options) => {
				const child = spawn(binary, args, options);
				const arg = args.find(arg => arg.startsWith('--user-data-dir='));
				if (arg) { chrome = child; profile = arg.slice('--user-data-dir='.length); }
				return child;
			};
			fs.rmSync = (path, options) => {
				if (path === profile && chrome.exitCode === null && chrome.signalCode === null) {
					removedBeforeExit = true;
					throw new Error('PROFILE_STILL_IN_USE');
				}
				return remove(path, options);
			};
			syncBuiltinESMExports();
			globalThis.WebSocket = class extends EventTarget {
				constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('error'))); }
			};
			const { launch } = await import(${JSON.stringify(RUNNER)});
			let message;
			try { await launch(); } catch (error) { message = error.message; }
			finally {
				if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
					chrome.kill('SIGKILL');
					await new Promise(resolve => chrome.once('exit', resolve));
				}
			}
			// The child NAMES its profile and does not delete it. Deleting here was
			// the harness defect: the row's own cleanup ran after the recreation and
			// erased the evidence its assertion depends on, turning an observed leak
			// into PASS. Cleanup moves to the parent, after evidence capture.
			if (profile) console.log('PROFILE ' + profile);
			console.log(message === 'CDP socket failed' && !removedBeforeExit ? 'PRESERVED' : 'WRONG ' + message);
		`,
		15000,
	);
	// Evidence BEFORE cleanup. The owned profile is identified by name rather
	// than inferred from a global count, so another row's directory can neither
	// create nor mask this verdict.
	const owned = /^PROFILE (.+)$/m.exec(rollback.stdout ?? '')?.[1] ?? null;
	const ownedSurvived = owned ? existsSync(owned) : null;
	let cleanupError = null;
	try {
		report(
			'BC-15',
			'FAULT',
			'a failed handshake waits for Chrome to exit and preserves its original error',
			[
				...faults('BC-15', rollback, { stdoutIncludes: 'PRESERVED' }),
				...(owned === null ? ['BC-15: the child did not report its profile path'] : []),
				...(ownedSurvived ? [`BC-15: the owned profile survived the rollback: ${owned}`] : []),
			],
		);
	} finally {
		// Emergency cleanup only. It runs after the verdict is recorded and can no
		// longer change it; its own failure is reported separately rather than
		// overwriting what was observed.
		if (owned) {
			try {
				rmSync(owned, { recursive: true, force: true });
			} catch (error) {
				cleanupError = error.message;
			}
		}
	}
	if (cleanupError) console.log(`WARN  BC-15 emergency cleanup failed: ${cleanupError}`);

	/**
	 * BC-16 / BC-17 / BC-18 — the NORMAL close path, which BC-15 does not reach.
	 *
	 * BC-15 exercises rollback (a failed handshake). The reachable teardown is
	 * `close()`, and review found it sent SIGTERM, waited at most five seconds,
	 * and then removed the profile whether or not Chrome had exited.
	 *
	 * WHAT THE INTERCEPTION IS. These rows replace the child's `kill` so the named
	 * signals are NEVER DELIVERED to a real, still-running Chrome. That is
	 * SIMULATED NON-DELIVERY, not a browser ignoring a signal it received: Chrome
	 * gets no SIGTERM in BC-16 and neither signal in BC-18. An earlier revision of
	 * this comment claimed "a REAL browser process ignores a REAL signal", which
	 * overstated it.
	 *
	 * WHAT THEY DO ESTABLISH — the RUNNER's behavior when the browser has not
	 * exited: the escalation to SIGKILL, the ordering of removal against a
	 * confirmed exit, the retain-on-doubt rule, and the propagation of a cleanup
	 * failure. The Chrome process is real and alive throughout, which is what
	 * makes BC-16's old-probe result meaningful: the profile was removed while
	 * that process was still running. BC-16's SIGKILL is delivered for real and
	 * does kill it; BC-17 intercepts no signal at all.
	 *
	 * They do NOT establish anything about Chrome's helper processes. Termination
	 * here is scoped to the direct child this launch owns; descendant behavior is
	 * out of what these controls can prove and is not claimed.
	 */
	const wedgedChildSource = (ignore, body) => `
		import cp from 'node:child_process';
		import fs from 'node:fs';
		import { syncBuiltinESMExports } from 'node:module';
		const spawnReal = cp.spawn, removeReal = fs.rmSync;
		let chrome = null, profile = null, killReal = null;
		const order = [];
		cp.spawn = (binary, args, options) => {
			const child = spawnReal(binary, args, options);
			const arg = args.find(a => String(a).startsWith('--user-data-dir='));
			if (arg) {
				chrome = child;
				profile = String(arg).slice('--user-data-dir='.length);
				killReal = child.kill.bind(child);
				child.kill = (signal) => {
					order.push('kill:' + signal);
					// Swallowed, never delivered: ${ignore.join(' and ') || 'nothing'}.
					if (${JSON.stringify(ignore)}.includes(signal)) return true;
					return killReal(signal);
				};
			}
			return child;
		};
		fs.rmSync = (path, options) => {
			if (path === profile) {
				order.push('rm:alive=' + (chrome.exitCode === null && chrome.signalCode === null));
				if (globalThis.__blockRemoval) throw new Error('REMOVAL_BLOCKED');
			}
			return removeReal(path, options);
		};
		syncBuiltinESMExports();
		const { launch } = await import(${JSON.stringify(RUNNER)});
		const page = await launch();
		if (!page) { console.log('NO-BROWSER'); process.exit(1); }
		try {
			${body}
		} finally {
			// The row's own cleanup, with the REAL primitives. It runs after every
			// verdict above is already printed, so it cannot change one.
			if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
				killReal('SIGKILL');
				await new Promise(resolve => chrome.once('exit', resolve));
			}
			if (profile) removeReal(profile, { recursive: true, force: true });
		}
	`;

	const escalation = runChild(
		wedgedChildSource(
			['SIGTERM'],
			`
			const started = Date.now();
			await page.close();
			const ms = Date.now() - started;
			const expected = 'kill:SIGTERM,kill:SIGKILL,rm:alive=false';
			console.log('ORDER ' + order.join(','));
			console.log(
				order.join(',') === expected && !fs.existsSync(profile) && ms >= 5000
					? 'ESCALATED'
					: 'WRONG ' + ms + 'ms exists=' + fs.existsSync(profile),
			);
		`,
		),
		60000,
	);
	report(
		'BC-16',
		'FAULT',
		`a SIGTERM that never reaches the browser is escalated to a delivered SIGKILL, and the profile is removed only after confirmed exit (${escalation.elapsedMs}ms)`,
		[
			...faults('BC-16', escalation, { expect: EXIT.PASS, underMs: 30000 }),
			...(escalation.stdout.includes('ESCALATED')
				? []
				: [`BC-16: teardown was ${escalation.stdout.split('\n').pop() || 'not observed'}`]),
		],
	);

	const removalFailure = runChild(
		wedgedChildSource(
			[],
			`
			globalThis.__blockRemoval = true;
			let message = null;
			try { await page.close(); } catch (error) { message = error.message; }
			globalThis.__blockRemoval = false;
			console.log('MESSAGE ' + (message ?? 'none'));
			console.log(
				message && message.includes('teardown failed') && message.includes('REMOVAL_BLOCKED')
					? 'SURFACED'
					: 'WRONG',
			);
		`,
		),
		60000,
	);
	report(
		'BC-17',
		'FAULT',
		'a profile that cannot be removed fails the teardown instead of warning (both signals delivered normally)',
		[
			...faults('BC-17', removalFailure, { expect: EXIT.PASS }),
			...(removalFailure.stdout.includes('SURFACED')
				? []
				: [`BC-17: teardown reported ${removalFailure.stdout.split('\n')[0] || 'nothing'}`]),
		],
	);

	const unconfirmed = runChild(
		wedgedChildSource(
			['SIGTERM', 'SIGKILL'],
			`
			let message = null;
			try { await page.close(); } catch (error) { message = error.message; }
			const removalAttempted = order.some(entry => entry.startsWith('rm:'));
			console.log('ORDER ' + order.join(',') + ' | ' + (message ?? 'no error'));
			console.log(
				message
					&& message.includes('did not exit')
					&& message.includes('profile retained')
					&& !removalAttempted
					&& fs.existsSync(profile)
					? 'RETAINED'
					: 'WRONG',
			);
		`,
		),
		90000,
	);
	report(
		'BC-18',
		'FAULT',
		`a browser that receives neither signal cannot be confirmed dead, so its profile is retained and the teardown fails (${unconfirmed.elapsedMs}ms)`,
		[
			...faults('BC-18', unconfirmed, { expect: EXIT.PASS, underMs: 45000 }),
			...(unconfirmed.stdout.includes('RETAINED')
				? []
				: [`BC-18: teardown was ${unconfirmed.stdout.split('\n').pop() || 'not observed'}`]),
		],
	);

	console.log(
		`\n${reported.length} controls: ${reported.filter(Boolean).length} behaved as specified`,
	);
	if (failures.length > 0) {
		for (const f of failures) console.log(`  ${f}`);
		return EXIT.FAIL;
	}
	return EXIT.PASS;
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(`ERROR ${error.message}`);
		process.exit(EXIT.ERROR);
	});
