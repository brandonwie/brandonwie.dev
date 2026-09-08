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
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	writeFileSync,
	readFileSync,
	readdirSync,
	existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/**
 * BC-15a's fault set: faults() minus the profile-leak complaint.
 *
 * `leakedProfile` is an inventory COUNT DELTA over the whole temp directory
 * (`observe` above), so it fires when ANY process creates a `browser-probe-*`
 * root during the run -- including the Chrome helper that re-created one
 * 3.8 ms after a removal that had already succeeded. That observation is real
 * and is KEPT, but it belongs to BC-15b. Letting it reach BC-15a would
 * re-import the exact helper-timing dependence the split exists to remove.
 * Everything else still fails BC-15a, `inventoryError` included: "leak state
 * unknown" is not a pass for either row.
 */
const faultsWithoutProfileLeak = (id, o, opts) => faults(id, { ...o, leakedProfile: false }, opts);

/**
 * The rollback child, parameterized by ONE dependency fault.
 *
 * `failRemoval` makes the real removal throw BENEATH the recording observer.
 * The runner's logic is untouched: it still issues the removal, `removeProfile`
 * still catches and returns its reason, and `rollback` still warns. A fault
 * injected INTO the observer would not be a fault at all -- it would be a
 * modified assertion, and a control built on one proves nothing about the
 * assertion it claims to exercise.
 *
 * `runnerHref` is the module the child imports: the real runner, or a
 * source-level mutant of it.
 */
const rollbackChild = (runnerHref, { failRemoval = false } = {}) => `
	import cp from 'node:child_process';
	import fs from 'node:fs';
	import { syncBuiltinESMExports } from 'node:module';
	const FAIL_REMOVAL = ${failRemoval ? 'true' : 'false'};
	const spawn = cp.spawn, remove = fs.rmSync;
	let chrome, profile, issued = false, removedBeforeExit = false, removalFailed = false;
	cp.spawn = (binary, args, options) => {
		const child = spawn(binary, args, options);
		const arg = args.find(arg => arg.startsWith('--user-data-dir='));
		if (arg) { chrome = child; profile = arg.slice('--user-data-dir='.length); }
		return child;
	};
	fs.rmSync = (path, options) => {
		if (path !== profile) return remove(path, options);
		// RECORD FIRST, before anything below can throw. ISSUED means the runner
		// CALLED the removal, never that the call succeeded -- that is RESULT's
		// job. Recording after a throw would quietly redefine ISSUED as "removal
		// completed", and a thrown call would read as a call that never happened.
		issued = true;
		if (!chrome || (chrome.exitCode === null && chrome.signalCode === null)) {
			removedBeforeExit = true;
			removalFailed = true;
			throw new Error('PROFILE_STILL_IN_USE');
		}
		if (FAIL_REMOVAL) { removalFailed = true; throw new Error('REMOVAL_FAILED_FIXTURE'); }
		// The DELEGATED call's own outcome, recorded here and nowhere else. Reading
		// the runner's \`console.warn\` instead would make RESULT an assertion about
		// LOGGING: a runner whose removal threw while its warning was suppressed
		// would pass. That was a real defect in the first revision of this row.
		try {
			return remove(path, options);
		} catch (error) {
			removalFailed = true;
			throw error;
		}
	};
	syncBuiltinESMExports();
	globalThis.WebSocket = class extends EventTarget {
		constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('error'))); }
	};
	const { launch } = await import(${JSON.stringify(runnerHref)});
	let message;
	try { await launch(); } catch (error) { message = error.message; }
	finally {
		if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
			chrome.kill('SIGKILL');
			await new Promise(resolve => chrome.once('exit', resolve));
		}
	}
	// The child NAMES its profile and does not delete it. Deleting here was the
	// harness defect: the row's own cleanup ran after the recreation and erased
	// the evidence its assertion depends on, turning an observed leak into PASS.
	// Cleanup moves to the parent, after evidence capture.
	if (profile) console.log('PROFILE ' + profile);
	console.log('ISSUED ' + issued);
	console.log('ORDER ' + !removedBeforeExit);
	console.log('RESULT ' + !removalFailed);
	console.log('ERROR ' + message);
`;

/** What one rollback run OBSERVED. Read from the child's markers, never inferred. */
const rollbackObservations = (o) => {
	const read = (key) => new RegExp('^' + key + ' (.*)$', 'm').exec(o.stdout ?? '')?.[1] ?? null;
	const markers = {
		ISSUED: read('ISSUED'),
		ORDER: read('ORDER'),
		RESULT: read('RESULT'),
		ERROR: read('ERROR'),
	};
	return {
		profile: read('PROFILE'),
		issued: markers.ISSUED === 'true',
		order: markers.ORDER === 'true',
		result: markers.RESULT === 'true',
		error: markers.ERROR,
		warned: (o.stderr ?? '').includes('WARN  rollback cleanup:'),
		missing: Object.keys(markers).filter((key) => markers[key] === null),
	};
};

/**
 * BC-15a's contract, judged against one witness.
 *
 * W-1 -- unmutated, the removal succeeds: RESULT is asserted and no cleanup
 * warning may appear. W-2 -- the removal fails beneath the observer: RESULT is
 * NOT asserted, because demanding that a forced failure both fail and not fail
 * is not a contract; NOT-REPLACED is asserted instead, so the caller still sees
 * the LAUNCH error with the teardown failure reported ALONGSIDE it.
 *
 * ISSUED is invocation, not completion. ORDER is the absence of a removal
 * attempted before the exit was confirmed. A runner that never removes anything
 * fails ISSUED and passes ORDER, which is exactly the distinction the old
 * single row could not draw.
 */
const rollbackContractFaults = (id, o, witness) => {
	const r = rollbackObservations(o);
	const out = [...faultsWithoutProfileLeak(id, o, {})];
	if (r.profile === null) out.push(`${id}: the child did not report its profile path`);
	if (r.error !== 'CDP socket failed') {
		out.push(
			`${id}: ERROR the caller saw ${JSON.stringify(r.error)}, expected "CDP socket failed"`,
		);
	}
	if (!r.issued) out.push(`${id}: ISSUED the rollback never called rmSync on its own profile`);
	if (!r.order) out.push(`${id}: ORDER the profile was removed before Chrome's exit was confirmed`);
	if (witness === 'W-1' && !r.result) {
		out.push(`${id}: RESULT a removal call the runner issued did not succeed`);
	}
	if (witness === 'W-1' && r.warned) {
		out.push(`${id}: REPORTED a clean rollback still printed "WARN  rollback cleanup:"`);
	}
	if (witness === 'W-2' && !r.warned) {
		out.push(
			`${id}: REPORTED the injected teardown failure printed no "WARN  rollback cleanup:" line, so it did not travel alongside the launch error`,
		);
	}
	return out;
};

/** The assertion labels a complaint can carry. Anything else is unclassified. */
const CONTRACT_LABELS = ['ERROR', 'ISSUED', 'ORDER', 'RESULT', 'REPORTED'];
const labelOf = (id, complaint) => {
	const word = complaint.slice(`${id}: `.length).split(' ')[0];
	return CONTRACT_LABELS.includes(word) ? word : 'UNCLASSIFIED';
};

/**
 * Is this run worth judging at all?
 *
 * A control that judges a run which never happened proves nothing: a child that
 * died with empty output produces missing markers, and missing markers read as
 * false, and false trips whichever assertion the control was hoping to see. So
 * a mutant is judged ONLY after its run is shown to be observable -- the
 * process behaved, the inventory succeeded, and every marker arrived.
 */
const observable = (id, o, r) => {
	const out = [];
	if (o.timedOut) out.push(`${id}: had to be killed after ${o.elapsedMs}ms`);
	if (o.signal) out.push(`${id}: died on ${o.signal}`);
	if (o.code !== EXIT.PASS) out.push(`${id}: exit ${o.code}, expected ${EXIT.PASS}`);
	if (o.inventoryError) out.push(`${id}: post-run inventory failed: ${o.inventoryError}`);
	if (o.leakedServer) out.push(`${id}: leaked a server process`);
	if (r.profile === null) out.push(`${id}: the child did not report its profile path`);
	if (r.missing.length > 0) out.push(`${id}: the child reported no ${r.missing.join(', ')} marker`);
	return out;
};

/**
 * One mutant or witness, judged.
 *
 * `primary` is the complaint the control exists to produce; `permitted` are the
 * consequences its mutation unavoidably drags along. Anything outside that set
 * is a failure, because a control that quietly accepts extra complaints stops
 * discriminating between the assertions it is supposed to separate.
 */
const control = (id, o, witness, { primary, permitted = [] }) => {
	const r = rollbackObservations(o);
	const unusable = observable(id, o, r);
	if (unusable.length > 0) {
		return [`${id}: the run is not observable, so it judges nothing`, ...unusable];
	}
	const complaints = rollbackContractFaults(id, o, witness);
	const labels = complaints.map((c) => labelOf(id, c));
	const allowed = new Set([primary, ...permitted]);
	const out = [];
	if (!labels.includes(primary)) {
		out.push(
			`${id}: expected the ${primary} complaint; got ${complaints.length === 0 ? 'a clean pass' : complaints.join(' | ')}`,
		);
	}
	complaints.forEach((c, i) => {
		if (!allowed.has(labels[i])) out.push(`${id}: unexpected complaint -- ${c}`);
	});
	return out;
};

const RUNNER_SOURCE = readFileSync(fileURLToPath(RUNNER), 'utf8');

/**
 * A source-level mutant of the runner.
 *
 * `rollback`, `removeProfile`, `terminate` and `waitForExit` are closures inside
 * `launch()` and are NOT exported, so changing what the runner DOES cannot be a
 * monkey-patch from the child -- it has to be a different module. Two guards,
 * from the FP-02 lesson recorded in `migration-route-controls.ts`: the anchor
 * must match EXACTLY once and must key on code rather than comment wording, and
 * the result must differ from the original. A byte change proves the mutation
 * was APPLIED; only the required complaint proves behavior changed.
 */
const mutantRunner = (id, find, replace) => {
	const occurrences = RUNNER_SOURCE.split(find).length - 1;
	if (occurrences !== 1) {
		throw new Error(`${id}: mutation anchor matched ${occurrences} sites, expected exactly 1`);
	}
	const mutated = RUNNER_SOURCE.split(find).join(replace);
	if (mutated === RUNNER_SOURCE) throw new Error(`${id}: mutation changed no bytes`);
	const dir = mkdtempSync(join(tmpdir(), 'bc15-mutant-'));
	writeFileSync(join(dir, 'browser-probe.mjs'), mutated);
	return { href: pathToFileURL(join(dir, 'browser-probe.mjs')).href, dir };
};

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

	// ---------------------------------------------------------------------------
	// BC-15a / BC-15b -- the split, and why it is not a narrowing.
	//
	// BC-15 used to bundle three unlike claims into one verdict: the launch error
	// survives, no removal was attempted before Chrome's exit was confirmed, and
	// no profile root exists afterwards. Only the third depends on a process
	// whose relationship to this runner is unresolved -- a traced capture
	// attributed one recreation to `Google Chrome Helper (Alerts)`, 3.8 ms after
	// a removal that had itself succeeded, with ancestry and controllability
	// unknown.
	//
	// The split does NOT redefine that leak into a pass. BC-15b still FAILS on a
	// surviving root, still returns exit 1, and still blocks the push and CI. It
	// stands until the residue is repaired or explicitly accepted.
	//
	// What changes is the other half. Error preservation and ordering never
	// tested that the rollback removed ANYTHING: `removeProfile` swallows a
	// failure into a return value and `rollback` turns that into a `console.warn`
	// and nothing else, so a runner that skipped removal entirely still produced
	// PRESERVED and only the absence check noticed. BC-15a now asserts ISSUED and
	// RESULT explicitly, which is what makes the split a split rather than
	// option 2 under a different name.
	//
	// ONE child run feeds both rows: the split is in the JUDGING, not a second
	// launch, so it cannot yield two opinions about one rollback.
	const cleanupWarnings = [];
	const discard = (label, path) => {
		if (!path) return;
		try {
			rmSync(path, { recursive: true, force: true });
		} catch (error) {
			cleanupWarnings.push(`${label} emergency cleanup failed: ${error.message}`);
		}
	};

	const rollback = runChild(rollbackChild(RUNNER), 15000);
	const observed = rollbackObservations(rollback);
	// Evidence BEFORE cleanup. The owned profile is identified by name rather
	// than inferred from a global count, so another row's directory can neither
	// create nor mask this verdict.
	const ownedSurvived = observed.profile ? existsSync(observed.profile) : null;
	try {
		report(
			'BC-15a',
			'FAULT',
			'a failed handshake waits for Chrome to exit, ISSUES the removal, and preserves its original error',
			rollbackContractFaults('BC-15a', rollback, 'W-1'),
		);
		report(
			'BC-15b',
			'FAULT',
			'no profile root survives the rollback -- fails until repaired or explicitly accepted',
			[
				...(observed.profile === null ? ['BC-15b: the child did not report its profile path'] : []),
				...(rollback.inventoryError
					? [`BC-15b: post-run inventory failed, leak state unknown: ${rollback.inventoryError}`]
					: []),
				...(rollback.leakedProfile ? ['BC-15b: leaked a profile directory'] : []),
				...(ownedSurvived
					? [`BC-15b: the owned profile survived the rollback: ${observed.profile}`]
					: []),
			],
		);
	} finally {
		// Emergency cleanup only. It runs after both verdicts are recorded and can
		// no longer change them; its own failure is reported separately rather than
		// overwriting what was observed. An empty root is NOT treated as quiescent
		// anywhere above -- BC-15b judged existence, not contents.
		discard('BC-15', observed.profile);
	}

	/**
	 * The witness and mutant set for BC-15a.
	 *
	 * Four failing mutants would prove only that the row CAN fail; FP-E and W-2
	 * are what prove it can PASS for the right reason. Each mutant names the one
	 * complaint it must produce: a mutant that trips only a sibling assertion
	 * means the assertions overlap and one of them is not carrying its weight.
	 *
	 * Launches: FP-E reuses the run above, W-2 is one run reused by FP-D, and
	 * FP-A / FP-B / FP-C are one each. Four added, not five.
	 */
	// Offline judge regressions. These launch nothing: they feed the judges a
	// synthesized observation and assert the judges themselves behave. Both cover
	// a defect this file actually had.
	report(
		'JG-01',
		'CONTROL',
		'RESULT is observed from the removal call, not inferred from the runner printing a warning',
		(() => {
			const suppressed = {
				code: EXIT.PASS,
				signal: null,
				timedOut: false,
				elapsedMs: 1,
				inventoryError: null,
				leakedProfile: false,
				leakedServer: false,
				stdout: [
					'PROFILE /tmp/browser-probe-JG01',
					'ISSUED true',
					'ORDER true',
					'RESULT false',
					'ERROR CDP socket failed',
				].join('\n'),
				// The warning is SUPPRESSED on purpose: the removal failed and the
				// runner said nothing about it.
				stderr: '',
			};
			const complaints = rollbackContractFaults('JG-01', suppressed, 'W-1');
			return complaints.some((c) => labelOf('JG-01', c) === 'RESULT')
				? []
				: [
						`JG-01: a failed removal with its warning suppressed was accepted; got ${complaints.length === 0 ? 'a clean pass' : complaints.join(' | ')}`,
					];
		})(),
	);

	const brokenChild = {
		code: EXIT.FAIL,
		signal: null,
		timedOut: false,
		elapsedMs: 1,
		inventoryError: null,
		leakedProfile: false,
		leakedServer: false,
		stdout: '',
		stderr: '',
	};
	report(
		'JG-02',
		'CONTROL',
		'a mutant whose child died with no output is rejected as unobservable rather than credited with its expected complaint',
		(() => {
			const bad = [
				...control('FP-A', brokenChild, 'W-1', { primary: 'ISSUED' }),
				...control('FP-C', brokenChild, 'W-2', { primary: 'ERROR', permitted: ['REPORTED'] }),
			];
			return bad.length > 0
				? []
				: ['JG-02: a dead child with empty output was accepted as a passing control'];
		})(),
	);

	/**
	 * The witness and mutant set for BC-15a.
	 *
	 * Four failing mutants would prove only that the row CAN fail; FP-E and W-2
	 * are what prove it can PASS for the right reason. Each mutant names the ONE
	 * complaint it exists to produce and the consequences its mutation drags
	 * along; anything outside that set fails the control, so the assertions stay
	 * discriminating rather than overlapping.
	 *
	 * The plan called FP-C's assertion NOT-REPLACED. In code it is two separate
	 * labels -- ERROR (the caller still sees the launch error) and REPORTED (the
	 * teardown failure travels alongside it) -- because one conjunction spanning
	 * both would overlap ERROR and defeat the permitted-set check above. Strictly
	 * more discriminating, same contract.
	 *
	 * Launches: FP-E reuses the run above, W-2 is one run reused by FP-D, and
	 * FP-A / FP-B / FP-C are one each. Four added, not five.
	 */
	report(
		'FP-E',
		'WITNESS',
		'W-1: the unmutated runner passes the rollback contract (same run as BC-15a)',
		rollbackContractFaults('FP-E', rollback, 'W-1'),
	);

	// W-2. The removal fails BENEATH the recorder, so the runner still issues it,
	// its own failure is observed directly, and the runner still reports it
	// alongside the launch error. RESULT is not asserted here; REPORTED is.
	const failingRemoval = runChild(rollbackChild(RUNNER, { failRemoval: true }), 15000);
	const failingObserved = rollbackObservations(failingRemoval);
	try {
		report(
			'W-2',
			'WITNESS',
			'W-2: a removal that fails beneath the observer still preserves the launch error and reports the teardown failure alongside it',
			rollbackContractFaults('W-2', failingRemoval, 'W-2'),
		);
		// FP-D needs no mutation at all: the SAME run, judged under W-1
		// expectations, must produce RESULT. That is what makes RESULT non-vacuous.
		// Replacing the rmSync call site with a throw -- the obvious mutation --
		// would leave the recorder with zero calls, so it would trip ISSUED while
		// claiming to discriminate RESULT.
		report(
			'FP-D',
			'CONTROL',
			'a removal that fails is caught by RESULT when the W-2 run is judged as W-1',
			control('FP-D', failingRemoval, 'W-1', { primary: 'RESULT', permitted: ['REPORTED'] }),
		);
	} finally {
		discard('W-2', failingObserved.profile);
	}

	// FP-A -- the rollback stops removing anything. This is the regression the old
	// BC-15 could not see: error, ordering and result all still hold.
	const skipRemoval = mutantRunner('FP-A', '? removeProfile()', '? null');
	const skipped = runChild(rollbackChild(skipRemoval.href), 15000);
	const skippedObserved = rollbackObservations(skipped);
	try {
		report(
			'FP-A',
			'CONTROL',
			'a rollback that never issues the removal is caught by ISSUED, and by nothing else',
			control('FP-A', skipped, 'W-1', { primary: 'ISSUED' }),
		);
	} finally {
		discard('FP-A', skippedObserved.profile);
		discard('FP-A mutant', skipRemoval.dir);
	}

	// FP-B -- the removal is issued BEFORE the exit is confirmed. ISSUED must hold:
	// the runner did call rmSync with its profile path, and the observer records
	// that before the ordering trap throws. RESULT and REPORTED follow from the
	// caught throw and are permitted consequences.
	const earlyRemoval = mutantRunner(
		'FP-B',
		'const failure = (await waitForExit(5000))',
		'const early = removeProfile();\n\t\tif (early) console.warn(`WARN  rollback cleanup: ${early}`);\n\t\tconst failure = (await waitForExit(5000))',
	);
	const early = runChild(rollbackChild(earlyRemoval.href), 15000);
	const earlyObserved = rollbackObservations(early);
	try {
		report(
			'FP-B',
			'CONTROL',
			'a removal issued before the exit is confirmed is caught by ORDER, with ISSUED still holding',
			control('FP-B', early, 'W-1', { primary: 'ORDER', permitted: ['RESULT', 'REPORTED'] }),
		);
	} finally {
		discard('FP-B', earlyObserved.profile);
		discard('FP-B mutant', earlyRemoval.dir);
	}

	// FP-C -- the teardown failure REPLACES the launch error instead of travelling
	// alongside it. Needs W-2's fixture, because a teardown that cannot fail has
	// nothing to replace anything with. REPORTED trips too: the warning it would
	// have printed is exactly what the mutation turned into a throw.
	const replacingError = mutantRunner(
		'FP-C',
		'console.warn(`WARN  rollback cleanup: ${failure}`)',
		'(() => { throw new Error(failure); })()',
	);
	const replaced = runChild(rollbackChild(replacingError.href, { failRemoval: true }), 15000);
	const replacedObserved = rollbackObservations(replaced);
	try {
		report(
			'FP-C',
			'CONTROL',
			'a teardown failure that replaces the launch error is caught by ERROR',
			control('FP-C', replaced, 'W-2', { primary: 'ERROR', permitted: ['REPORTED'] }),
		);
	} finally {
		discard('FP-C', replacedObserved.profile);
		discard('FP-C mutant', replacingError.dir);
	}

	for (const warning of cleanupWarnings) console.log(`WARN  ${warning}`);

	/**
	 * BC-16 / BC-17 / BC-18 — the NORMAL close path, which BC-15a and BC-15b do not reach.
	 *
	 * BC-15a and BC-15b exercise rollback (a failed handshake). The reachable teardown is
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
