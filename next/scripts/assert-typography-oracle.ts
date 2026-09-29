/**
 * Discrimination of the typography preprocessor's unsupported-markup detector.
 *
 *   pnpm migration:typography:oracle
 *
 * `pnpm migration:typography` asserts that `unsupportedMarkupCount()` stays at
 * zero across the corpus. That assertion is only as good as the detector behind
 * it, `hasUnsupportedMarkup` in `remark-smart-typography.ts`, so this suite
 * checks the detector in both directions:
 *
 *   detection        every shape in `UNSUPPORTED_MARKUP_FIXTURES` is flagged —
 *                    raw HTML nodes, `svelte:*` tag openers, and template
 *                    directives, which are three different detection rules.
 *   false positives  every ordinary fixture, including brace shapes that look
 *                    like directives, is left unflagged. A detector that
 *                    answered "yes" to everything would pass detection alone.
 *
 * HISTORY. The file name is historical. Until the SvelteKit app was retired it
 * also rendered `FIXTURES` through the installed `mdsvex` and through the Next
 * pipeline and required identical visible text — a differential oracle for the
 * bracket-boundary rules. mdsvex no longer renders anything, so that comparison
 * (and its `REQUIRED_SHAPES` coverage guard and smart-character floor) was
 * dropped. The detector rows never depended on mdsvex and are what remains.
 *
 * Exit 0 = the detector discriminates. Exit 1 = it misses a shape or flags an
 * ordinary one.
 */
import { hasUnsupportedMarkup } from '../src/markdown/plugins/remark-smart-typography';

/** A detector under test: true when a source carries unsupported markup. */
export type Detector = (markdown: string) => boolean;

/**
 * Ordinary markdown the detector must leave unflagged.
 *
 * These were the differential oracle's fixtures: bracket-label shapes around an
 * apostrophe, the educators' own inputs, and references that could plausibly
 * change a quote's direction. None carries raw HTML or a template directive.
 */
export const FIXTURES: string[] = [
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
 * Unsupported markup: shapes the preprocessor refuses rather than educates.
 *
 * Raw HTML and Svelte-template syntax change which text is eligible for
 * education, and the preprocessor does not claim rules for them. The original
 * divergences were measured against mdsvex, which parsed these specially:
 *
 *   `> <span>b</span> c -- d`   mdsvex "b c -- d"   here "b c — d"
 *   `<span>a</span>'s b`        mdsvex "a's b"      here "a’s b"
 *   `<svelte:component …>a -- b` mdsvex "a -- b"    here "a — b"
 *
 * What IS asserted is that every one of them is DETECTED, so the corpus gate
 * refuses a post that introduces such markup. The corpus carries none today.
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
	// A tag opener whose attribute body contains a less-than operator. The
	// previous rule matched a COMPLETE tag and required its attributes to hold no
	// angle brackets, so this slipped past a detector written for exactly it.
	'<svelte:component this={a < b} />x -- y',
	// Template directives are not tags at all.
	'{#if x}a -- b{/if}',
	'{#each xs as x}a -- b{/each}',
	'{#if x}a{:else}b -- c{/if}',
	'{@const y = "a -- b"}',
	'{@html "a -- b"}',
	'{@debug x}a -- b',
];

/**
 * Brace shapes that are ORDINARY prose and must stay unflagged.
 *
 * `{braces}` and a JSON object are not template directives, and a directive
 * rule that swept them up would fail posts for writing about JSON. Checked by
 * `runFalsePositiveCheck` alongside the thirty ordinary fixtures.
 */
export const ORDINARY_BRACE_FIXTURES: string[] = [
	'ordinary {braces} a -- b',
	'json { "a": 1 } a -- b',
];

/**
 * Every fixture must be seen as unsupported. Exit 1 if any is not.
 *
 * The detector is injectable so the controls can hand over a defective one and
 * require a failure.
 */
export function runUnsupportedMarkupDetection(
	fixtures: string[] = UNSUPPORTED_MARKUP_FIXTURES,
	quiet = false,
	detect: Detector = hasUnsupportedMarkup,
): number {
	const missed = fixtures.filter((source) => !detect(source));
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
 * everything. This requires ALL ordinary fixtures to stay unflagged, so a
 * detector that started guessing fails here even while every real shape stays
 * caught.
 */
export function runFalsePositiveCheck(
	fixtures: string[] = [...FIXTURES, ...ORDINARY_BRACE_FIXTURES],
	quiet = false,
	detect: Detector = hasUnsupportedMarkup,
): number {
	const flagged = fixtures.filter((source) => detect(source));
	if (flagged.length) {
		if (!quiet) {
			for (const source of flagged) console.error(`FALSE POSITIVE ${JSON.stringify(source)}`);
		}
		return 1;
	}
	if (!quiet) console.log(`false positives: 0/${fixtures.length}`);
	return 0;
}

/** Both directions, over the full fixture sets. */
export function runDetectorChecks(detect: Detector = hasUnsupportedMarkup, quiet = false): number {
	if (runUnsupportedMarkupDetection(UNSUPPORTED_MARKUP_FIXTURES, quiet, detect) !== 0) {
		if (!quiet) {
			console.error(
				'RESULT: unsupported-markup detection failed; the corpus gate would educate it silently',
			);
		}
		return 1;
	}
	if (runFalsePositiveCheck([...FIXTURES, ...ORDINARY_BRACE_FIXTURES], quiet, detect) !== 0) {
		if (!quiet) {
			console.error('RESULT: the detector flags ordinary markdown; it would block valid posts');
		}
		return 1;
	}
	if (!quiet) console.log('RESULT: the unsupported-markup detector discriminates');
	return 0;
}

if (process.argv[1]?.endsWith('assert-typography-oracle.ts')) {
	process.exit(runDetectorChecks());
}
