/**
 * The representative article — executable assertions on the Next export.
 *
 *   pnpm migration:article                  # reads next/build
 *   pnpm migration:article <candidate-dir>
 *
 * Why this exists when a parity comparator already runs: the comparator hashes
 * the text of a WHOLE PAGE. During the first article port the candidate had no
 * site chrome, so the one field that would have caught the prose regression
 * read as a chrome-shaped difference and the regression hid inside it. Three
 * defects shipped that way, and the third is the reason this file is scoped to
 * the article rather than the page:
 *
 *   1. `article:published_time` was the runtime's LOCALE date string, so the
 *      built output depended on the timezone of the build machine.
 *   2. mdsvex enables smartypants by default; the replacement pipeline did not,
 *      so every em dash and every curly quote in 334 posts silently became
 *      ASCII.
 *   3. The hero lost its intrinsic size, both loading hints and its fallback
 *      handler.
 *
 * SVELTE RETIREMENT (2026-09-29). This file used to compare the article pair
 * against the live SvelteKit export (`build/`). That export no longer exists.
 * Rows whose oracle was the rendered Svelte article -- A1 (article:* meta
 * equality), A3 (English prose text equality) and the exact-count half of A4,
 * the JSON-LD date equality in A10, and A14's Korean prose equality -- are
 * dropped: freezing that HTML would go stale on the next content edit. What
 * each of those rows ALSO guaranteed about the Next output is kept, using only
 * the Next export: A2 (ISO published_time), A4 (smart punctuation present at
 * all), A10 (JSON-LD dates present) and A14 (Korean prose is substantial and
 * Hangul). A5's hero attributes were Svelte constants and are frozen as
 * literals citing their origin. Every other row always read only the Next
 * export and is unchanged: the representative article's shell, locale, link,
 * media and fallback-chain contracts that a whole-page comparator cannot
 * isolate.
 *
 * Three exit codes:
 *
 *   0   every row passes
 *   1   at least one row FAILED
 *   2   the script could not run at all (the build or the article is missing)
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

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
 * The anchor is the `prose-terminal` token, not the whole class attribute, so
 * layout classes added beside it cannot hide the container. The walk is
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

/** The document head, or the full document when its closing tag is absent. */
function headHtml(html: string): string {
	const end = html.search(/<\/head>/i);
	return end === -1 ? html : html.slice(0, end + '</head>'.length);
}

/** `article:*` meta tags in document order, duplicates preserved. */
function articleMeta(html: string): string[] {
	const head = headHtml(html);
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

function tagsOf(html: string, name: string): string[] {
	return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

function tagWith(html: string, name: string, attribute: string, value: string): string | null {
	return tagsOf(html, name).find((tag) => attrOf(tag, attribute) === value) ?? null;
}

function classToken(html: string, name: string, token: string): string | null {
	return (
		tagsOf(html, name).find((tag) =>
			(attrOf(tag, 'class') ?? '').split(/\s+/).filter(Boolean).includes(token),
		) ?? null
	);
}

function headLink(html: string, rel: string, hrefLang?: string): string | null {
	const head = headHtml(html);
	const tag = tagsOf(head, 'link').find(
		(candidate) =>
			attrOf(candidate, 'rel') === rel &&
			(hrefLang === undefined || attrOf(candidate, 'hreflang') === hrefLang),
	);
	return tag ? decodeEntities(attrOf(tag, 'href') ?? '') : null;
}

function headMeta(html: string, property: string): string | null {
	const head = headHtml(html);
	const tag = tagsOf(head, 'meta').find((candidate) => attrOf(candidate, 'property') === property);
	return tag ? decodeEntities(attrOf(tag, 'content') ?? '') : null;
}

function jsonLd(html: string): Record<string, unknown> | null {
	const body = html.match(
		/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
	)?.[1];
	if (!body) return null;
	try {
		return JSON.parse(body) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function duplicateIds(html: string): string[] {
	const ids = [...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
	return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

function fragmentProblems(html: string): string[] {
	const ids = new Set([...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]));
	return tagsOf(html, 'a')
		.map((tag) => decodeEntities(attrOf(tag, 'href') ?? ''))
		.filter((href) => href.startsWith('#') && href.length > 1 && !ids.has(href.slice(1)))
		.map((href) => `${href} has no matching id`);
}

function exportedFileExists(candidateDir: string, candidate: string): boolean {
	const root = resolve(candidateDir);
	const file = resolve(root, candidate);
	if (file !== root && !file.startsWith(`${root}${sep}`)) return false;
	try {
		return statSync(file).isFile();
	} catch {
		return false;
	}
}

function exportedRouteExists(candidateDir: string, href: string): boolean {
	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(href, 'https://static.invalid').pathname);
	} catch {
		return false;
	}
	if (pathname === '/') return exportedFileExists(candidateDir, 'index.html');
	const route = pathname.replace(/^\/+/, '').replace(/\/$/, '');
	return [`${route}.html`, join(route, 'index.html'), route].some((candidate) =>
		exportedFileExists(candidateDir, candidate),
	);
}

/**
 * Chrome link deferrals — the interim A12 criteria adopted 2026-09-06.
 *
 * Slice 3 PR 2a ported the real header and footer, whose nav and footer columns
 * link to routes later PRs build. Those links do not resolve yet. Rather than
 * drop the link-integrity assertion, each excused link is declared as a triple:
 * destination, locale, and the container it must appear in. A route-only
 * allowlist would also excuse an unrelated broken article-body link to the same
 * destination, which is exactly what this scoping prevents — and it is why the
 * AP-35 control, which mutates a bare `<a href="/">` in the article body, still
 * fails: the chrome's home link carries `class="site-brand"` and is a different
 * occurrence. (REDESIGN: that home link is now the title bar's `~`, which
 * carries `aria-label="Home"` inside `header.term-bar`.)
 *
 * A deferral asserts its destination is STILL ABSENT. When the owning port lands
 * and the route appears, the stale entry fails until it is removed, so the list
 * cannot outlive its reason.
 *
 * Full criteria, ownership and retirement schedule:
 * 3b projects/brandonwie.dev/actives/nextjs-migration/verification/contracts/
 * A12-chrome-link-deferrals.md. Retire with PR 3 (posts, tags, /ko), PR 6 (the
 * static pages) and Slice 4 (study); zero deferrals before cutover.
 */
// REDESIGN: the terminal shell's status line (`div.term-status`) sits outside
// the title bar, so it is a chrome container of its own.
type ChromeContainer = 'header' | 'status' | 'footer';

interface LinkDeferral {
	destination: string;
	locale: 'en' | 'ko';
	container: ChromeContainer;
	owner: string;
}

const CHROME_LINK_DEFERRALS: readonly LinkDeferral[] = [];

// REDESIGN: chrome containers are the terminal shell's title bar, status line
// and footer (`header.term-bar`, `div.term-status`, `footer.term-plan`), which
// replaced `header.site-nav` / `footer.site-footer`.
// REDESIGN: reviewer round 3: the status-line scroller must not be a navigation
// landmark, so it is a <div> (was <nav role="none">); it holds no nested div, so
// the first </div> closes it.
const CHROME_OPEN: Record<ChromeContainer, RegExp> = {
	header: /<header\b[^>]*class="[^"]*\bterm-bar\b/i,
	status: /<div\b[^>]*class="[^"]*\bterm-status\b/i,
	footer: /<footer\b[^>]*class="[^"]*\bterm-plan\b/i,
};
const CHROME_CLOSE: Record<ChromeContainer, string> = {
	header: '</header>',
	status: '</div>',
	footer: '</footer>',
};

/** The byte range of a candidate chrome container, or null if absent. */
function chromeRange(html: string, container: ChromeContainer): [number, number] | null {
	const match = CHROME_OPEN[container].exec(html);
	if (!match) return null;
	const closeTag = CHROME_CLOSE[container];
	const end = html.indexOf(closeTag, match.index);
	if (end === -1) return null;
	return [match.index, end + closeTag.length];
}

function containerAt(html: string, index: number): ChromeContainer | null {
	for (const container of ['header', 'status', 'footer'] as const) {
		const range = chromeRange(html, container);
		if (range && index >= range[0] && index < range[1]) return container;
	}
	return null;
}

export interface LinkReport {
	problems: string[];
	deferred: string[];
}

function internalLinkReport(candidateDir: string, html: string, locale: 'en' | 'ko'): LinkReport {
	const problems: string[] = [];
	const deferred: string[] = [];

	// Iterate matches, not tag STRINGS. An earlier revision looped over
	// `tagsOf(html, 'a')` and located each one with `html.indexOf(tag)`, which
	// returns the FIRST identical opening tag — so a second anchor spelled the
	// same way anywhere in the document inherited the first one's container. A
	// duplicate of the header's `<a href="/about" class="site-nav__link">`
	// placed inside <main> was classified as a header deferral and excused, and
	// the suite still reported 15 pass / 0 fail. AP-48 is that counterexample,
	// executed. Matching gives each occurrence its own offset.
	for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
		const tag = match[0];
		const href = decodeEntities(attrOf(tag, 'href') ?? '');
		if (!href.startsWith('/') || href.startsWith('//')) continue;
		if (exportedRouteExists(candidateDir, href)) continue;

		const container = containerAt(html, match.index);
		const entry = container
			? CHROME_LINK_DEFERRALS.find(
					(d) => d.destination === href && d.locale === locale && d.container === container,
				)
			: undefined;

		if (entry) {
			deferred.push(`${href} (${entry.container}, ${entry.owner})`);
		} else {
			problems.push(`${href} has no exported target`);
		}
	}

	// A deferral whose destination now exists is obsolete: the owning port landed
	// and the entry must go. Failing here is what forces that, instead of letting
	// the list quietly outlive its reason.
	for (const entry of CHROME_LINK_DEFERRALS) {
		if (entry.locale !== locale) continue;
		if (exportedRouteExists(candidateDir, entry.destination)) {
			problems.push(
				`${entry.destination} now exists — remove its ${entry.container} deferral (${entry.owner})`,
			);
		}
	}

	return { problems, deferred };
}

function shellProblems(html: string, locale: 'en' | 'ko'): string[] {
	const problems: string[] = [];
	const htmlTag = tagsOf(html, 'html')[0] ?? '';
	if (attrOf(htmlTag, 'lang') !== locale) problems.push(`html lang is not ${locale}`);
	if (tagsOf(html, 'main').length !== 1) problems.push('expected exactly one main landmark');
	if (tagsOf(html, 'h1').length !== 1) problems.push('expected exactly one h1');
	/**
	 * These three tokens name the Phosphor Fade terminal shell's own landmarks.
	 * History: they once read the Slice 1 PLACEHOLDER shell's `site-header` /
	 * `site-nav`, which the SvelteKit app never emitted, so the rows asserted
	 * the scaffolding rather than the real chrome until Slice 3 PR 2a exposed
	 * it. Each token requires a distinct element, so a missing title bar,
	 * status line or footer fails.
	 */
	// REDESIGN: site header is the terminal title bar `header.term-bar` (was `header.site-nav`).
	if (!classToken(html, 'header', 'term-bar')) problems.push('site header missing');
	// REDESIGN: site navigation is the tmux status line `nav.term-status` (was `nav.site-nav__links`).
	// REDESIGN: reviewer round 3: the status-line scroller must not be a navigation
	// landmark, so it is `div.term-status` (was `nav.term-status` with role="none").
	if (!classToken(html, 'div', 'term-status')) problems.push('site navigation missing');
	// REDESIGN: site footer is `footer.term-plan` (was `footer.site-footer`).
	if (!classToken(html, 'footer', 'term-plan')) problems.push('site footer missing');
	if (tagsOf(html, 'article').length !== 1 || !classToken(html, 'article', 'article-shell')) {
		problems.push('expected exactly one article-shell landmark');
	}
	const skip = classToken(html, 'a', 'skip-link');
	if (!skip || attrOf(skip, 'href') !== '#main-content') problems.push('skip link is missing');
	if (!tagWith(html, 'main', 'id', 'main-content')) problems.push('skip target is missing');
	if (duplicateIds(html).length > 0)
		problems.push(`duplicate ids: ${duplicateIds(html).join(', ')}`);
	problems.push(...fragmentProblems(html));
	const firstH1 = html.search(/<h1\b/i);
	const firstH2 = html.search(/<h2\b/i);
	if (firstH2 !== -1 && (firstH1 === -1 || firstH2 < firstH1)) problems.push('h2 precedes h1');
	return problems;
}

function metadataProblems(
	html: string,
	expected: { canonical: string; locale: string; language: string },
): string[] {
	const englishUrl = `https://brandonwie.dev/posts/${ARTICLE_SLUG}`;
	const koreanUrl = `https://brandonwie.dev/ko/posts/${ARTICLE_SLUG}`;
	const problems: string[] = [];
	if (headLink(html, 'canonical') !== expected.canonical) problems.push('canonical URL mismatch');
	for (const [language, url] of [
		['en', englishUrl],
		['ko', koreanUrl],
		['x-default', englishUrl],
	] as const) {
		if (headLink(html, 'alternate', language) !== url) {
			problems.push(`hreflang ${language} mismatch`);
		}
	}
	if (headMeta(html, 'og:url') !== expected.canonical) problems.push('og:url mismatch');
	if (headMeta(html, 'og:locale') !== expected.locale) problems.push('og:locale mismatch');
	const data = jsonLd(html);
	const mainEntity = data?.mainEntityOfPage as Record<string, unknown> | undefined;
	if (!data) problems.push('JSON-LD missing or invalid');
	else {
		if (data.inLanguage !== expected.language) problems.push('JSON-LD inLanguage mismatch');
		if (mainEntity?.['@id'] !== expected.canonical) problems.push('JSON-LD canonical mismatch');
		if (typeof data.headline !== 'string' || data.headline.length === 0) {
			problems.push('JSON-LD headline missing');
		}
		// The dates used to be compared to the Svelte export's JSON-LD. That
		// oracle is content-derived and retired; presence is what remains.
		for (const field of ['datePublished', 'dateModified'] as const) {
			const value = data[field];
			if (typeof value !== 'string' || value.length === 0) {
				problems.push(`JSON-LD ${field} missing or empty`);
			}
		}
	}
	return problems;
}

function chromeProblems(html: string): string[] {
	const problems: string[] = [];
	if (!classToken(html, 'ol', 'breadcrumb-list')) problems.push('breadcrumb missing');
	if (!classToken(html, 'ul', 'article-tags')) problems.push('tags missing');
	if (!classToken(html, 'nav', 'article-toc')) problems.push('static table of contents missing');
	if (!classToken(html, 'div', 'article-meta')) problems.push('article metadata missing');
	const articleHeader = classToken(html, 'header', 'article-header');
	if (!articleHeader) problems.push('article header missing');
	else {
		const content = html.slice(html.indexOf(articleHeader) + articleHeader.length);
		const firstElement = content.match(/^\s*(?:<!--[\s\S]*?-->\s*)*<([a-z][\w:-]*)\b/i)?.[1];
		if (firstElement?.toLowerCase() !== 'h1') problems.push('article header must begin with h1');
	}
	if (tagsOf(html, 'time').length < 1) problems.push('machine-readable date missing');
	return problems;
}

function commentsProblems(html: string, locale: 'en' | 'ko'): string[] {
	const problems: string[] = [];
	const mount = tagWith(html, 'div', 'id', 'giscus-comments');
	if (!mount) problems.push('comments mount missing');
	else {
		if (attrOf(mount, 'data-giscus-mount') !== 'true') problems.push('mount marker missing');
		if (attrOf(mount, 'data-giscus-term') !== ARTICLE_SLUG) problems.push('term mismatch');
		if (attrOf(mount, 'data-giscus-locale') !== locale) problems.push('locale mismatch');
	}
	const hasRuntime = tagsOf(html, 'script').some(
		(tag) => attrOf(tag, 'src') === 'https://giscus.app/client.js',
	);
	const hasFrame = tagsOf(html, 'iframe').some((tag) =>
		/(?:^|\s)giscus(?:-frame)?(?:\s|$)/.test(attrOf(tag, 'class') ?? ''),
	);
	if (hasRuntime || hasFrame) problems.push('Giscus runtime rendered in the boundary-only slice');
	return problems;
}

export async function runAssertions(candidateDir: string, quiet = false): Promise<number> {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};
	const rows: Row[] = [];
	const pass = (row: string, detail: string): void =>
		void rows.push({ row, status: 'PASS', detail });
	const fail = (row: string, detail: string): void =>
		void rows.push({ row, status: 'FAIL', detail });

	const candFile = join(candidateDir, 'posts', `${ARTICLE_SLUG}.html`);
	const candKoFile = join(candidateDir, 'ko', 'posts', `${ARTICLE_SLUG}.html`);
	if (!existsSync(candFile)) {
		console.error(`FATAL: candidate article not found: ${candFile}`);
		return 2;
	}
	const cand = readFileSync(candFile, 'utf8');
	const candKo = existsSync(candKoFile) ? readFileSync(candKoFile, 'utf8') : '';

	// A1 (article:* metadata equal to the Svelte export) is retired with that
	// export: its oracle was the rendered Svelte head. A2 still requires the
	// published_time tag to exist and be machine-readable.
	const candMeta = articleMeta(cand);

	// --- A2  published_time is machine-readable ----------------------------
	// Absolute rather than comparative: a locale string here depends on the
	// build machine's timezone.
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

	// --- A4  prose typography ----------------------------------------------
	// A3 (prose text equal to the Svelte export) and A4's exact per-character
	// counts took the rendered Svelte prose as their oracle and are retired. What
	// A4 also guaranteed is kept: the source markdown for this article carries
	// no literal smart punctuation (only ASCII quotes and `--`), so any em dash,
	// en dash, curly quote or ellipsis in the prose was produced by the smart
	// typography pass. None at all means the pass is off.
	const candPr = proseHtml(cand);
	if (candPr === null) {
		console.error('FATAL: could not locate the candidate prose container');
		return 2;
	}
	const candText = visibleText(candPr);
	const candSmart = smartCounts(candText);
	if (Object.keys(candSmart).length > 0) {
		pass('A4 smart typography present', JSON.stringify(candSmart));
	} else {
		fail(
			'A4 smart typography present',
			`the prose (${candText.length} characters) carries no smart punctuation — the smart typography pass did not run`,
		);
	}

	// --- A5/A6  hero -------------------------------------------------------
	const candHero = heroTag(cand);
	if (candHero === null) {
		fail('A5 hero attributes', 'the candidate article has no /hero/ image at all');
		fail('A6 hero fallback chain', 'no hero image to carry a handler');
	} else {
		// Frozen from the Svelte hero, which was a constant, not content: origin
		// src/lib/components/PostDetail.svelte:222-229 at 770bc30, with `src` from
		// `heroImage` (src/lib/seo.ts:15-17).
		const EXPECTED_HERO: Record<string, string> = {
			src: `/hero/${ARTICLE_SLUG}.png`,
			alt: '',
			width: '2400',
			height: '1260',
			fetchpriority: 'high',
			decoding: 'async',
		};
		const mismatched = Object.entries(EXPECTED_HERO).filter(
			([name, value]) => attrOf(candHero, name) !== value,
		);
		if (mismatched.length === 0) {
			pass(
				'A5 hero attributes',
				Object.keys(EXPECTED_HERO)
					.map((name) => `${name}=${JSON.stringify(attrOf(candHero, name))}`)
					.join(' '),
			);
		} else {
			fail(
				'A5 hero attributes',
				mismatched
					.map(
						([name, value]) =>
							`${name}: expected ${JSON.stringify(value)} != candidate ${JSON.stringify(attrOf(candHero, name))}`,
					)
					.join('; '),
			);
		}

		// The handler's VALUE is not compared, only its behavior: RUNNING the
		// candidate's handler must walk the same three stages the Svelte component
		// did (PostDetail.svelte:78-92 at 770bc30) — hero, then the 1200x630
		// cover, then the default cover, then stop.
		const candHandler = attrOf(candHero, 'onerror');
		const EXPECTED = [`/og/${ARTICLE_SLUG}.png`, '/og/default.png', 'STOP'];
		if (candHandler === null) {
			fail('A6 hero fallback chain', 'the candidate hero carries no onerror handler');
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
					`executing the candidate's handler yields ${observed.join(' -> ')}`,
				);
			} else {
				fail(
					'A6 hero fallback chain',
					`executing the candidate's handler yields ${JSON.stringify(observed)}, expected ${JSON.stringify(EXPECTED)}`,
				);
			}
		}
	}

	// --- A7-A15  bilingual article shell ----------------------------------
	if (candKo) {
		pass('A7 bilingual static output', 'English and Korean article HTML both exist');
	} else {
		fail('A7 bilingual static output', `Korean article not found: ${candKoFile}`);
	}

	const shellIssues = [
		...shellProblems(cand, 'en').map((problem) => `en: ${problem}`),
		...(candKo ? shellProblems(candKo, 'ko').map((problem) => `ko: ${problem}`) : []),
	];
	if (shellIssues.length === 0 && candKo) {
		pass('A8 locale document shells', 'lang, landmarks, skip targets, headings and ids are valid');
	} else {
		fail('A8 locale document shells', shellIssues.join('; ') || 'Korean shell unavailable');
	}

	const expectedSwitches = [
		{
			locale: 'en',
			html: cand,
			href: `/ko/posts/${ARTICLE_SLUG}`,
			other: 'ko',
		},
		{
			locale: 'ko',
			html: candKo,
			href: `/posts/${ARTICLE_SLUG}`,
			other: 'en',
		},
	] as const;
	const switchIssues = expectedSwitches.flatMap(({ locale, html, href, other }) => {
		const tag = tagWith(html, 'a', 'data-locale-switch', other);
		if (!tag) return [`${locale}: locale switch missing`];
		return [
			...(attrOf(tag, 'href') === href ? [] : [`${locale}: switch href mismatch`]),
			...(attrOf(tag, 'hreflang') === other ? [] : [`${locale}: switch hreflang mismatch`]),
			...(attrOf(tag, 'lang') === other ? [] : [`${locale}: switch language mismatch`]),
		];
	});
	if (switchIssues.length === 0 && candKo) {
		pass('A9 reciprocal locale switches', 'native anchors target the real EN and KO documents');
	} else {
		fail('A9 reciprocal locale switches', switchIssues.join('; ') || 'Korean switch unavailable');
	}

	const metadataIssues = [
		...metadataProblems(cand, {
			canonical: `https://brandonwie.dev/posts/${ARTICLE_SLUG}`,
			locale: 'en_US',
			language: 'en-US',
		}).map((problem) => `en: ${problem}`),
		...(candKo
			? metadataProblems(candKo, {
					canonical: `https://brandonwie.dev/ko/posts/${ARTICLE_SLUG}`,
					locale: 'ko_KR',
					language: 'ko-KR',
				}).map((problem) => `ko: ${problem}`)
			: []),
	];
	if (metadataIssues.length === 0 && candKo) {
		pass('A10 bilingual metadata and JSON-LD', 'canonical, hreflang, Open Graph and schema agree');
	} else {
		fail(
			'A10 bilingual metadata and JSON-LD',
			metadataIssues.join('; ') || 'Korean metadata unavailable',
		);
	}

	const chromeIssues = [
		...chromeProblems(cand).map((problem) => `en: ${problem}`),
		...(candKo ? chromeProblems(candKo).map((problem) => `ko: ${problem}`) : []),
	];
	if (chromeIssues.length === 0 && candKo) {
		pass('A11 semantic article chrome', 'breadcrumb, dates, category, tags and static ToC exist');
	} else {
		fail('A11 semantic article chrome', chromeIssues.join('; ') || 'Korean chrome unavailable');
	}

	const enLinks = internalLinkReport(candidateDir, cand, 'en');
	const koLinks = candKo
		? internalLinkReport(candidateDir, candKo, 'ko')
		: { problems: [], deferred: [] };
	const linkIssues = [
		...enLinks.problems.map((problem) => `en: ${problem}`),
		...koLinks.problems.map((problem) => `ko: ${problem}`),
	];
	const deferredLinks = [
		...enLinks.deferred.map((d) => `en: ${d}`),
		...koLinks.deferred.map((d) => `ko: ${d}`),
	];
	if (linkIssues.length === 0 && candKo) {
		// Never claim every link resolves while deferrals stand: the count and the
		// entries are named, so a reader sees the gap rather than a false all-clear.
		pass(
			'A12 exported internal links',
			deferredLinks.length === 0
				? 'every emitted internal anchor resolves in the static tree'
				: `every non-deferred internal anchor resolves; ${deferredLinks.length} chrome link(s) deferred to their owning ports: ${deferredLinks.join(', ')}`,
		);
	} else {
		fail('A12 exported internal links', linkIssues.join('; ') || 'Korean links unavailable');
	}

	const commentIssues = [
		...commentsProblems(cand, 'en').map((problem) => `en: ${problem}`),
		...(candKo ? commentsProblems(candKo, 'ko').map((problem) => `ko: ${problem}`) : []),
	];
	if (commentIssues.length === 0 && candKo) {
		pass('A13 comments mount boundary', 'stable localized mounts exist without Giscus runtime');
	} else {
		fail('A13 comments mount boundary', commentIssues.join('; ') || 'Korean boundary unavailable');
	}

	// A14 used to require the Korean prose to equal the Svelte export's. That
	// oracle is retired; what it also guaranteed is kept: the Korean article is a
	// real translation — substantial prose carrying Hangul — not an English
	// fallback or an empty shell. The thresholds are the ones the old row
	// demanded of its baseline before comparing.
	const koProse = candKo ? proseHtml(candKo) : null;
	const koText = koProse ? visibleText(koProse) : '';
	if (koText.length > 1_000 && /[가-힣]/.test(koText)) {
		pass('A14 Korean prose', `${koText.length} characters of Hangul-bearing prose`);
	} else {
		fail(
			'A14 Korean prose',
			koProse === null
				? 'no Korean prose container'
				: `${koText.length} characters, Hangul ${/[가-힣]/.test(koText) ? 'present' : 'absent'}; expected over 1000 characters carrying Hangul`,
		);
	}

	const requiredMedia = [`/hero/${ARTICLE_SLUG}.png`, `/og/${ARTICLE_SLUG}.png`, '/og/default.png'];
	const missingMedia = requiredMedia.filter(
		(asset) => !exportedFileExists(candidateDir, asset.replace(/^\/+/, '')),
	);
	if (missingMedia.length === 0) {
		pass('A15 static article media', 'hero and both fallback images exist in the export');
	} else {
		fail('A15 static article media', `missing exported asset(s): ${missingMedia.join(', ')}`);
	}

	// --- report ------------------------------------------------------------
	const width = Math.max(...rows.map((r) => r.row.length));
	say('\nROW TABLE');
	for (const { row, status, detail } of rows)
		say(`  ${status.padEnd(4)} ${row.padEnd(width)}  ${detail}`);
	const failed = rows.filter((r) => r.status === 'FAIL');
	say(`\nRESULT: ${rows.length - failed.length} pass, ${failed.length} fail`);
	if (failed.length) return 1;
	say('Scope: one bilingual representative article pair in the Next export.');
	return 0;
}

if (process.argv[1]?.endsWith('assert-article-parity.ts')) {
	runAssertions(process.argv[2] ?? 'next/build').then((code) => process.exit(code));
}
