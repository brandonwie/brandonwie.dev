/**
 * migration:browser:xyflow:controls — negative and invariance controls for the
 * xyflow browser probe.
 *
 *   - BXC-01: Defect control — an injected console error fails X-EN-mount (exit 1)
 *   - BXC-02: Defect control — a DOM-hidden MiniMap fails X-EN-mount (exit 1)
 *   - BXC-03: Invariance control — unmutated probe passes all 12 rows (exit 0)
 *   - BXC-04: Defect control — dropped status observations fail X-EN-mount (exit 1)
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-xyflow.mjs';

const CONTROLS = [
	{
		id: 'BXC-01',
		kind: 'DEFECT',
		what: 'an injected console error is caught by X-EN-mount',
		args: ['--inject-console-error'],
		expect: EXIT.FAIL,
		expectedFailure: 'X-EN-mount',
	},
	{
		id: 'BXC-02',
		kind: 'DEFECT',
		what: 'a DOM-hidden MiniMap is caught by X-EN-mount',
		args: ['--hide-minimap'],
		expect: EXIT.FAIL,
		expectedFailure: 'X-EN-mount',
	},
	{
		id: 'BXC-03',
		kind: 'INVARIANCE',
		what: 'unmutated xyflow probe runs and passes all 12 rows',
		args: [],
		expect: EXIT.PASS,
	},
	{
		id: 'BXC-04',
		kind: 'DEFECT',
		what: 'dropped status observations are caught by X-EN-mount',
		args: ['--drop-status-responses'],
		expect: EXIT.FAIL,
		expectedFailure: 'X-EN-mount',
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
	const detail =
		`exit ${code ?? res.error?.message} (want ${control.expect})` +
		(control.expectedFailure ? `, FAIL ${control.expectedFailure} seen=${expectedRowFailed}` : '');
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

process.exitCode = await main();
