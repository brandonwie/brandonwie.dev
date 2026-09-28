/**
 * Negative controls for the corpus typography invariants.
 *
 *   pnpm migration:typography:controls
 *
 * `assert-corpus-typography.ts` reports every post satisfying three invariants.
 * That proves nothing until each invariant has been observed to go red on the
 * way it can legitimately fail, and to stay green on a change it must ignore:
 *
 *   DEFECT      the assertion MUST exit 1 on deliberately broken input
 *   INVARIANCE  the assertion MUST exit 0 on a benign change it should ignore
 *
 * The corpus is rendered ONCE and every control runs over that cache. Output
 * mutations are post-render string edits; the counter controls hand the
 * assertions a doctored counter reading, because the plugin's real counters are
 * cumulative with no reset and raising them would poison every later control.
 *
 * HISTORY. CT-02, CT-03, CT-06 and CT-07 exercised the per-post comparison
 * against the built Svelte page. That comparison was dropped with the SvelteKit
 * app, and their ids are retired rather than reissued.
 */
import { MIN_POSTS, renderCorpus, runAssertions, smartSequence } from './assert-corpus-typography';
import type { PipelineCounters } from './assert-corpus-typography';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	/** Applied to one post's rendered markup. */
	mutate?: (html: string, index: number) => string;
	/** Replaces the counters the assertions read. */
	counters?: PipelineCounters;
	/** Cuts the corpus to one post below the floor. */
	shrink?: boolean;
}

const zero = (): number => 0;

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
		id: 'CT-08',
		kind: 'DEFECT',
		what: 'the preprocessor reports one unsupported-markup construct',
		counters: { unsupportedMarkup: () => 1, unmappedNodes: zero },
	},
	{
		id: 'CT-09',
		kind: 'DEFECT',
		what: 'the preprocessor reports one text node it could not map',
		counters: { unsupportedMarkup: zero, unmappedNodes: () => 1 },
	},
	{
		id: 'CT-10',
		kind: 'DEFECT',
		what: 'the corpus shrinks to one post below the floor',
		shrink: true,
	},
	{
		id: 'CT-04',
		kind: 'INVARIANCE',
		what: 'smart punctuation written as numeric entities — paired with CT-01',
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
		what: 'the markup is reflowed with extra whitespace — paired with CT-01',
		mutate: (html) => html.replace(/></g, '>\n  <'),
	},
];

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
	// a tautology and a DEFECT control into a coincidence. Counter and corpus
	// controls change their input by construction.
	let changed = control.mutate === undefined;
	const mutate = control.mutate
		? (html: string, index: number): string => {
				const out = control.mutate!(html, index);
				if (
					out !== html &&
					JSON.stringify(smartSequence(out)) !== JSON.stringify(smartSequence(html))
				)
					changed = true;
				else if (out !== html && control.kind === 'INVARIANCE') changed = true;
				return out;
			}
		: undefined;
	const input = control.shrink ? corpus.slice(0, MIN_POSTS - 1) : corpus;
	const code = runAssertions(input, mutate, true, control.counters);
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
