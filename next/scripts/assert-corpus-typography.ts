/**
 * Corpus-wide smart-typography parity: executable assertions.
 *
 *   pnpm migration:typography
 *
 * The representative article's prose is asserted character for character by
 * `pnpm migration:article`. One article is not the claim that matters here.
 * mdsvex typesets EVERY post at build time, and the replacement pipeline's
 * educators are a transcription of mdsvex's: a transcription is a claim about
 * 334 files, so it is checked against 334 files.
 *
 * That is not academic. The first version of the ported plugin used the
 * published `retext-smartypants@6` and diverged on FIVE posts — same character
 * counts, opposite curl — and only a corpus-wide probe could see it. Four came
 * from one changed condition in the quote educator; the fifth came from a
 * text-node boundary that CommonMark draws differently than remark-parse 8.
 *
 * What is compared: every smart character ANCHORED to the word it sits in and
 * its index inside that word, in document order, candidate against the built
 * SvelteKit page.
 *
 * Each of those three properties was added because the cheaper version failed:
 *
 *   counts     every one of the five real mismatches had identical counts
 *   sequence   a reviewer MOVED a quote one visible character, leaving the
 *              sequence identical, and the check exited 0 on changed prose
 *   anchor     the word plus the offset inside it pins each character to the
 *              text, without depending on the rest of the sentence
 *
 * The anchor is deliberately the containing WORD and not a character window.
 * Fourteen posts differ from the baseline for reasons that have nothing to do
 * with typography — CommonMark escapes `\$` where remark-parse 8 kept the
 * backslash, GFM applies single-tilde strikethrough to `2~3`, and micromark
 * refuses the intraword `**“UTC”**로` that remark-parse 8 accepted. Those are
 * real content-parity findings and they belong to the surface port, not to this
 * check. A character window would drag all fourteen in as false failures; a
 * word-scoped anchor drags in two POSTS, enumerated below as three rows over two
 * causes rather than waved away — with the character itself still compared, so an exception
 * can forgive the word and never the typography.
 *
 * Exit 0 = every post's sequence matches. Exit 1 = at least one does not, or
 * the corpus is too small to be meaningful. Exit 2 = it could not run.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderMarkdown } from '../src/markdown/pipeline';
import { unmappedNodeCount } from '../src/markdown/plugins/remark-smart-typography';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONTENT = join(REPO_ROOT, 'src/content/posts');
const BUILD = join(REPO_ROOT, 'build');

/** Characters mdsvex's educators produce. */
const SMART = '—–‘’“”…';

/** Every post is expected to reach the comparison; a shrinking corpus is a defect. */
const MIN_POSTS = 334;

/**
 * Anchors that differ for a reason that is NOT typography.
 *
 * Three rows, two causes, two posts.
 *
 * A closed list, in the same spirit as `verification/exception-ledger.json`: an
 * entry names the post, both spellings of the word, and why they differ. It
 * forgives the WORD only — `anchorsAgree()` still requires the smart character
 * itself, and its offset inside each side's own word, to match — so no
 * exception here can hide a typography regression. Control CT-07 proves that by
 * mutating the character inside an exempted word and requiring a failure.
 *
 * Both entries are markdown-PARSING differences between remark-parse 8 and
 * micromark, and both are real findings owed to the surface port:
 *
 *   1. CommonMark treats `\$` as an escape and drops the backslash; remark 8
 *      did not, so the live site renders a stray backslash before the dollar.
 *      The candidate is the correct rendering and the baseline is the bug.
 *   2. `**“UTC”**로` is intraword emphasis against a Korean particle. remark 8
 *      accepted it; micromark's flanking rules do not, so the candidate leaves
 *      the asterisks literal. Here the BASELINE is correct.
 */
interface ContentException {
	post: string;
	baseline: string;
	candidate: string;
	reason: string;
}

const CONTENT_EXCEPTIONS: ContentException[] = [
	{
		post: 'en/devops/anthropic-prompt-cache-ttl.md',
		baseline: '\\$50–\\$100',
		candidate: '$50–$100',
		reason: 'CommonMark drops the backslash from `\\$`; remark-parse 8 kept it',
	},
	{
		post: 'en/devops/anthropic-prompt-cache-ttl.md',
		baseline: '~\\$10–\\$19.',
		candidate: '~$10–$19.',
		reason: 'CommonMark drops the backslash from `\\$`; remark-parse 8 kept it',
	},
	{
		post: 'ko/data/amplitude-export-api-timezone.md',
		baseline: '“UTC”',
		candidate: '**“UTC”**로',
		reason: 'micromark refuses the intraword emphasis `**“UTC”**로` that remark-parse 8 accepted',
	},
];

/** The smart character an anchor points at, or null if the anchor is malformed. */
function anchorChar(anchor: string): string | null {
	const cut = anchor.lastIndexOf('#');
	if (cut === -1) return null;
	const word = anchor.slice(0, cut);
	return [...word][Number(anchor.slice(cut + 1))] ?? null;
}

/**
 * Do two anchors describe the same typography?
 *
 * Equal anchors always agree. Unequal anchors agree only when an enumerated
 * content exception covers this exact pair of words for this post AND the smart
 * character both sides point at is the same one.
 */
function anchorsAgree(post: string, expected: string, actual: string): boolean {
	if (expected === actual) return true;
	const char = anchorChar(expected);
	if (char === null || char !== anchorChar(actual)) return false;
	const expectedWord = expected.slice(0, expected.lastIndexOf('#'));
	const actualWord = actual.slice(0, actual.lastIndexOf('#'));
	return CONTENT_EXCEPTIONS.some(
		(entry) =>
			entry.post === post && entry.baseline === expectedWord && entry.candidate === actualWord,
	);
}

export interface RenderedPost {
	/** Path relative to the content root, e.g. `en/devops/foo.md`. */
	rel: string;
	/** The candidate's rendered markup. */
	html: string;
	/** The baseline page's prose container. */
	baselineProse: string;
}

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

/** The prose container, by balanced-tag walk. Same method as the article assertions. */
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

/**
 * Every smart character of a fragment, anchored, in document order.
 *
 * Each entry is `<word>#<index within the word>`. Two entries are equal only
 * if the same character sits at the same offset of the same word, which is
 * what makes a relocation visible: moving `“` from the front of `abc` to
 * inside it turns `“abc#0` into `a“bc#1`.
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
		const rel = relative(CONTENT, file);
		const [locale] = rel.split('/');
		const slug = rel.split('/').pop()!.replace(/\.md$/, '');
		const builtPage =
			locale === 'ko'
				? join(BUILD, 'ko', 'posts', `${slug}.html`)
				: join(BUILD, 'posts', `${slug}.html`);
		if (!existsSync(builtPage)) continue;
		const baselineProse = proseHtml(readFileSync(builtPage, 'utf8'));
		if (baselineProse === null) continue;
		const rendered = await renderMarkdown(readFileSync(file, 'utf8'));
		out.push({ rel, html: renderToStaticMarkup(rendered.content), baselineProse });
	}
	return out;
}

export function runAssertions(
	corpus: RenderedPost[],
	mutate: (html: string, index: number) => string = (html) => html,
	quiet = false,
): number {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};

	if (corpus.length < MIN_POSTS) {
		console.error(
			`FATAL: only ${corpus.length} post(s) reached the comparison, expected at least ${MIN_POSTS}`,
		);
		return 2;
	}

	const failures: string[] = [];
	let smartCharacters = 0;

	for (const [index, post] of corpus.entries()) {
		const expected = smartSequence(post.baselineProse);
		const actual = smartSequence(mutate(post.html, index));
		smartCharacters += expected.length;
		const agree =
			expected.length === actual.length &&
			expected.every((anchor, i) => anchorsAgree(post.rel, anchor, actual[i]));
		if (agree) continue;
		let at = 0;
		while (
			at < expected.length &&
			at < actual.length &&
			anchorsAgree(post.rel, expected[at], actual[at])
		)
			at += 1;
		failures.push(
			`${post.rel}: baseline ${expected.length} anchored smart character(s), candidate ${actual.length}; ` +
				`first difference at ${at}: ${JSON.stringify(expected.slice(Math.max(0, at - 2), at + 2))} != ` +
				`${JSON.stringify(actual.slice(Math.max(0, at - 2), at + 2))}`,
		);
	}

	// A text node the preprocessor could not map back to its source offsets is
	// left in ASCII. That is invisible to a per-post comparison whenever the post
	// has no smart characters at all, so it is asserted directly.
	if (unmappedNodeCount() > 0) {
		console.error(
			`FATAL: the typography preprocessor declined ${unmappedNodeCount()} text node(s); each one silently keeps ASCII punctuation`,
		);
		return 2;
	}

	// A corpus that typesets nothing would compare empty to empty on every post
	// and report success. mdsvex typesets thousands of characters here.
	if (smartCharacters < 1000) {
		console.error(
			`FATAL: the baseline carries only ${smartCharacters} smart character(s) across ${corpus.length} posts; the comparison is vacuous`,
		);
		return 2;
	}

	say(
		`\n${corpus.length} posts compared, ${smartCharacters} anchored smart character(s) in the baseline prose`,
	);
	if (failures.length) {
		for (const line of failures) console.error(`TYPOGRAPHY MISMATCH ${line}`);
		console.error(`RESULT: ${failures.length}/${corpus.length} post(s) differ`);
		return 1;
	}
	say(`RESULT: ${corpus.length}/${corpus.length} posts match the baseline anchors exactly`);
	return 0;
}

if (process.argv[1]?.endsWith('assert-corpus-typography.ts')) {
	if (!existsSync(BUILD)) {
		console.error(`FATAL: SvelteKit build not found: ${BUILD} — run \`pnpm build\` first`);
		process.exit(2);
	}
	const corpus = await renderCorpus();
	process.exit(runAssertions(corpus));
}
