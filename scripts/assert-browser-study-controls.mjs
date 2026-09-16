/**
 * migration:browser:study:controls — negative and invariance controls for the
 * study-routes browser probe.
 *
 *   - BSC-01: Defect control — an injected console error fails S-01 (exit 1)
 *   - BSC-02: Defect control — a no-op stepper fails S-02 (exit 1)
 *   - BSC-03: Invariance control — unmutated probe passes all 12 rows (exit 0)
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-study.mjs';

const CONTROLS = [
	{
		id: 'BSC-01',
		kind: 'DEFECT',
		what: 'an injected console error is caught by S-01',
		args: ['--inject-console-error'],
		expect: EXIT.FAIL,
		expectedFailure: 'S-01',
	},
	{
		id: 'BSC-02',
		kind: 'DEFECT',
		what: 'a no-op stepper is caught by S-02',
		args: ['--skip-step-click'],
		expect: EXIT.FAIL,
		expectedFailure: 'S-02',
	},
	{
		id: 'BSC-03',
		kind: 'INVARIANCE',
		what: 'unmutated study probe runs and passes all 12 rows',
		args: [],
		expect: EXIT.PASS,
	},
];

function runControl(control) {
	const res = spawnSync(process.execPath, [PROBE, ...control.args], {
		encoding: 'utf8',
		timeout: 300000,
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

	console.log(`Executing ${CONTROLS.length} study browser probe controls...\n`);
	let passed = 0;
	for (const control of CONTROLS) {
		if (runControl(control)) passed++;
	}

	console.log(`\n${CONTROLS.length} controls: ${passed} behaved as specified`);
	return passed === CONTROLS.length ? EXIT.PASS : EXIT.FAIL;
}

process.exit(main());
