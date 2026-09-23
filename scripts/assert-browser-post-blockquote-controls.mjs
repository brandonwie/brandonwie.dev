/**
 * migration:browser:post-blockquote:controls — controls for the B2 probe.
 *
 *   - PBC-01: Defect control — re-enabling the Typography plugin's generated
 *     blockquote quotes fails PB-01 (exit 1)
 *   - PBC-02: Invariance control — the unmutated probe passes both rows (exit 0)
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

const PROBE = 'scripts/assert-browser-post-blockquote.mjs';

const CONTROLS = [
	{
		id: 'PBC-01',
		kind: 'DEFECT',
		what: 're-enabled open/close-quote pseudo-content is caught by PB-01',
		args: ['--reenable-quotes'],
		expect: EXIT.FAIL,
		expectedFailure: 'PB-01',
		requiredDetail: 'generated quotes',
	},
	{
		id: 'PBC-02',
		kind: 'INVARIANCE',
		what: 'unmutated blockquote probe runs and passes both rows',
		args: [],
		expect: EXIT.PASS,
		expectStdout: '2 rows: 2 passed',
	},
];

function runControl(control) {
	const res = spawnSync(process.execPath, [PROBE, ...control.args], {
		encoding: 'utf8',
		timeout: 300000,
	});
	const out = typeof res.stdout === 'string' ? res.stdout : '';
	const code = res.status;
	const expectedRowFailed =
		!control.expectedFailure || out.includes(`FAIL  ${control.expectedFailure}`);
	const detailSeen = !control.requiredDetail || out.includes(control.requiredDetail);
	const summarySeen = !control.expectStdout || out.includes(control.expectStdout);
	const ok = code === control.expect && expectedRowFailed && detailSeen && summarySeen;
	const detail =
		`exit ${code ?? res.error?.message} (want ${control.expect})` +
		(control.expectedFailure ? `, FAIL ${control.expectedFailure} seen=${expectedRowFailed}` : '') +
		(control.requiredDetail ? `, detail seen=${detailSeen}` : '') +
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
