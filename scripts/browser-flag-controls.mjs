/**
 * Shared runner for browser-probe controls whose defect is a probe flag.
 *
 * Each control spawns the probe with its flag and requires the stated exit
 * code, plus a `FAIL  <row>` line for every row the defect must trip. The
 * INVARIANCE control (no flag) proves the probe itself passes, so a defect
 * control cannot pass on a probe that fails for an unrelated reason.
 *
 * Exit 0 all controls behave as specified, 1 otherwise, 3 skipped (no browser).
 */
import { spawnSync } from 'node:child_process';
import { findBrowser, EXIT } from './browser-probe.mjs';

function runControl(probe, control) {
	const res = spawnSync(process.execPath, [probe, ...control.args], {
		encoding: 'utf8',
		timeout: 600000,
	});
	const out = typeof res.stdout === 'string' ? res.stdout : '';
	const code = res.status;
	const rows = control.expectedFailures ?? [];
	const missing = rows.filter((row) => !out.includes(`FAIL  ${row}`));
	const ok = code === control.expect && missing.length === 0;
	const detail =
		`exit ${code ?? res.error?.message} (want ${control.expect})` +
		(rows.length ? `, FAIL rows seen ${rows.length - missing.length}/${rows.length}` : '') +
		(missing.length ? ` (missing ${missing.join(', ')})` : '');
	return { ok, detail };
}

export async function runFlagControls(probe, controls) {
	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; set CHROME_BINARY to point at one');
		return EXIT.SKIPPED;
	}
	let passed = 0;
	for (const control of controls) {
		const { ok, detail } = runControl(probe, control);
		if (ok) passed += 1;
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind}: ${control.what} — ${detail}`,
		);
	}
	console.log(`\n${controls.length} controls: ${passed} passed`);
	return passed === controls.length ? EXIT.PASS : EXIT.FAIL;
}

export function exitWith(promise) {
	promise
		.then((code) => process.exit(code))
		.catch((error) => {
			console.error(`ERROR ${error.message}`);
			process.exit(EXIT.ERROR);
		});
}
