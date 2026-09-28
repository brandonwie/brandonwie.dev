/**
 * Corpus-wide smart-typography invariants of the Next markdown pipeline.
 *
 *   pnpm migration:typography
 *
 * Every post under `src/content/posts` is rendered through
 * `next/src/markdown/pipeline.ts`, the only renderer the site has, and three
 * properties are asserted over the whole corpus:
 *
 *   unsupported markup  `remark-smart-typography` counts raw HTML and
 *                       Svelte-template shapes it refuses to educate. The count
 *                       must stay zero: a post carrying such markup would be
 *                       typeset on rules the preprocessor never claimed.
 *   unmapped nodes      a text node the preprocessor cannot map back to its
 *                       source offsets is silently left in ASCII. The count must
 *                       stay zero; a per-post check cannot see it when the post
 *                       has no smart characters at all.
 *   typeset volume      the rendered corpus must carry at least `MIN_SMART`
 *                       smart characters. A pipeline that stopped educating
 *                       would otherwise satisfy both counters above while
 *                       rendering every post in ASCII.
 *
 * HISTORY. Until the SvelteKit app was retired this suite also compared every
 * post's anchored smart characters against the built Svelte page (`build/`),
 * character for character. That comparison had the live Svelte rendering as its
 * oracle; with the app gone there is no independent rendering to compare
 * against, and a frozen copy of one would go stale on the next post. It was
 * dropped with its controls (CT-02, CT-03, CT-06, CT-07) and its content
 * exceptions. The three invariants above are the Next-side assertions it
 * already carried; the volume floor, previously a vacuity guard on the baseline
 * side, now applies to the pipeline's own output.
 *
 * Exit 0 = every invariant holds. Exit 1 = at least one does not, or the corpus
 * is too small to be meaningful. Exit 2 = it could not run.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderMarkdown } from '../src/markdown/pipeline';
import {
	unmappedNodeCount,
	unsupportedMarkupCount,
} from '../src/markdown/plugins/remark-smart-typography';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONTENT = join(REPO_ROOT, 'src/content/posts');

/** Characters the smart-typography educators produce. */
const SMART = '—–‘’“”…';

/** Every post is expected to reach the assertions; a shrinking corpus is a defect. */
export const MIN_POSTS = 334;

/** The rendered corpus typesets thousands of characters; fewer means education stopped. */
const MIN_SMART = 1000;

export interface RenderedPost {
	/** Path relative to the content root, e.g. `en/devops/foo.md`. */
	rel: string;
	/** The pipeline's rendered markup. */
	html: string;
}

/**
 * The two counters the assertions read.
 *
 * Injectable so a control can hand over a nonzero reading: the plugin's own
 * counters are cumulative module state with no reset, so a control that raised
 * them for real would poison every run after it.
 */
export interface PipelineCounters {
	unsupportedMarkup: () => number;
	unmappedNodes: () => number;
}

const LIVE_COUNTERS: PipelineCounters = {
	unsupportedMarkup: unsupportedMarkupCount,
	unmappedNodes: unmappedNodeCount,
};

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (entry.endsWith('.md')) out.push(full);
	}
	return out;
}

function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}

/**
 * Every smart character of a fragment, anchored, in document order.
 *
 * Each entry is `<word>#<index within the word>`. The assertions only count
 * them; the controls compare sequences to prove a mutation changed something.
 */
export function smartSequence(fragment: string): string[] {
	const text = decodeEntities(fragment.replace(/<[^>]+>/g, ' '));
	const anchors: string[] = [];
	for (const word of text.split(/\s+/)) {
		for (const [index, ch] of [...word].entries()) {
			if (SMART.includes(ch)) anchors.push(`${word}#${index}`);
		}
	}
	return anchors;
}

/** Render every post once. Expensive; the controls reuse one call. */
export async function renderCorpus(): Promise<RenderedPost[]> {
	const out: RenderedPost[] = [];
	for (const file of walk(CONTENT).sort()) {
		const rendered = await renderMarkdown(readFileSync(file, 'utf8'));
		out.push({ rel: relative(CONTENT, file), html: renderToStaticMarkup(rendered.content) });
	}
	return out;
}

export function runAssertions(
	corpus: RenderedPost[],
	mutate: (html: string, index: number) => string = (html) => html,
	quiet = false,
	counters: PipelineCounters = LIVE_COUNTERS,
): number {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};

	if (corpus.length < MIN_POSTS) {
		console.error(
			`CORPUS TOO SMALL: only ${corpus.length} post(s) reached the assertions, expected at least ${MIN_POSTS}`,
		);
		return 1;
	}

	// Raw HTML and Svelte-template shapes change which text is eligible for
	// education at all. The corpus carries none today; a post that introduced
	// some would be educated on rules the preprocessor cannot claim, so the count
	// is asserted rather than assumed to stay zero.
	const unsupported = counters.unsupportedMarkup();
	if (unsupported > 0) {
		console.error(
			`UNSUPPORTED MARKUP: ${unsupported} construct(s) reached the typography preprocessor; raw HTML and svelte:* / template shapes are refused, not educated (see assert-typography-oracle.ts)`,
		);
		return 1;
	}

	// A text node the preprocessor could not map back to its source offsets is
	// left in ASCII. That is invisible to any per-post count whenever the post
	// has no smart characters at all, so it is asserted directly.
	const unmapped = counters.unmappedNodes();
	if (unmapped > 0) {
		console.error(
			`UNMAPPED NODES: the typography preprocessor declined ${unmapped} text node(s); each one silently keeps ASCII punctuation`,
		);
		return 1;
	}

	// Both counters read zero on a pipeline that stopped educating altogether.
	// The rendered corpus typesets thousands of characters, so a floor catches it.
	let smartCharacters = 0;
	for (const [index, post] of corpus.entries()) {
		smartCharacters += smartSequence(mutate(post.html, index)).length;
	}
	if (smartCharacters < MIN_SMART) {
		console.error(
			`TYPESET VOLUME: the rendered corpus carries only ${smartCharacters} smart character(s) across ${corpus.length} posts, expected at least ${MIN_SMART}`,
		);
		return 1;
	}

	say(
		`\n${corpus.length} posts rendered, ${smartCharacters} smart character(s), 0 unsupported-markup constructs, 0 unmapped text nodes`,
	);
	say(`RESULT: ${corpus.length}/${corpus.length} posts satisfy the typography invariants`);
	return 0;
}

if (process.argv[1]?.endsWith('assert-corpus-typography.ts')) {
	const corpus = await renderCorpus();
	process.exit(runAssertions(corpus));
}
