/**
 * migration:browser:motion:controls — negative and invariance controls for motion browser probe.
 *
 * Proves the keyed-motion probe fails closed under defect injection and
 * verifies lifecycle ordering properties:
 *   - BMC-01: Defect control — stale scroll measurement fails BM-02 (exit 1)
 *   - BMC-02: Defect control — omitted mid-flight abort fails BM-03 (exit 1)
 *   - BMC-03: Invariance control — unmutated motion probe passes all 5 rows (exit 0)
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-motion.mjs';

const CONTROLS = [
	{
		id: 'BMC-01',
		kind: 'DEFECT',
		what: 'stale scroll measurement (pre-mutation measurement failure) is caught by BM-02',
		args: ['--stale-scroll'],
		expect: EXIT.FAIL,
		expectedFailure: 'BM-02',
	},
	{
		id: 'BMC-02',
		kind: 'DEFECT',
		what: 'omitted mid-flight abort (lifecycle ordering failure) is caught by BM-03',
		args: ['--no-abort'],
		expect: EXIT.FAIL,
		expectedFailure: 'BM-03',
	},
	{
		id: 'BMC-03',
		kind: 'INVARIANCE',
		what: 'unmutated motion probe runs and passes all 5 rows',
		args: [],
		expect: EXIT.PASS,
	},
];

function runControl(control) {
	const res = spawnSync(process.execPath, [PROBE, ...control.args], {
		encoding: 'utf8',
		timeout: 60000,
	});

	const code = res.status;
	const expectedRowFailed =
		!control.expectedFailure ||
		(typeof res.stdout === 'string' && res.stdout.includes(`FAIL  ${control.expectedFailure}`));
	const ok = code === control.expect && expectedRowFailed;
	const detail = ok
		? `exited ${code} as expected${control.expectedFailure ? ` (verified ${control.expectedFailure} failed)` : ''}`
		: `expected exit ${control.expect}${control.expectedFailure ? ` with ${control.expectedFailure} fail` : ''}, got ${code}${
				res.error ? ` (spawn error: ${res.error.message})` : ''
			}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`;

	console.log(
		`${ok ? 'PASS' : 'FAIL'}  ${control.id}  [${control.kind}] ${control.what} (${detail})`,
	);
	return ok;
}

function main() {
	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; set CHROME_BINARY to point at one');
		return EXIT.SKIPPED;
	}

	console.log(`Executing ${CONTROLS.length} motion browser probe controls...\n`);
	let passed = 0;
	for (const control of CONTROLS) {
		if (runControl(control)) passed++;
	}

	console.log(`\n${CONTROLS.length} controls: ${passed} behaved as specified`);
	return passed === CONTROLS.length ? EXIT.PASS : EXIT.FAIL;
}

const exitCode = main();
process.exit(exitCode);
