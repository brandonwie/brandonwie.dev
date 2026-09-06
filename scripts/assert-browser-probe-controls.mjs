/**
 * migration:browser:controls — the runner's own negative controls.
 *
 * A probe that only ever passes proves nothing about the probe. These rows
 * execute the fault paths the runner advertises, so "the exit contract holds"
 * is a result rather than a claim. Every row here corresponds to a defect the
 * first spike revision actually had.
 *
 * Exit 0 all rows behaved as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-palette.mjs';

/** Profiles the runner may have left behind; the name prefix is its own. */
const profiles = () => {
	try {
		return readdirSync(tmpdir()).filter((n) => n.startsWith('browser-probe-'));
	} catch {
		return [];
	}
};

const servers = () =>
	spawnSync('pgrep', ['-f', 'serve-build.mjs'], { encoding: 'utf8' })
		.stdout.trim()
		.split('\n')
		.filter(Boolean);

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
];

function runRow(row) {
	const before = { profiles: profiles().length, servers: servers().length };
	const result = spawnSync(process.execPath, [PROBE, ...(row.args ?? [])], {
		env: { ...process.env, ...row.env },
		encoding: 'utf8',
	});
	const after = { profiles: profiles().length, servers: servers().length };
	return { code: result.status, before, after };
}

/**
 * R2's control: an IMPORTING caller must exit on its own.
 *
 * The CLI calls `process.exit`, which masks a live handle. A suite that imports
 * the runner has no such escape — an uncleared timer keeps its process alive
 * long past teardown. This spawns a child that imports, launches, closes, and
 * then must exit naturally well inside the timer window.
 */
function naturalExitRow() {
	const source = `
		import { launch } from './scripts/browser-probe.mjs';
		const page = await launch();
		if (page) await page.close();
		// No process.exit: if a timer is still armed, this child outlives the wait.
	`;
	const started = Date.now();
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
		encoding: 'utf8',
		timeout: 12000,
	});
	return {
		elapsedMs: Date.now() - started,
		code: child.status,
		timedOut: child.error?.code === 'ETIMEDOUT',
	};
}

/** R3's control: a throwing page expression must be a harness error, not `false`. */
async function evaluateThrowRow() {
	const source = `
		import { launch, evaluate } from './scripts/browser-probe.mjs';
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
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
		encoding: 'utf8',
		timeout: 30000,
	});
	return (child.stdout ?? '').trim();
}

async function main() {
	if (!findBrowser()) {
		console.log('SKIP  no browser; the control suite cannot distinguish its rows');
		return EXIT.SKIPPED;
	}

	const failures = [];
	for (const row of ROWS) {
		const { code, before, after } = runRow(row);
		const ok = code === row.expect;
		const leakedProfile = after.profiles > before.profiles;
		const leakedServer = after.servers > before.servers;
		const clean = !leakedProfile && !leakedServer;
		if (!ok) failures.push(`${row.id}: exit ${code}, expected ${row.expect}`);
		if (!clean) {
			failures.push(
				`${row.id}: leaked ${[leakedProfile && 'a profile', leakedServer && 'a server'].filter(Boolean).join(' and ')}`,
			);
		}
		console.log(
			`${ok && clean ? 'PASS' : 'FAIL'}  ${row.id}  ${row.kind.padEnd(10)} exit ${code} (expected ${row.expect})  ${clean ? 'no leak' : 'LEAKED'}  ${row.what}`,
		);
	}

	const natural = naturalExitRow();
	const naturalOk = !natural.timedOut && natural.elapsedMs < 12000;
	if (!naturalOk) failures.push('BC-07: an importing caller did not exit on its own');
	console.log(
		`${naturalOk ? 'PASS' : 'FAIL'}  BC-07  IMPORTED   exited in ${natural.elapsedMs}ms without process.exit  an uncleared timer would hold the loop`,
	);

	const propagation = await evaluateThrowRow();
	const propagationOk = propagation === 'PROPAGATED';
	if (!propagationOk) failures.push(`BC-08: page exception was ${propagation || 'not observed'}`);
	console.log(
		`${propagationOk ? 'PASS' : 'FAIL'}  BC-08  FAULT      a throwing page expression surfaces as a harness error, not a falsy value`,
	);

	const total = ROWS.length + 2;
	console.log(`\n${total} controls: ${total - failures.length} behaved as specified`);
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
