/**
 * Negative controls for the mdsvex AST oracle.
 *
 *   pnpm migration:ast:controls
 *
 * The oracle's own class fixtures already refuse to let it pass vacuously. What
 * these add is the other direction: that it REFUSES a post carrying each class,
 * and ACCEPTS ordinary prose including the brace shapes a directive rule could
 * plausibly over-match.
 *
 * One defect control per class in `SPECIAL_NODES`, which the first version was
 * short of: `svelteTag` was refused by the oracle and exercised by nothing.
 * AST-04 and AST-05 close that, and the pairing rule is now explicit — a class
 * may not appear in `SPECIAL_NODES` without both a fixture and a control.
 */
import { SPECIAL_NODES, runAstOracle } from './assert-mdsvex-ast';

interface Control {
	id: string;
	kind: 'DEFECT' | 'INVARIANCE';
	what: string;
	/** For a defect control, the `SPECIAL_NODES` class it exercises. */
	covers?: (typeof SPECIAL_NODES)[number];
	sources: Array<{ label: string; source: string }>;
}

const CONTROLS: Control[] = [
	{
		id: 'AST-01',
		kind: 'DEFECT',
		covers: 'html',
		what: 'a post containing raw HTML',
		sources: [{ label: 'fixture/html.md', source: 'a\n\n<div>\nb -- c\n</div>\n' }],
	},
	{
		id: 'AST-02',
		kind: 'DEFECT',
		covers: 'svelteBlock',
		what: 'a post containing a Svelte block',
		sources: [{ label: 'fixture/block.md', source: '{#if x}a -- b{/if}\n' }],
	},
	{
		id: 'AST-03',
		kind: 'DEFECT',
		covers: 'html',
		what: 'a post containing an inline raw-HTML span',
		sources: [{ label: 'fixture/span.md', source: '> <span>b</span> c -- d\n' }],
	},
	{
		id: 'AST-04',
		kind: 'DEFECT',
		covers: 'svelteTag',
		what: 'a post containing a Svelte special element (svelteTag)',
		sources: [
			{
				label: 'fixture/svelte-tag.md',
				source: '<svelte:head><title>x -- y</title></svelte:head>\n',
			},
		],
	},
	{
		id: 'AST-05',
		kind: 'DEFECT',
		covers: 'svelteTag',
		what: 'a post containing a self-closing svelte:component',
		sources: [{ label: 'fixture/svelte-component.md', source: '<svelte:component this={X} />\n' }],
	},
	{
		id: 'AST-06',
		kind: 'INVARIANCE',
		what: 'ordinary prose, braces and JSON — paired with AST-02/04',
		sources: [
			{ label: 'fixture/prose.md', source: 'plain prose -- here, with "quotes".\n' },
			{ label: 'fixture/braces.md', source: 'ordinary {braces} a -- b\n' },
			{ label: 'fixture/json.md', source: 'json { "a": 1 } a -- b\n' },
		],
	},
];

// The controls half of the pairing rule, executed rather than asserted: every
// class the oracle refuses must have a defect control proving the refusal is
// real. `assert-mdsvex-ast.ts` enforces the fixture half.
const exercised = new Set(CONTROLS.filter((c) => c.kind === 'DEFECT').map((c) => c.covers));
const unexercised = SPECIAL_NODES.filter((node) => !exercised.has(node));
if (unexercised.length > 0) {
	console.error(
		`FATAL: ${unexercised.join(', ')} in SPECIAL_NODES with no defect control; add one before trusting this suite`,
	);
	process.exit(2);
}

const clean = await runAstOracle(
	[{ label: 'fixture/clean.md', source: 'plain prose -- here\n' }],
	true,
);
console.log(`BASELINE  one ordinary source -> exit ${clean} (expected 0)`);
if (clean !== 0) {
	console.error('FATAL: the oracle refuses ordinary prose; fix that before trusting any control');
	process.exit(1);
}

const failures: string[] = [];
for (const control of CONTROLS) {
	const code = await runAstOracle(control.sources, true);
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
