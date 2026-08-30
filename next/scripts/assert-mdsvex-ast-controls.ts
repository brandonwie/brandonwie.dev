/**
 * Negative controls for the mdsvex AST oracle.
 *
 *   pnpm migration:ast:controls
 *
 * The oracle's own class fixtures already refuse to let it pass vacuously. What
 * these add is the other direction: that it REFUSES a post carrying each class,
 * and ACCEPTS ordinary prose including the brace shapes a directive rule could
 * plausibly over-match.
 */
import { runAstOracle } from './assert-mdsvex-ast';

interface Control {
	id: string;
	kind: 'DEFECT' | 'INVARIANCE';
	what: string;
	sources: Array<{ label: string; source: string }>;
}

const CONTROLS: Control[] = [
	{
		id: 'AST-01',
		kind: 'DEFECT',
		what: 'a post containing raw HTML',
		sources: [{ label: 'fixture/html.md', source: 'a\n\n<div>\nb -- c\n</div>\n' }],
	},
	{
		id: 'AST-02',
		kind: 'DEFECT',
		what: 'a post containing a Svelte block',
		sources: [{ label: 'fixture/block.md', source: '{#if x}a -- b{/if}\n' }],
	},
	{
		id: 'AST-03',
		kind: 'DEFECT',
		what: 'a post containing an inline raw-HTML span',
		sources: [{ label: 'fixture/span.md', source: '> <span>b</span> c -- d\n' }],
	},
	{
		id: 'AST-04',
		kind: 'INVARIANCE',
		what: 'ordinary prose, braces and JSON — paired with AST-02',
		sources: [
			{ label: 'fixture/prose.md', source: 'plain prose -- here, with "quotes".\n' },
			{ label: 'fixture/braces.md', source: 'ordinary {braces} a -- b\n' },
			{ label: 'fixture/json.md', source: 'json { "a": 1 } a -- b\n' },
		],
	},
];

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
