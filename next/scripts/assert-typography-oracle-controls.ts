/**
 * Negative controls for the mdsvex differential oracle.
 *
 *   pnpm migration:typography:oracle:controls
 *
 * OR-01 and OR-02 are the ones that earn the file. They re-educate the fixtures
 * with the two boundary rules this lane already shipped and had defeated, and
 * require the oracle to reject both. Without them, "the oracle passes" would
 * only mean today's fixtures happen to agree, not that the oracle can tell a
 * wrong boundary rule from a right one.
 *
 * All four controls are DEFECT controls. There is no invariance to pair here:
 * this comparison has no normalization to be blind through — `visibleText`
 * already collapses whitespace on both sides before anything is compared, and
 * the oracle asserts equality of the result. Nothing is deliberately ignored,
 * so there is nothing for an invariance control to pin.
 */
import { educateSpan } from '../src/markdown/plugins/remark-smart-typography';
import { FIXTURES, runHtmlDetection, runOracle } from './assert-typography-oracle';

/**
 * The two REJECTED boundary rules, kept here precisely because they are wrong.
 *
 * Each one shipped, passed a broad check, and was then defeated:
 *
 *   wholeNode   educate each text node as one span. Fails `claude[bot]'s`,
 *               because micromark keeps it in one node and remark-parse 8 does
 *               not. Found by a 334-post corpus probe.
 *   bracketSplit  split on a bracket label. Fixes that one shape and 334/334
 *               posts, and still fails `[*a*]'s`, `[`a`]'s` and `[a\]b]'s`,
 *               where the label has inline children or an escape. Found by a
 *               reviewer's augmented oracle.
 *
 * A control suite that cannot reproduce the bugs it was written for proves
 * nothing, so both are exercised: OR-01 and OR-02 must each make the oracle
 * exit 1 over the fixtures that killed them.
 */
function wholeNode(value: string): string {
	return educateSpan(value);
}

function bracketSplit(value: string): string {
	return value
		.split(/([[\]])/)
		.map((part) => (part === '[' || part === ']' ? part : educateSpan(part)))
		.join('');
}

/** Fixtures each rejected rule fails on. Plain text apart from the markup under
 * test, so educating the SOURCE is what the pipeline would render for them. */
const WHOLE_NODE_FIXTURES = ["claude[bot]'s review", "[[bot]]'s review", "foo[]'s review"];
const BRACKET_SPLIT_FIXTURES = ["[*a*]'s review", "[`a`]'s review", "[a\\]b]'s review"];

interface Control {
	id: string;
	what: string;
	fixtures: string[];
	mutate: (candidate: string, source: string) => string;
}

const CONTROLS: Control[] = [
	{
		id: 'OR-01',
		what: "the rejected whole-node rule — micromark boundaries instead of mdsvex's",
		fixtures: WHOLE_NODE_FIXTURES,
		mutate: (_candidate, source) => wholeNode(source),
	},
	{
		id: 'OR-02',
		what: 'the rejected bracket-split rule — labels with inline children or an escape',
		fixtures: BRACKET_SPLIT_FIXTURES,
		mutate: (_candidate, source) => bracketSplit(source),
	},
	{
		id: 'OR-03',
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
		id: 'OR-04',
		what: 'one quote flips direction',
		fixtures: FIXTURES,
		mutate: (candidate) => candidate.replace(/”/, '“'),
	},
];

// OR-05 is not a mutation control; it is the detector's discrimination test, so
// it runs before the mutation loop. A detector that answered "yes" to every
// input would satisfy the oracle's raw-HTML row while proving nothing, so it is
// pointed at fixtures carrying NO raw HTML and required to reject them.
const discrimination = runHtmlDetection(FIXTURES, true);
console.log(
	`${discrimination === 1 ? 'PASS' : 'FAIL'}  OR-05  exit ${discrimination} (expected 1)  the raw-HTML detector must NOT flag ordinary fixtures`,
);
const detectorFailures =
	discrimination === 1 ? [] : ['OR-05 the raw-HTML detector flags everything'];

const clean = await runOracle(FIXTURES, undefined, true);
console.log(`BASELINE  unmutated fixtures -> exit ${clean} (expected 0)`);
if (clean !== 0) {
	console.error('FATAL: the unmutated fixtures do not pass; fix that before trusting any control');
	process.exit(1);
}

const failures: string[] = [...detectorFailures];
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

console.log(`\n${CONTROLS.length + 1} defect controls over the oracle`);
if (failures.length) {
	for (const line of failures) console.error(`CONTROL FAILED ${line}`);
	console.error(`RESULT: ${failures.length}/${CONTROLS.length + 1} control(s) failed`);
	process.exit(1);
}
console.log(`RESULT: ${CONTROLS.length + 1}/${CONTROLS.length + 1} controls behaved as specified`);
