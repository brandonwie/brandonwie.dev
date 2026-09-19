/**
 * migration:browser:notfound:controls — negative and invariance controls for
 * the F1 not-found regression probe.
 *
 *   - NFC-01: Defect control — an injected window error fails NF-01 (exit 1)
 *   - NFC-02: Defect control — a client-mounted language toggle fails NF-01 (exit 1)
 *   - NFC-03: Invariance control — unmutated probe passes all 3 rows (exit 0)
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-notfound.mjs';

const CONTROLS = [
	{
		id: 'NFC-01',
		kind: 'DEFECT',
		what: 'an injected window error is caught by NF-01',
		args: ['--inject-window-error'],
		expect: EXIT.FAIL,
		expectedFailure: 'NF-01',
	},
	{
		id: 'NFC-02',
		kind: 'DEFECT',
		what: 'a client-mounted language toggle is caught by NF-01',
		args: ['--render-toggle'],
		expect: EXIT.FAIL,
		expectedFailure: 'NF-01',
	},
	{
		id: 'NFC-03',
		kind: 'INVARIANCE',
		what: 'unmutated not-found probe runs and passes all 3 rows',
		args: [],
		expect: EXIT.PASS,
		expectStdout: '3 rows: 3 passed',
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
	return { ok, detail };
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
