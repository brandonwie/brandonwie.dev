/**
 * Negative controls for the mdsvex differential oracle.
 *
 *   pnpm migration:typography:oracle:controls
 *
 * OR-01 is the one that earns the file. It re-educates the boundary fixtures
 * with the rule the reviewer defeated — a split on every bracket instead of on
 * a valid remark-parse-8 shortcut label — and requires the oracle to reject it.
 * Without that, "the oracle passes" would only mean today's fixtures happen to
 * agree, not that the oracle can tell a wrong boundary rule from a right one.
 *
 * All three controls are DEFECT controls. There is no invariance to pair here:
 * this comparison has no normalization to be blind through — `visibleText`
 * already collapses whitespace on both sides before anything is compared, and
 * the oracle asserts equality of the result. Nothing is deliberately ignored,
 * so there is nothing for an invariance control to pin.
 */
import { educateSpan } from '../src/markdown/plugins/remark-smart-typography';
import { FIXTURES, runOracle } from './assert-typography-oracle';

/**
 * The rejected rule: split on every bracket character.
 *
 * Kept here, in the controls, precisely because it is wrong. It is the only way
 * to demonstrate that the oracle discriminates between boundary rules.
 */
function naiveSplit(value: string): string {
	return value
		.split(/([[\]])/)
		.map((part) => (part === '[' || part === ']' ? part : educateSpan(part)))
		.join('');
}

/** The four boundary fixtures. Plain text apart from brackets, so educating the
 * SOURCE is the same string the pipeline would render for them. */
const BOUNDARY_FIXTURES = FIXTURES.slice(0, 4);

interface Control {
	id: string;
	what: string;
	fixtures: string[];
	mutate: (candidate: string, source: string) => string;
}

const CONTROLS: Control[] = [
	{
		id: 'OR-01',
		what: 'the rejected all-bracket split rule — the boundary bug itself',
		fixtures: BOUNDARY_FIXTURES,
		mutate: (_candidate, source) => naiveSplit(source),
	},
	{
		id: 'OR-02',
		what: 'smart punctuation flattened to ASCII',
		fixtures: FIXTURES,
		mutate: (candidate) =>
			candidate
				.replace(/—/g, '--')
				.replace(/[‘’]/g, "'")
				.replace(/[“”]/g, '"')
				.replace(/…/g, '...'),
	},
	{
		id: 'OR-03',
		what: 'one quote flips direction',
		fixtures: FIXTURES,
		mutate: (candidate) => candidate.replace(/”/, '“'),
	},
];

const clean = await runOracle(FIXTURES, undefined, true);
console.log(`BASELINE  unmutated fixtures -> exit ${clean} (expected 0)`);
if (clean !== 0) {
	console.error('FATAL: the unmutated fixtures do not pass; fix that before trusting any control');
	process.exit(1);
}

const failures: string[] = [];
for (const control of CONTROLS) {
	// A mutation that changed nothing would make the control a coincidence.
	let changed = false;
	const code = await runOracle(
		control.fixtures,
		(candidate, source) => {
			const out = control.mutate(candidate, source);
			if (out !== candidate) changed = true;
			return out;
		},
		true,
	);
	if (!changed) {
		failures.push(`${control.id} ${control.what}: the mutation changed nothing`);
		console.log(`FAIL  ${control.id}  NO-OP MUTATION  ${control.what}`);
		continue;
	}
	const ok = code === 1;
	if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected 1`);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${control.id}  exit ${code} (expected 1)  ${control.what}`);
}

console.log(`\n${CONTROLS.length} defect controls over the oracle`);
if (failures.length) {
	for (const line of failures) console.error(`CONTROL FAILED ${line}`);
	console.error(`RESULT: ${failures.length}/${CONTROLS.length} control(s) failed`);
	process.exit(1);
}
console.log(`RESULT: ${CONTROLS.length}/${CONTROLS.length} controls behaved as specified`);
