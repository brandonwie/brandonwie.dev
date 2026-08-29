/**
 * Negative controls for the corpus typography assertions.
 *
 *   pnpm migration:typography:controls
 *
 * `assert-corpus-typography.ts` reports 334 matching posts. The number proves
 * nothing until the comparison has been observed to go red on each way it can
 * legitimately fail:
 *
 *   DEFECT      the assertion MUST exit 1 on deliberately broken output
 *   INVARIANCE  the assertion MUST exit 0 on a benign change it should ignore
 *
 * CT-03 is the control that matters most: it flips ONE quote's direction while
 * leaving every count identical. That is the exact shape of the five real
 * mismatches, and a counts-based comparison would pass all five.
 *
 * The corpus is rendered ONCE and every control runs over that cache — 334
 * React renders per control would make this suite unusable, and the mutations
 * are all post-render string edits anyway.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderCorpus, runAssertions, smartSequence } from './assert-corpus-typography';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	/** Applied to one post's rendered markup; `index` selects a single victim. */
	mutate: (html: string, index: number) => string;
}

/** Replace the FIRST occurrence within each post — one character per post, not one per corpus. */
const onFirstMatch =
	(pattern: RegExp, replacement: string) =>
	(html: string): string =>
		html.replace(pattern, replacement);

const CONTROLS: Control[] = [
	{
		id: 'CT-01',
		kind: 'DEFECT',
		what: 'smart punctuation flattened to ASCII across the corpus — the original regression',
		mutate: (html) =>
			html
				.replace(/—/g, '--')
				.replace(/–/g, '-')
				.replace(/[‘’]/g, "'")
				.replace(/[“”]/g, '"')
				.replace(/…/g, '...'),
	},
	{
		id: 'CT-02',
		kind: 'DEFECT',
		what: 'a single em dash reverts to the ASCII source spelling',
		mutate: onFirstMatch(/—/, '--'),
	},
	{
		id: 'CT-03',
		kind: 'DEFECT',
		what: 'ONE quote flips direction — identical counts, different sequence',
		mutate: onFirstMatch(/”/, '“'),
	},
	{
		id: 'CT-04',
		kind: 'INVARIANCE',
		what: 'smart punctuation written as numeric entities — paired with CT-01/02',
		mutate: (html) =>
			html
				.replace(/—/g, '&#8212;')
				.replace(/’/g, '&#8217;')
				.replace(/“/g, '&#8220;')
				.replace(/”/g, '&#8221;'),
	},
	{
		id: 'CT-05',
		kind: 'INVARIANCE',
		what: 'the markup is reflowed with extra whitespace — paired with CT-02',
		mutate: (html) => html.replace(/></g, '>\n  <'),
	},
];

const BUILD = fileURLToPath(new URL('../../build/', import.meta.url));

if (!existsSync(BUILD)) {
	console.error(`FATAL: SvelteKit build not found: ${BUILD} — run \`pnpm build\` first`);
	process.exit(2);
}

const corpus = await renderCorpus();

// A control suite that never sees the unbroken corpus passing is not a
// baseline, it is a coincidence.
const clean = runAssertions(corpus, undefined, true);
console.log(`BASELINE  unmutated corpus (${corpus.length} posts) -> exit ${clean} (expected 0)`);
if (clean !== 0) {
	console.error('FATAL: the unmutated corpus does not pass; fix that before trusting any control');
	process.exit(1);
}

const failures: string[] = [];
for (const control of CONTROLS) {
	// A mutation that silently matched nothing turns an INVARIANCE control into
	// a tautology and a DEFECT control into a coincidence.
	let changed = false;
	const mutate = (html: string, index: number): string => {
		const out = control.mutate(html, index);
		if (out !== html && smartSequence(out) !== smartSequence(html)) changed = true;
		else if (out !== html && control.kind === 'INVARIANCE') changed = true;
		return out;
	};
	const code = runAssertions(corpus, mutate, true);
	if (!changed) {
		failures.push(`${control.id} ${control.what}: the mutation changed nothing observable`);
		console.log(`FAIL  ${control.id}  ${control.kind.padEnd(10)} NO-OP MUTATION  ${control.what}`);
		continue;
	}
	const expected = control.kind === 'DEFECT' ? 1 : 0;
	const ok = code === expected;
	if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected ${expected}`);
	console.log(
		`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind.padEnd(10)} exit ${code} (expected ${expected})  ${control.what}`,
	);
}

const defects = CONTROLS.filter((c) => c.kind === 'DEFECT').length;
console.log(
	`\n${CONTROLS.length} controls: ${defects} defect (must exit 1), ${CONTROLS.length - defects} invariance (must exit 0)`,
);
if (failures.length) {
	for (const line of failures) console.error(`CONTROL FAILED ${line}`);
	console.error(`RESULT: ${failures.length}/${CONTROLS.length} control(s) failed`);
	process.exit(1);
}
console.log(`RESULT: ${CONTROLS.length}/${CONTROLS.length} controls behaved as specified`);
