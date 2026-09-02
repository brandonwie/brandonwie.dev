/**
 * The representative article — executable parity assertions.
 *
 *   pnpm migration:article                  # next/build against build/
 *   pnpm migration:article <candidate-dir> <baseline-dir>
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
 * The comparator now sees all three (`articleMeta`, and `<img>` capture widened
 * to the size pair, the hints and handler presence; controls 35-40 pin them).
 * This file asserts the SAME facts a second way, directly against the built
 * HTML, and owns the representative article's shell, locale, link, media and
 * fallback-chain contracts that the whole-page comparator cannot isolate.
 *
 * Three exit codes:
 *
 *   0   every row passes
 *   1   at least one row FAILED
 *   2   the script could not run at all (a build or the article is missing)
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

function internalLinkProblems(candidateDir: string, html: string): string[] {
	return tagsOf(html, 'a')
		.map((tag) => decodeEntities(attrOf(tag, 'href') ?? ''))
		.filter((href) => href.startsWith('/') && !href.startsWith('//'))
		.filter((href) => !exportedRouteExists(candidateDir, href))
		.map((href) => `${href} has no exported target`);
}

function shellProblems(html: string, locale: 'en' | 'ko'): string[] {
	const problems: string[] = [];
	const htmlTag = tagsOf(html, 'html')[0] ?? '';
	if (attrOf(htmlTag, 'lang') !== locale) problems.push(`html lang is not ${locale}`);
	if (tagsOf(html, 'main').length !== 1) problems.push('expected exactly one main landmark');
	if (tagsOf(html, 'h1').length !== 1) problems.push('expected exactly one h1');
	if (tagsOf(html, 'header').length < 1) problems.push('site header missing');
	if (tagsOf(html, 'nav').length < 1) problems.push('navigation landmark missing');
	if (tagsOf(html, 'footer').length !== 1) problems.push('site footer missing');
	if (tagsOf(html, 'article').length !== 1) problems.push('article landmark missing');
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
	baselineHtml: string,
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
	const baselineData = jsonLd(baselineHtml);
	const mainEntity = data?.mainEntityOfPage as Record<string, unknown> | undefined;
	if (!data) problems.push('JSON-LD missing or invalid');
	else {
		if (data.inLanguage !== expected.language) problems.push('JSON-LD inLanguage mismatch');
		if (mainEntity?.['@id'] !== expected.canonical) problems.push('JSON-LD canonical mismatch');
		if (typeof data.headline !== 'string' || data.headline.length === 0) {
			problems.push('JSON-LD headline missing');
		}
		for (const field of ['datePublished', 'dateModified'] as const) {
			const baselineValue = baselineData?.[field];
			if (typeof baselineValue !== 'string' || baselineValue.length === 0) {
				problems.push(`baseline JSON-LD ${field} missing or invalid`);
			} else if (data[field] !== baselineValue) {
				problems.push(`JSON-LD ${field} mismatch`);
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
	const candKoFile = join(candidateDir, 'ko', 'posts', `${ARTICLE_SLUG}.html`);
	const baseFile = join(baselineDir, 'posts', `${ARTICLE_SLUG}.html`);
	const baseKoFile = join(baselineDir, 'ko', 'posts', `${ARTICLE_SLUG}.html`);
	for (const [label, file] of [
		['candidate', candFile],
		['baseline', baseFile],
		['Korean baseline', baseKoFile],
	] as const) {
		if (!existsSync(file)) {
			console.error(`FATAL: ${label} article not found: ${file}`);
			return 2;
		}
	}
	const cand = readFileSync(candFile, 'utf8');
	const base = readFileSync(baseFile, 'utf8');
	const baseKo = readFileSync(baseKoFile, 'utf8');
	const candKo = existsSync(candKoFile) ? readFileSync(candKoFile, 'utf8') : '';

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
		...metadataProblems(cand, base, {
			canonical: `https://brandonwie.dev/posts/${ARTICLE_SLUG}`,
			locale: 'en_US',
			language: 'en-US',
		}).map((problem) => `en: ${problem}`),
		...(candKo
			? metadataProblems(candKo, baseKo, {
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

	const linkIssues = [
		...internalLinkProblems(candidateDir, cand).map((problem) => `en: ${problem}`),
		...(candKo
			? internalLinkProblems(candidateDir, candKo).map((problem) => `ko: ${problem}`)
			: []),
	];
	if (linkIssues.length === 0 && candKo) {
		pass(
			'A12 exported internal links',
			'every emitted internal anchor resolves in the static tree',
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

	const baseKoProse = proseHtml(baseKo);
	if (baseKoProse === null) {
		console.error('FATAL: could not locate the Korean baseline prose container; A14 is vacuous');
		return 2;
	}
	const baseKoText = visibleText(baseKoProse);
	if (baseKoText.length <= 1_000 || !/[가-힣]/.test(baseKoText)) {
		console.error('FATAL: Korean baseline prose is too short or carries no Hangul; A14 is vacuous');
		return 2;
	}
	const koProse = candKo ? proseHtml(candKo) : null;
	const koText = koProse ? visibleText(koProse) : '';
	if (koText === baseKoText) {
		pass(
			'A14 Korean prose parity',
			`${koText.length} characters, identical to the Korean baseline`,
		);
	} else {
		let at = 0;
		while (at < baseKoText.length && at < koText.length && baseKoText[at] === koText[at]) at += 1;
		fail(
			'A14 Korean prose parity',
			`baseline ${baseKoText.length} chars, candidate ${koText.length}; first difference at ${at}: ` +
				`${JSON.stringify(baseKoText.slice(Math.max(0, at - 40), at + 40))} != ` +
				`${JSON.stringify(koText.slice(Math.max(0, at - 40), at + 40))}`,
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
	say(
		'Scope: one bilingual representative article pair. The remaining post corpus and C13 route cohort are still open.',
	);
	return 0;
}

if (process.argv[1]?.endsWith('assert-article-parity.ts')) {
	runAssertions(process.argv[2] ?? 'next/build', process.argv[3] ?? 'build').then((code) =>
		process.exit(code),
	);
}
