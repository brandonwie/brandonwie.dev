/**
 * Controls for the parity progress judge.
 *
 *   pnpm migration:parity:progress:controls
 *
 * The judge exists because `continue-on-error` treated four different states as
 * one. Each of those states gets a control here, so the distinction is proven
 * rather than described — and the two states that MUST pass get invariance
 * controls, each paired with a defect over the same surface, so "tolerant of
 * expected drift" cannot quietly become "tolerant of everything".
 */

import { judge, main } from './assert-parity-progress.ts';

const RESULT = (unapproved: number, stale: number): string =>
	`RESULT: ${unapproved} unapproved difference(s), ${stale} stale ledger entry(ies)`;
const PARITY =
	'PARITY: 366 pages, 4 site artifacts, 0 approved exception(s), 0 unapproved differences';
const STALE_LINE =
	'STALE LEDGER ENTRY /about [text] approves a difference that does not exist; a ledger that has drifted from reality is how a harness stops testing';

interface Control {
	id: string;
	kind: 'DEFECT' | 'INVARIANCE';
	what: string;
	exitCode: number;
	output: string;
}

const CONTROLS: Control[] = [
	{
		id: 'PP-01',
		kind: 'DEFECT',
		what: 'the build directory is missing, so the comparison never ran',
		exitCode: 2,
		output: 'FATAL: build directory not found: next/build\n',
	},
	{
		id: 'PP-02',
		kind: 'DEFECT',
		what: 'the exception ledger is malformed — exit 1, but not a comparison result',
		exitCode: 1,
		output: 'FATAL: exception ledger verification/x.json is not valid JSON: Unexpected token\n',
	},
	{
		id: 'PP-03',
		kind: 'DEFECT',
		what: 'a stale ledger entry rides along with the expected drift',
		exitCode: 1,
		output: `${STALE_LINE}\n${RESULT(383, 1)}\n`,
	},
	{
		id: 'PP-04',
		kind: 'DEFECT',
		what: 'exit 1 with no terminal RESULT line — the comparator died mid-run',
		exitCode: 1,
		output: 'DIFF /about [text] baseline ... != candidate ...\n',
	},
	{
		id: 'PP-05',
		kind: 'DEFECT',
		what: 'exit 0 with no PARITY line — a verdict that was never reached',
		exitCode: 0,
		output: 'comparing 366 pages\n',
	},
	{
		id: 'PP-06',
		kind: 'DEFECT',
		what: 'exit 1 contradicting its own zero counts',
		exitCode: 1,
		output: `${RESULT(0, 0)}\n`,
	},
	{
		id: 'PP-07',
		kind: 'DEFECT',
		what: 'an unrecognised exit code is not a comparison result',
		exitCode: 137,
		output: `${RESULT(383, 0)}\n`,
	},
	{
		id: 'PP-08',
		kind: 'INVARIANCE',
		what: 'the expected progress state passes — paired with PP-03 over the same surface',
		exitCode: 1,
		output: `DIFF /about [text] baseline ... != candidate ...\n${RESULT(383, 0)}\n`,
	},
	{
		id: 'PP-09',
		kind: 'INVARIANCE',
		what: 'full parity passes — paired with PP-05 over the same surface',
		exitCode: 0,
		output: `${PARITY}\n  NOT CHECKED here: screenshots, keyboard flows, accessibility, performance\n`,
	},
];

// Vacuity guard: a judge that answered the same way to everything would pass
// every DEFECT control and fail every INVARIANCE one, or the reverse. Require
// both outcomes to be reachable before any row below is meaningful.
const outcomes = new Set(CONTROLS.map((c) => judge(c.exitCode, c.output).ok));
if (outcomes.size !== 2) {
	console.error(
		'FATAL: the judge returned a single verdict for every control; it is not discriminating',
	);
	process.exit(2);
}

let passed = 0;
for (const control of CONTROLS) {
	const verdict = judge(control.exitCode, control.output);
	const expected = control.kind === 'INVARIANCE';
	const ok = verdict.ok === expected;
	if (ok) passed += 1;
	console.log(
		`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind.padEnd(10)} ok=${verdict.ok} (expected ${expected})  ${control.what}\n        ${verdict.reason}`,
	);
}

// PP-10 / PP-11: the exit code must FOLLOW the judgment. A correct judge whose
// verdict never reaches the process is the same failure as `continue-on-error`,
// which also technically ran the command.
const propagation: Array<[string, number, string, number]> = [
	[
		'PP-10 DEFECT     a failing judgment must exit 1',
		2,
		'FATAL: build directory not found: next/build\n',
		1,
	],
	['PP-11 INVARIANCE the expected progress state must exit 0', 1, `${RESULT(383, 0)}\n`, 0],
];
for (const [label, status, output, want] of propagation) {
	const got = main(() => ({ status, output }));
	const ok = got === want;
	if (ok) passed += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} — exit ${got} (expected ${want})`);
}

const total = CONTROLS.length + propagation.length;
console.log(`\nRESULT: ${passed}/${total}`);
process.exit(passed === total ? 0 : 1);
