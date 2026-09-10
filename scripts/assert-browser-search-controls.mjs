/**
 * migration:browser:search:controls — negative and invariance controls for search browser probe.
 *
 * Proves the C10 search browser probe fails closed under defect injection and
 * behaves as specified across scenarios S3, S4, S5:
 *   - BSC-01: S3 positive — broken runtime reports load error, not dev mode (exit 0)
 *   - BSC-02: S3 defect — broken runtime masked as dev mode fails (exit 1)
 *   - BSC-03: S4 positive — malformed row reported as defect, not normal item (exit 0)
 *   - BSC-04: S4 defect — malformed row masked as normal item fails (exit 1)
 *   - BSC-05: S5 positive — thrown query distinguishable from empty results (exit 0)
 *   - BSC-06: S5 defect — thrown query masked as empty results fails (exit 1)
 *   - BSC-07: Gate control — search readiness marker suppressed fails (exit 1)
 *   - BSC-08: Assertion control — search input event suppressed fails (exit 1)
 *   - BSC-09: Invariance control — unmutated search probe passes all rows (exit 0)
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-search.mjs';

const CONTROLS = [
	{
		id: 'BSC-01',
		kind: 'INVARIANCE',
		what: 'S3: broken runtime load reports load error and is not disguised as dev mode',
		args: ['--broken-runtime'],
		expect: EXIT.PASS,
	},
	{
		id: 'BSC-02',
		kind: 'DEFECT',
		what: 'S3 defect: broken runtime disguised as dev mode is caught as a defect',
		args: ['--broken-runtime', '--mask-dev-mode'],
		expect: EXIT.FAIL,
	},
	{
		id: 'BSC-03',
		kind: 'INVARIANCE',
		what: 'S4: malformed index row is reported as a defect rather than rendered as normal result',
		args: ['--malformed-row'],
		expect: EXIT.PASS,
	},
	{
		id: 'BSC-04',
		kind: 'DEFECT',
		what: 'S4 defect: malformed index row rendered as normal item is caught as a defect',
		args: ['--malformed-row', '--mask-malformed'],
		expect: EXIT.FAIL,
	},
	{
		id: 'BSC-05',
		kind: 'INVARIANCE',
		what: 'S5: query execution failure is distinguishable from empty results',
		args: ['--throw-query'],
		expect: EXIT.PASS,
	},
	{
		id: 'BSC-06',
		kind: 'DEFECT',
		what: 'S5 defect: query execution failure masked as empty results is caught as a defect',
		args: ['--throw-query', '--mask-query-error'],
		expect: EXIT.FAIL,
	},
	{
		id: 'BSC-07',
		kind: 'DEFECT',
		what: 'readiness gate: suppressed search-ready marker fails the probe',
		args: ['--suppress-ready'],
		expect: EXIT.FAIL,
	},
	{
		id: 'BSC-08',
		kind: 'DEFECT',
		what: 'search event: suppressed input dispatch fails the probe',
		args: ['--suppress-search'],
		expect: EXIT.FAIL,
	},
	{
		id: 'BSC-09',
		kind: 'INVARIANCE',
		what: 'unmutated probe runs and passes all 9 rows',
		args: [],
		expect: EXIT.PASS,
	},
];

function runControl(control) {
	const res = spawnSync(process.execPath, [PROBE, ...control.args], {
		encoding: 'utf8',
		timeout: 30000,
	});

	const code = res.status;
	const ok = code === control.expect;
	const detail = ok
		? `exited ${code} as expected`
		: `expected exit ${control.expect}, got ${code}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`;

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

	console.log(`Executing ${CONTROLS.length} search browser probe controls...\n`);
	let passed = 0;
	for (const control of CONTROLS) {
		if (runControl(control)) passed++;
	}

	console.log(`\n${CONTROLS.length} controls: ${passed} behaved as specified`);
	return passed === CONTROLS.length ? EXIT.PASS : EXIT.FAIL;
}

const exitCode = main();
process.exit(exitCode);
