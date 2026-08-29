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
 * What is compared: the ORDERED SEQUENCE of smart characters in the prose, per
 * post, candidate against the built SvelteKit page. Sequence, not counts —
 * every one of the five mismatches had identical counts and a different order.
 *
 * Exit 0 = every post's sequence matches. Exit 1 = at least one does not, or
 * the corpus is too small to be meaningful. Exit 2 = it could not run.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderMarkdown } from '../src/markdown/pipeline';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONTENT = join(REPO_ROOT, 'src/content/posts');
const BUILD = join(REPO_ROOT, 'build');

/** Characters mdsvex's educators produce. */
const SMART = '—–‘’“”…';

/** Every post is expected to reach the comparison; a shrinking corpus is a defect. */
const MIN_POSTS = 334;

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

/** The smart characters of a markup fragment, in document order. */
export function smartSequence(fragment: string): string {
	const text = decodeEntities(fragment.replace(/<[^>]+>/g, ' '));
	return [...text].filter((ch) => SMART.includes(ch)).join('');
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
		if (expected === actual) continue;
		let at = 0;
		while (at < expected.length && at < actual.length && expected[at] === actual[at]) at += 1;
		failures.push(
			`${post.rel}: baseline ${expected.length} smart character(s), candidate ${actual.length}; ` +
				`first difference at ${at}: ${JSON.stringify(expected.slice(Math.max(0, at - 4), at + 4))} != ` +
				`${JSON.stringify(actual.slice(Math.max(0, at - 4), at + 4))}`,
		);
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
		`\n${corpus.length} posts compared, ${smartCharacters} smart character(s) in the baseline prose`,
	);
	if (failures.length) {
		for (const line of failures) console.error(`TYPOGRAPHY MISMATCH ${line}`);
		console.error(`RESULT: ${failures.length}/${corpus.length} post(s) differ`);
		return 1;
	}
	say(`RESULT: ${corpus.length}/${corpus.length} posts match the baseline sequence exactly`);
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
