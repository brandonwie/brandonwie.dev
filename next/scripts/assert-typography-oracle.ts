/**
 * Differential typography check against the installed mdsvex.
 *
 *   pnpm migration:typography:oracle
 *
 * `pnpm migration:typography` compares 334 real posts, which is broad and
 * blind in one direction: it can only see shapes the corpus happens to contain.
 * The bracket-span rule that reproduces mdsvex's text-node boundaries was
 * written from ONE such shape, scored 334/334, and was still wrong — a reviewer
 * found three literal-text shapes it split where mdsvex does not:
 * `[[bot]]'s`, `foo[]'s` and `[a[b]c]'s`.
 *
 * So this runs fixtures through mdsvex ITSELF and through the replacement
 * pipeline, and compares the visible text. mdsvex is still a devDependency of
 * the SvelteKit app; while both stacks exist it is available as an oracle, and
 * an oracle beats an assertion about an oracle. It is a TEST-ONLY dependency
 * here: nothing in `next/` imports mdsvex at build time.
 *
 * Exit 0 = every fixture renders identically. Exit 1 = at least one does not,
 * or the fixture set lost the shapes it exists to cover. Exit 2 = it could not
 * run.
 */
import { compile } from 'mdsvex';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderMarkdown } from '../src/markdown/pipeline';

/**
 * Fixtures, and why each one is here.
 *
 * The first four are the boundary cases: one that IS a shortcut reference in
 * remark-parse 8 and three that are not. The rest cover the educators
 * themselves and the shapes around a reference that could plausibly change a
 * quote's direction.
 */
export const FIXTURES: string[] = [
	// Round 4: labels with inline children or an escape. Each of these places the
	// apostrophe differently, and no bracket regex can see the difference.
	"[a\\]b]'s review",
	"[*a*]'s review",
	"[**a**]'s review",
	"[`a`]'s review",
	"[a b]'s review",
	"[a\\[b]'s review",
	"![a]'s review",
	"[a]: https://example.com\n\n[a]'s review",
	"claude[bot]'s review",
	"[[bot]]'s review",
	"foo[]'s review",
	"[a[b]c]'s review",
	'a "quote" here',
	"the '80s",
	'em -- dash',
	"it's fine",
	'see [ref] "then"',
	'![alt](x.png) "then"',
	"[text](https://example.com)'s",
	"[a][b]'s",
	"a [x] b [y]'s",
	"nested [[a]] and [b[c]] here 'x'",
	"empty [] and [ ]'s",
	'"start" [ref] end',
	'[ref]: https://example.com',
	"tail bracket ] alone 's",
	"lead bracket [ alone 's",
	'ellipsis... and more....',
	'``backticks\'\' and "quotes"',
	'nested "outer \'inner\' outer" done',
];

/**
 * Shapes reviewers have demonstrated. Losing any of them from the fixture set is
 * a defect in the fixture set, not a reason for the check to pass.
 *
 * The first three are shapes a bracket regex mis-split. The last three are the
 * ones that killed the regex approach outright: a label with inline children or
 * an escape ends its node somewhere no pattern over the raw text can predict.
 */
const REQUIRED_SHAPES = ["[[bot]]'s", "foo[]'s", "[a[b]c]'s", "[*a*]'s", '[`a`]', "[a\\]b]'s"];

export function visibleText(markup: string): string {
	return markup
		.replace(/<script[\s\S]*?<\/script>/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export async function renderBoth(source: string): Promise<{ mdsvex: string; candidate: string }> {
	const compiled = await compile(source);
	const rendered = await renderMarkdown(source);
	return {
		mdsvex: visibleText(compiled?.code ?? ''),
		candidate: visibleText(renderToStaticMarkup(rendered.content)),
	};
}

export async function runOracle(
	fixtures: string[] = FIXTURES,
	mutate: (candidate: string, source: string) => string | Promise<string> = (candidate) =>
		candidate,
	quiet = false,
): Promise<number> {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};

	// Only the full set carries the coverage obligation. A control deliberately
	// runs a SUBSET -- the fixtures that killed one specific rejected rule -- and
	// demanding full coverage there would abort the control before its mutation
	// ever ran, which is how this guard first reported two controls as no-ops.
	if (fixtures === FIXTURES) {
		for (const shape of REQUIRED_SHAPES) {
			if (!fixtures.some((f) => f.includes(shape))) {
				console.error(`FATAL: the fixture set no longer covers ${JSON.stringify(shape)}`);
				return 2;
			}
		}
	}

	const failures: string[] = [];
	let smartCharacters = 0;
	for (const source of fixtures) {
		const { mdsvex, candidate } = await renderBoth(source);
		smartCharacters += [...mdsvex].filter((ch) => '—–‘’“”…'.includes(ch)).length;
		const actual = await mutate(candidate, source);
		if (mdsvex === actual) continue;
		failures.push(
			`${JSON.stringify(source)}\n     mdsvex    ${JSON.stringify(mdsvex)}\n     candidate ${JSON.stringify(actual)}`,
		);
	}

	// One smart character per fixture, scaled rather than a fixed floor: the
	// controls run three-fixture subsets, and a fixed floor reported those runs
	// as vacuous instead of as the failures they are meant to produce.
	const floor = Math.max(1, fixtures.length);
	if (smartCharacters < floor) {
		console.error(
			`FATAL: ${fixtures.length} fixture(s) produce only ${smartCharacters} smart character(s), expected at least ${floor}; the comparison is vacuous`,
		);
		return 2;
	}

	say(`\n${fixtures.length} fixtures compared against mdsvex, ${smartCharacters} smart characters`);
	if (failures.length) {
		for (const line of failures) console.error(`ORACLE MISMATCH ${line}`);
		console.error(`RESULT: ${failures.length}/${fixtures.length} fixture(s) differ`);
		return 1;
	}
	say(`RESULT: ${fixtures.length}/${fixtures.length} fixtures render identically`);
	return 0;
}

if (process.argv[1]?.endsWith('assert-typography-oracle.ts')) {
	process.exit(await runOracle());
}
