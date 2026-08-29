/**
 * The representative article — executable parity assertions.
 *
 *   pnpm migration:article                  # next/build against build/
 *   pnpm migration:article <candidate-dir> <baseline-dir>
 *
 * Why this exists when a parity comparator already runs: the comparator hashes
 * the text of a WHOLE PAGE, and the candidate has no site chrome yet, so the
 * one field that would have caught the prose regression reads as a
 * chrome-shaped difference and the regression hides inside it. Three defects
 * shipped that way in the first port of this article, and the third is the
 * reason this file is scoped to the article rather than the page:
 *
 *   1. `article:published_time` was the runtime's LOCALE date string, so the
 *      built output depended on the timezone of the build machine.
 *   2. mdsvex enables smartypants by default; the replacement pipeline did not,
 *      so every em dash and every curly quote in 334 posts silently became
 *      ASCII.
 *   3. The hero lost its intrinsic size, both loading hints and its fallback
 *      handler.
 *
 * The comparator now sees all three (`articleMeta`, and `<img>` capture widened
 * to the size pair, the hints and handler presence; controls 35-40 pin them).
 * This file asserts the SAME facts a second way, directly against the built
 * HTML, and adds the two the comparator structurally cannot make: prose scoped
 * below the chrome, and the shape of the fallback chain.
 *
 * Three exit codes:
 *
 *   0   every row passes
 *   1   at least one row FAILED
 *   2   the script could not run at all (a build or the article is missing)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ARTICLE_SLUG = 'giscus-sveltekit-integration';

type Status = 'PASS' | 'FAIL';

interface Row {
	row: string;
	status: Status;
	detail: string;
}

/** Entity references the built pages actually use, decoded as a browser would. */
function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}

/**
 * The prose container, by balanced-tag walk from the `prose-terminal` class.
 *
 * The two stacks spell the class list differently — SvelteKit's is
 * `prose-terminal prose post__content` and the candidate's is `prose-terminal`
 * — so the anchor is the shared token, not the attribute. The walk is
 * necessary rather than fussy: the container holds nested `<div>`s (Shiki code
 * blocks, mermaid placeholders) and a non-greedy match to the first `</div>`
 * would truncate the body at the first code block on the page.
 */
function proseHtml(html: string): string | null {
	const anchor = html.indexOf('prose-terminal');
	if (anchor === -1) return null;
	const start = html.lastIndexOf('<div', anchor);
	if (start === -1) return null;
	let depth = 0;
	for (const m of html.slice(start).matchAll(/<(\/?)div\b[^>]*?(\/?)>/g)) {
		if (m[2] === '/') continue;
		depth += m[1] ? -1 : 1;
		if (depth === 0) return html.slice(start, start + m.index!);
	}
	return null;
}

/** Visible text, the way a reader receives it: tags gone, entities decoded. */
function visibleText(fragment: string): string {
	return decodeEntities(fragment.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

/** `article:*` meta tags in document order, duplicates preserved. */
function articleMeta(html: string): string[] {
	const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
	return [...head.matchAll(/<meta\b[^>]*property="(article:[^"]*)"[^>]*>/gi)].map((m) => {
		const content = m[0].match(/content="([^"]*)"/i)?.[1] ?? '';
		return `${m[1]} ${decodeEntities(content)}`;
	});
}

/** The hero `<img>` tag, or null. */
function heroTag(html: string): string | null {
	return (
		[...html.matchAll(/<img\b[^>]*>/gi)]
			.map((m) => m[0])
			.find((tag) => /src="\/hero\//.test(tag)) ?? null
	);
}

function attrOf(tag: string, name: string): string | null {
	return tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? null;
}

/**
 * Drive an `onerror` attribute the way a browser would, and record what it does.
 *
 * A6 used to check that the handler's text CONTAINED the two fallback URLs.
 * That is not a behavioral claim, and a reviewer proved it by replacing the
 * whole handler with the two URLs as bare string literals — inert code, and the
 * assertion still passed. Substring presence cannot tell a state machine from
 * its own comments.
 *
 * So the handler is executed against a fake image. `this` is the element, the
 * body runs verbatim, and the returned list is the src the element would load
 * after each successive failure, ending in `STOP` once the handler detaches
 * itself. The loop is bounded: a handler that never stops is a defect, not a
 * reason to hang.
 */
function driveFallback(handler: string, slug: string): string[] {
	const image = {
		dataset: {} as Record<string, string>,
		src: `/hero/${slug}.png`,
		onerror: handler as string | null,
	};
	const body = new Function(handler);
	const sequence: string[] = [];
	for (let step = 0; step < 5 && image.onerror !== null; step += 1) {
		body.call(image);
		sequence.push(image.onerror === null ? 'STOP' : image.src);
	}
	return sequence;
}

/** Characters smartypants produces. Counted, not just detected. */
function smartCounts(text: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const ch of text) {
		if ('—–‘’“”…'.includes(ch)) out[ch] = (out[ch] ?? 0) + 1;
	}
	return out;
}

export async function runAssertions(
	candidateDir: string,
	baselineDir: string,
	quiet = false,
): Promise<number> {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};
	const rows: Row[] = [];
	const pass = (row: string, detail: string): void =>
		void rows.push({ row, status: 'PASS', detail });
	const fail = (row: string, detail: string): void =>
		void rows.push({ row, status: 'FAIL', detail });

	const candFile = join(candidateDir, 'posts', `${ARTICLE_SLUG}.html`);
	const baseFile = join(baselineDir, 'posts', `${ARTICLE_SLUG}.html`);
	for (const [label, file] of [
		['candidate', candFile],
		['baseline', baseFile],
	] as const) {
		if (!existsSync(file)) {
			console.error(`FATAL: ${label} article not found: ${file}`);
			return 2;
		}
	}
	const cand = readFileSync(candFile, 'utf8');
	const base = readFileSync(baseFile, 'utf8');

	// --- A1  article:* metadata --------------------------------------------
	const baseMeta = articleMeta(base);
	const candMeta = articleMeta(cand);
	if (baseMeta.length === 0) {
		console.error('FATAL: the baseline article carries no article: metadata; A1-A2 are vacuous');
		return 2;
	}
	if (JSON.stringify(baseMeta) === JSON.stringify(candMeta)) {
		pass('A1 article:* metadata', `${candMeta.length} tag(s), same order, duplicates intact`);
	} else {
		fail(
			'A1 article:* metadata',
			`baseline ${JSON.stringify(baseMeta)} != candidate ${JSON.stringify(candMeta)}`,
		);
	}

	// --- A2  published_time is machine-readable ----------------------------
	// A1 alone would pass if BOTH sides regressed to a locale string. This row
	// is absolute rather than comparative for that reason.
	const published = candMeta.find((entry) => entry.startsWith('article:published_time '));
	const publishedValue = published?.slice('article:published_time '.length) ?? '';
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(publishedValue)) {
		pass('A2 published_time is ISO-8601 UTC', publishedValue);
	} else {
		fail(
			'A2 published_time is ISO-8601 UTC',
			`${JSON.stringify(publishedValue)} is not an ISO instant — a locale string here depends on the build machine's timezone`,
		);
	}

	// --- A3/A4  prose ------------------------------------------------------
	const basePr = proseHtml(base);
	const candPr = proseHtml(cand);
	if (basePr === null || candPr === null) {
		console.error('FATAL: could not locate the prose container on both sides');
		return 2;
	}
	const baseText = visibleText(basePr);
	const candText = visibleText(candPr);
	if (baseText === candText) {
		pass('A3 prose text', `${candText.length} characters, identical after entity decoding`);
	} else {
		let at = 0;
		while (at < baseText.length && at < candText.length && baseText[at] === candText[at]) at += 1;
		fail(
			'A3 prose text',
			`baseline ${baseText.length} chars, candidate ${candText.length}; first difference at ${at}: ` +
				`${JSON.stringify(baseText.slice(Math.max(0, at - 40), at + 40))} != ` +
				`${JSON.stringify(candText.slice(Math.max(0, at - 40), at + 40))}`,
		);
	}

	// A3 compares the two sides and would pass if both lost their typography.
	// This row is the absolute one: mdsvex runs smartypants by default, so the
	// baseline's counts are the contract.
	const baseSmart = smartCounts(baseText);
	const candSmart = smartCounts(candText);
	if (Object.keys(baseSmart).length === 0) {
		console.error('FATAL: the baseline prose carries no smart punctuation; A4 is vacuous');
		return 2;
	}
	if (JSON.stringify(baseSmart) === JSON.stringify(candSmart)) {
		pass('A4 smart typography', JSON.stringify(baseSmart));
	} else {
		fail(
			'A4 smart typography',
			`baseline ${JSON.stringify(baseSmart)} != candidate ${JSON.stringify(candSmart)}`,
		);
	}

	// --- A5/A6  hero -------------------------------------------------------
	const baseHero = heroTag(base);
	const candHero = heroTag(cand);
	if (baseHero === null) {
		console.error('FATAL: the baseline article carries no hero image; A5-A6 are vacuous');
		return 2;
	}
	if (candHero === null) {
		fail('A5 hero attributes', 'the candidate article has no /hero/ image at all');
		fail('A6 hero fallback chain', 'no hero image to carry a handler');
	} else {
		const ATTRS = ['src', 'alt', 'width', 'height', 'fetchpriority', 'decoding'];
		const mismatched = ATTRS.filter((name) => attrOf(baseHero, name) !== attrOf(candHero, name));
		if (mismatched.length === 0) {
			pass(
				'A5 hero attributes',
				ATTRS.map((name) => `${name}=${JSON.stringify(attrOf(candHero, name))}`).join(' '),
			);
		} else {
			fail(
				'A5 hero attributes',
				mismatched
					.map(
						(name) =>
							`${name}: baseline ${JSON.stringify(attrOf(baseHero, name))} != candidate ${JSON.stringify(attrOf(candHero, name))}`,
					)
					.join('; '),
			);
		}

		// The VALUE is not compared: SvelteKit's is the `this.__e=event`
		// delegation stub, a framework artifact no other stack will spell the same
		// way. What is asserted is that a handler exists on both sides, and that
		// RUNNING the candidate's walks the same three stages the Svelte component
		// does — hero, then the 1200x630 cover, then the default cover, then stop.
		const baseHandler = attrOf(baseHero, 'onerror');
		const candHandler = attrOf(candHero, 'onerror');
		const EXPECTED = [`/og/${ARTICLE_SLUG}.png`, '/og/default.png', 'STOP'];
		if (baseHandler === null || candHandler === null) {
			fail(
				'A6 hero fallback chain',
				`handler presence: baseline ${baseHandler === null ? 'ABSENT' : 'present'}, candidate ${candHandler === null ? 'ABSENT' : 'present'}`,
			);
		} else {
			let observed: string[];
			try {
				observed = driveFallback(decodeEntities(candHandler), ARTICLE_SLUG);
			} catch (error) {
				observed = [`THREW ${error instanceof Error ? error.message : String(error)}`];
			}
			if (JSON.stringify(observed) === JSON.stringify(EXPECTED)) {
				pass(
					'A6 hero fallback chain',
					`present on both sides; executing the candidate's handler yields ${observed.join(' -> ')}`,
				);
			} else {
				fail(
					'A6 hero fallback chain',
					`executing the candidate's handler yields ${JSON.stringify(observed)}, expected ${JSON.stringify(EXPECTED)}`,
				);
			}
		}
	}

	// --- report ------------------------------------------------------------
	const width = Math.max(...rows.map((r) => r.row.length));
	say('\nROW TABLE');
	for (const { row, status, detail } of rows)
		say(`  ${status.padEnd(4)} ${row.padEnd(width)}  ${detail}`);
	const failed = rows.filter((r) => r.status === 'FAIL');
	say(`\nRESULT: ${rows.length - failed.length} pass, ${failed.length} fail`);
	if (failed.length) return 1;
	say(
		'Scope: ONE article. The other 333 posts are not built by the candidate yet, and the site chrome around this one is still absent.',
	);
	return 0;
}

if (process.argv[1]?.endsWith('assert-article-parity.ts')) {
	runAssertions(process.argv[2] ?? 'next/build', process.argv[3] ?? 'build').then((code) =>
		process.exit(code),
	);
}
