/**
 * migration:browser:ac7:controls — negative and invariance controls for the
 * AC7 capture probe.
 *
 *   - BAC-01: Defect control — an injected console error fails V-01 (exit 1)
 *   - BAC-02: Defect control — injected min-width overflow fails V-01 (exit 1)
 *   - BAC-03: Defect control — suppressed arrow keys fail K-NEXT (exit 1)
 *   - BAC-04: Defect control — a no-op'd video.pause() fails D-VID-3 (exit 1)
 *   - BAC-05: Defect control — dropped status observations fail V-01 (exit 1)
 *   - BAC-06: Invariance control — unmutated probe passes all 19 rows (exit 0)
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-ac7.mjs';

const CONTROLS = [
	{
		id: 'BAC-01',
		kind: 'DEFECT',
		what: 'an injected console error is caught by V-01',
		args: ['--inject-console-error'],
		expect: EXIT.FAIL,
		expectedFailure: 'V-01',
	},
	{
		id: 'BAC-02',
		kind: 'DEFECT',
		what: 'an injected min-width is caught as horizontal overflow by V-01',
		args: ['--inject-overflow'],
		expect: EXIT.FAIL,
		expectedFailure: 'V-01',
	},
	{
		id: 'BAC-03',
		kind: 'DEFECT',
		what: 'suppressed arrow keys are caught by K-NEXT',
		args: ['--suppress-deck-keys'],
		expect: EXIT.FAIL,
		expectedFailure: 'K-NEXT',
	},
	{
		id: 'BAC-04',
		kind: 'DEFECT',
		what: 'a no-op video.pause() is caught by D-VID-3',
		args: ['--suppress-video-pause'],
		expect: EXIT.FAIL,
		expectedFailure: 'D-VID-3',
	},
	{
		id: 'BAC-05',
		kind: 'DEFECT',
		what: 'dropped status observations are caught by V-01',
		args: ['--drop-status-responses'],
		expect: EXIT.FAIL,
		expectedFailure: 'V-01',
	},
	{
		id: 'BAC-06',
		kind: 'INVARIANCE',
		what: 'unmutated ac7 probe runs and passes all 19 rows',
		args: [],
		expect: EXIT.PASS,
		expectStdout: '19 rows: 19 passed',
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
	const summarySeen =
		!control.expectStdout ||
		(typeof res.stdout === 'string' && res.stdout.includes(control.expectStdout));

	const ok = code === control.expect && expectedRowFailed && summarySeen;
	const detail =
		`exit ${code ?? res.error?.message} (want ${control.expect})` +
		(control.expectedFailure ? `, FAIL ${control.expectedFailure} seen=${expectedRowFailed}` : '') +
		(control.expectStdout ? `, summary seen=${summarySeen}` : '');
	return { ok, detail, stdout: res.stdout };
}

async function main() {
	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; set CHROME_BINARY to point at one');
		return EXIT.SKIPPED;
	}

	const results = [];
	for (const control of CONTROLS) {
		const { ok, detail } = runControl(control);
		results.push(ok);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind}: ${control.what} — ${detail}`,
		);
	}

	const passed = results.filter(Boolean).length;
	console.log(`\n${CONTROLS.length} controls: ${passed} passed`);
	return passed === CONTROLS.length ? EXIT.PASS : EXIT.FAIL;
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(`ERROR ${error.message}`);
		process.exit(EXIT.ERROR);
	});
