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
import { hasUnsupportedMarkup } from '../src/markdown/plugins/remark-smart-typography';

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
const REQUIRED_SHAPES = [
	"[[bot]]'s",
	"foo[]'s",
	"[a[b]c]'s",
	"[*a*]'s",
	"[**a**]'s",
	'[`a`]',
	"[a\\]b]'s",
];

/**
 * Unsupported markup: shapes whose mdsvex education boundaries are NOT reproduced.
 *
 * These are not fixtures in the ordinary sense, because they do not agree and
 * cannot be made to agree by reproducing remark-parse 8 alone: mdsvex runs its
 * own parser extensions before smartypants, and around raw HTML they change
 * which text is eligible for education. Measured divergences:
 *
 *   `> <span>b</span> c -- d`   mdsvex "b c -- d"   here "b c — d"
 *   `<span>a</span>'s b`        mdsvex "a's b"      here "a’s b"
 *   `<svelte:component …>a -- b` mdsvex "a -- b"    here "a — b"
 *
 * What IS asserted is that every one of them is DETECTED as html-bearing, so
 * the corpus gate refuses a post that introduces raw HTML rather than educating
 * it on rules this preprocessor cannot claim to match. The corpus carries zero
 * raw-HTML nodes across all 334 posts today.
 */
export const UNSUPPORTED_MARKUP_FIXTURES: string[] = [
	'> <span>b</span> c -- d',
	"<span>a</span>'s b",
	'> <div>b</div> c -- d',
	'<div>\na -- b\n</div>',
	'<details>\n<summary>s -- t</summary>\n\na -- b\n</details>',
	'text\n<div>\nx -- y\n</div>\ntail -- z',
	// NOT html nodes. `svelte:component` is not a valid HTML tag name, so
	// remark-parse 8 leaves these as ordinary text and an html-node counter
	// never sees them. All nine svelte:* elements behaved this way.
	'<svelte:component this={X}>a -- b</svelte:component>',
	'<svelte:element this={"p"}>a -- b</svelte:element>',
	'<svelte:head><title>a -- b</title></svelte:head>',
];

/**
 * Every fixture must be seen as html-bearing. Exit 1 if any is not.
 *
 * Exported so the controls can run it over fixtures that carry NO raw HTML and
 * require a failure — a detector that answers "yes" to everything would pass
 * this assertion while proving nothing.
 */
export function runUnsupportedMarkupDetection(
	fixtures: string[] = UNSUPPORTED_MARKUP_FIXTURES,
	quiet = false,
): number {
	const missed = fixtures.filter((source) => !hasUnsupportedMarkup(source));
	if (missed.length) {
		if (!quiet) {
			for (const source of missed) console.error(`NOT DETECTED ${JSON.stringify(source)}`);
		}
		return 1;
	}
	if (!quiet) {
		console.log(`unsupported-markup detection: ${fixtures.length}/${fixtures.length} flagged`);
	}
	return 0;
}

/**
 * The NEGATIVE assertion: every one of these must be left unflagged.
 *
 * The positive assertion above is satisfied by a detector that answers "yes" to
 * everything, and the first version of this control only proved that AT LEAST
 * ONE ordinary fixture was unflagged. This requires ALL of them, so a detector
 * that started guessing would fail here even while every real divergence stayed
 * caught.
 */
export function runFalsePositiveCheck(fixtures: string[] = FIXTURES, quiet = false): number {
	const flagged = fixtures.filter((source) => hasUnsupportedMarkup(source));
	if (flagged.length) {
		if (!quiet) {
			for (const source of flagged) console.error(`FALSE POSITIVE ${JSON.stringify(source)}`);
		}
		return 1;
	}
	if (!quiet) console.log(`false positives: 0/${fixtures.length}`);
	return 0;
}

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
	// The raw-HTML shapes are checked for DETECTION, not for agreement, and only
	// on the full run: a control driving a fixture subset is testing one rejected
	// rule and has no business asserting the detector too.
	if (fixtures === FIXTURES) {
		if (runUnsupportedMarkupDetection(UNSUPPORTED_MARKUP_FIXTURES, quiet) !== 0) {
			console.error(
				'RESULT: unsupported-markup detection failed; the corpus gate would educate it silently',
			);
			return 1;
		}
		if (runFalsePositiveCheck(FIXTURES, quiet) !== 0) {
			console.error('RESULT: the detector flags ordinary markdown; it would block valid posts');
			return 1;
		}
	}
	say(`RESULT: ${fixtures.length}/${fixtures.length} fixtures render identically`);
	return 0;
}

if (process.argv[1]?.endsWith('assert-typography-oracle.ts')) {
	process.exit(await runOracle());
}
