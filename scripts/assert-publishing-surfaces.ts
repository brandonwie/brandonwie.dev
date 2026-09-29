/**
 * Publishing surfaces -- sitemap, both RSS feeds and the Pagefind index.
 *
 *   pnpm migration:publishing                   # asserts next/build
 *   pnpm migration:publishing <candidate-dir>
 *
 * Requires a full `pnpm build:next`, not the bare workspace build: the
 * filter build skips the Pagefind step, leaving a pagefind-less tree the
 * S-rows fail against (observed 2026-09-17).
 *
 * The whole-site comparator (`migration-verify.ts`) already hashes the three
 * feeds by semantic shape and counts Pagefind fragments, but at Slice 1 that
 * comparator is red for 360+ unrelated reasons (every unported page), so a
 * green feed row could not be read off it. This file isolates the publishing
 * contracts so they can be proven now and keep being proven per commit.
 *
 * Inputs: the Next export (`next/build`), the post sources
 * (`src/content/posts/{en,ko}`) and the frozen baseline
 * `verification/baseline/svelte-e23e808.json`. The SvelteKit `build/` is
 * retired and is never read.
 *
 * What "proven" means here, per surface:
 *
 *   Feeds      the exported file exists as a FILE; its semantic shape
 *              (`feedShape` from the comparator: item/url counts, ordered
 *              links, titles) hashes to the frozen baseline value; and its
 *              entries agree with the published posts. The entry row replaces
 *              the retired byte comparison against the Svelte build, which
 *              existed because the semantic shape does not see `hreflang`
 *              alternates, `<lastmod>`, `<pubDate>` or `<category>`; those are
 *              now derived from post frontmatter (`draft`, `date`, `updated`,
 *              `tags`, `title`, `description`) and asserted per entry:
 *
 *                sitemap    every published EN post exactly once, and its KO
 *                           twin exactly once when a published translation
 *                           exists, with en / ko / x-default alternates and
 *                           `<lastmod>` = the EN post's `updated || date`;
 *                           every non-post entry carries its en / ko /
 *                           x-default alternates; no post route beyond these.
 *                rss.xml    every published EN post exactly once; KO rss
 *                           every published KO post plus the EN fallback for
 *                           each slug without a translation, all under /ko.
 *                           Per item: absolute brandonwie.dev link, guid equal
 *                           to it, title, description, RFC-822 `<pubDate>` of
 *                           the effective date, `<category>` = tags in order;
 *                           items newest first; channel link, self link and
 *                           language.
 *
 *   Pagefind   the bundle exists with both languages; the representative
 *              article has one fragment per locale whose url, title,
 *              `lang` and `category` filters are asserted EXACTLY (plan.md C10
 *              forbids "non-empty" assertions, since the search page
 *              substitutes '' / 'Untitled'); the fragment body contains a
 *              known sentence of the prose and none of the `data-pagefind-ignore`
 *              regions' text; and no page outside `/posts` and the allowlisted
 *              study routes (`INDEXED_NON_POST_URLS`) was indexed, which
 *              is what proves the body marker is scoped rather than absent.
 *
 * Fragments are read directly: a `.pf_fragment` is gzip whose payload is the
 * 12-byte marker `pagefind_dcd` followed by JSON. Querying through the browser
 * runtime (filters, excerpts, dev-mode masking) is the search page's contract,
 * not this file's.
 *
 * Three exit codes, as the sibling assertion scripts:
 *
 *   0   every row passes
 *   1   at least one row FAILED
 *   2   the script could not run at all (the build or an input is missing)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';

import matter from 'gray-matter';

import { feedShape } from './migration-verify.ts';

export const ARTICLE_SLUG = 'giscus-sveltekit-integration';
export const FEEDS = ['sitemap.xml', 'rss.xml', 'ko/rss.xml'] as const;
const BASELINE_JSON = 'verification/baseline/svelte-e23e808.json';
const POSTS_ROOT = 'src/content/posts';
const FRAGMENT_MARKER = 'pagefind_dcd';

/** The production origin every feed link must be absolute against. */
export const SITE = 'https://brandonwie.dev';

/** Exact expectations for the representative article's two fragments. */
export const ARTICLE_FRAGMENTS = {
	en: {
		url: `/posts/${ARTICLE_SLUG}.html`,
		title: 'Giscus SvelteKit Integration',
		category: 'frontend',
		prose: 'I wanted comments on my blog.',
		ignored: [
			'Comments will load here when the Giscus runtime is migrated.',
			'On this page',
			'Home',
		],
	},
	ko: {
		url: `/ko/posts/${ARTICLE_SLUG}.html`,
		title: 'Giscus SvelteKit 통합하기',
		category: 'frontend',
		prose: '블로그에 댓글 기능이 필요했어요.',
		ignored: ['Giscus 런타임을 마이그레이션하면 이곳에 댓글이 표시됩니다.', '이 글의 목차', '홈'],
	},
} as const;

type Status = 'PASS' | 'FAIL';

export interface Row {
	row: string;
	status: Status;
	detail: string;
}

export interface Fragment {
	url: string;
	content: string;
	word_count: number;
	filters: Record<string, string[]>;
	meta: Record<string, string>;
}

export function shapeHash(raw: string): string {
	return createHash('sha256').update(feedShape(raw)).digest('hex').slice(0, 16);
}

export function decodeFragment(file: string): Fragment {
	const bytes = gunzipSync(readFileSync(file));
	const marker = bytes.subarray(0, FRAGMENT_MARKER.length).toString('latin1');
	if (marker !== FRAGMENT_MARKER)
		throw new Error(
			`${file}: expected the ${FRAGMENT_MARKER} marker after gunzip, found ${JSON.stringify(marker)}`,
		);
	return JSON.parse(bytes.subarray(FRAGMENT_MARKER.length).toString('utf8'));
}

export function readFragments(buildDir: string): Fragment[] {
	const dir = join(buildDir, 'pagefind', 'fragment');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith('.pf_fragment'))
		.sort()
		.map((name) => decodeFragment(join(dir, name)));
}

// --- post sources -------------------------------------------------------------

/** One published (non-draft) post, dates in the string form the feeds print. */
export interface SourcePost {
	slug: string;
	title: string;
	description: string;
	date: string;
	updated?: string;
	tags: string[];
}

/**
 * YAML hands an unquoted date back as a `Date`; the feeds print its ISO form
 * (the SvelteKit endpoints received it JSON-serialised, and the Next port
 * restores that form). A quoted date stays the string it was written as.
 */
function dateText(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	return value instanceof Date ? value.toISOString() : String(value);
}

function walkMarkdown(dir: string, out: string[]): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory() || (entry.isSymbolicLink() && statSync(full).isDirectory()))
			walkMarkdown(full, out);
		else if (entry.name.endsWith('.md')) out.push(full);
	}
	return out;
}

/** Every non-draft post of a locale, keyed by slug (the file basename). */
export function loadPublishedPosts(
	locale: 'en' | 'ko',
	root = POSTS_ROOT,
): Map<string, SourcePost> {
	const dir = join(root, locale);
	const posts = new Map<string, SourcePost>();
	const files = walkMarkdown(dir, [])
		.map((file) => relative(dir, file).split(sep).join('/'))
		.sort();
	for (const rel of files) {
		const data = matter(readFileSync(join(dir, rel), 'utf8')).data as Record<string, unknown>;
		if (data.draft === true) continue;
		const slug = rel.split('/').pop()!.replace(/\.md$/, '');
		if (posts.has(slug)) throw new Error(`${locale} slug ${slug} is published twice under ${dir}`);
		posts.set(slug, {
			slug,
			title: String(data.title ?? ''),
			description: String(data.description ?? ''),
			date: dateText(data.date) ?? '',
			updated: dateText(data.updated),
			tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
		});
	}
	return posts;
}

/** `updated` when present and a different instant from `date`, otherwise `date`. */
export function effectiveDate(post: SourcePost): string {
	if (!post.updated) return post.date;
	return new Date(post.updated).getTime() !== new Date(post.date).getTime()
		? post.updated
		: post.date;
}

// --- feed parsing -------------------------------------------------------------

function decodeXml(value: string): string {
	return value
		.replace(/<!\[CDATA\[|\]\]>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function blocks(xml: string, tag: string): string[] {
	return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
}

function one(xml: string, tag: string): string | null {
	const found = blocks(xml, tag);
	return found.length === 1 ? found[0].trim() : null;
}

function show(value: unknown): string {
	return JSON.stringify(value);
}

/** Cap a problem list so a wholesale break stays readable. */
function summarise(problems: string[]): string {
	const head = problems.slice(0, 6).join('; ');
	return problems.length > 6 ? `${head}; ... ${problems.length - 6} more` : head;
}

interface SitemapEntry {
	loc: string;
	alternates: Record<string, string[]>;
	lastmod: string | null;
}

function sitemapEntries(xml: string): SitemapEntry[] {
	return blocks(xml, 'url').map((body) => {
		const alternates: Record<string, string[]> = {};
		for (const m of body.matchAll(/<xhtml:link\b([^>]*)\/>/g)) {
			const lang = m[1].match(/hreflang="([^"]*)"/)?.[1] ?? '';
			const href = m[1].match(/href="([^"]*)"/)?.[1] ?? '';
			(alternates[lang] ??= []).push(href);
		}
		return { loc: one(body, 'loc') ?? '', alternates, lastmod: one(body, 'lastmod') };
	});
}

function alternateProblems(
	entry: SitemapEntry,
	want: { en: string; ko: string | null; xDefault: string },
): string[] {
	const problems: string[] = [];
	const expected: Record<string, string | null> = {
		en: want.en,
		ko: want.ko,
		'x-default': want.xDefault,
	};
	for (const [lang, href] of Object.entries(expected)) {
		const got = entry.alternates[lang] ?? [];
		if (href === null) {
			if (got.length) problems.push(`${entry.loc} carries hreflang=${lang} ${show(got)}`);
		} else if (got.length !== 1 || got[0] !== href)
			problems.push(`${entry.loc} hreflang=${lang} ${show(got)} != [${show(href)}]`);
	}
	const extra = Object.keys(entry.alternates).filter((lang) => !(lang in expected));
	if (extra.length) problems.push(`${entry.loc} carries unexpected hreflang ${show(extra)}`);
	return problems;
}

const POST_LOC = new RegExp(`^${SITE.replace(/\./g, '\\.')}(/ko)?/posts/([^/]+)$`);

function sitemapProblems(
	xml: string,
	en: Map<string, SourcePost>,
	ko: Map<string, SourcePost>,
): { problems: string[]; posts: number; pages: number } {
	const problems: string[] = [];
	const entries = sitemapEntries(xml);
	const seen = new Map<string, number>();
	let pages = 0;
	for (const entry of entries) {
		seen.set(entry.loc, (seen.get(entry.loc) ?? 0) + 1);
		const post = entry.loc.match(POST_LOC);
		if (post) {
			const [, koPrefix, slug] = post;
			const source = en.get(slug);
			if (!source) {
				problems.push(`${entry.loc} is listed but no published EN post has slug ${slug}`);
				continue;
			}
			if (koPrefix && !ko.has(slug)) {
				problems.push(`${entry.loc} is listed but ${slug} has no published KO translation`);
				continue;
			}
			const enUrl = `${SITE}/posts/${slug}`;
			problems.push(
				...alternateProblems(entry, {
					en: enUrl,
					ko: ko.has(slug) ? `${SITE}/ko/posts/${slug}` : null,
					xDefault: enUrl,
				}),
			);
			const lastmod = source.updated || source.date;
			if (entry.lastmod !== lastmod)
				problems.push(`${entry.loc} <lastmod> ${show(entry.lastmod)} != ${show(lastmod)}`);
			continue;
		}
		// A non-post page: its EN/KO twins are the URL with and without `/ko`.
		pages += 1;
		if (!entry.loc.startsWith(SITE)) {
			problems.push(`<loc> ${show(entry.loc)} is not absolute on ${SITE}`);
			continue;
		}
		const path = entry.loc.slice(SITE.length);
		const enPath = path === '/ko' ? '' : path.replace(/^\/ko(?=\/)/, '');
		const koPath = enPath === '' ? '/ko' : `/ko${enPath}`;
		problems.push(
			...alternateProblems(entry, {
				en: `${SITE}${enPath}`,
				ko: `${SITE}${koPath}`,
				xDefault: `${SITE}${enPath}`,
			}),
		);
	}
	const want = [
		...[...en.keys()].map((slug) => `${SITE}/posts/${slug}`),
		...[...en.keys()].filter((slug) => ko.has(slug)).map((slug) => `${SITE}/ko/posts/${slug}`),
	];
	for (const loc of want) {
		const count = seen.get(loc) ?? 0;
		if (count !== 1) problems.push(`${loc} listed ${count} time(s), expected once`);
	}
	for (const [loc, count] of seen)
		if (count > 1 && !want.includes(loc)) problems.push(`${loc} listed ${count} times`);
	return { problems, posts: want.length, pages };
}

const RFC_822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

function rssProblems(
	xml: string,
	locale: 'en' | 'ko',
	en: Map<string, SourcePost>,
	ko: Map<string, SourcePost>,
): { problems: string[]; items: number } {
	const problems: string[] = [];
	const prefix = locale === 'ko' ? '/ko' : '';
	// The KO feed reads the whole corpus: the translation where one exists,
	// the English post otherwise.
	// NOTE: Korean-only posts ARE handled here: the map spans the union of both
	// locales and prefers ko.get(slug), so a KO post with no English source maps to
	// its own frontmatter, never to undefined -- the same composition as
	// feedPosts() in next/src/content/feeds.ts.
	const expected = new Map<string, SourcePost>(
		locale === 'en' ? en : [...en, ...ko].map(([slug]) => [slug, ko.get(slug) ?? en.get(slug)!]),
	);

	const channel = xml.replace(/<item>[\s\S]*?<\/item>/g, '');
	const home = `${SITE}${prefix}`;
	if (one(channel, 'link') !== home)
		problems.push(`channel <link> ${show(one(channel, 'link'))} != ${show(home)}`);
	const self = `<atom:link href="${SITE}${prefix}/rss.xml" rel="self" type="application/rss+xml"/>`;
	if (!channel.includes(self)) problems.push(`channel lacks ${self}`);
	const language = locale === 'ko' ? 'ko' : 'en-us';
	if (one(channel, 'language') !== language)
		problems.push(`channel <language> ${show(one(channel, 'language'))} != ${show(language)}`);

	const seen = new Map<string, number>();
	let previous = Number.POSITIVE_INFINITY;
	const items = blocks(xml, 'item');
	items.forEach((body, i) => {
		const link = one(body, 'link') ?? '';
		const at = `item[${i}] ${link}`;
		const slug = link.startsWith(`${SITE}${prefix}/posts/`)
			? link.slice(`${SITE}${prefix}/posts/`.length)
			: null;
		const post = slug === null ? undefined : expected.get(slug);
		if (!post) {
			problems.push(`${at} is not ${SITE}${prefix}/posts/<a published slug>`);
			return;
		}
		seen.set(post.slug, (seen.get(post.slug) ?? 0) + 1);
		const guid = body.match(/<guid isPermaLink="true">([^<]*)<\/guid>/)?.[1];
		if (guid !== link) problems.push(`${at} guid ${show(guid)} != the link`);
		const title = decodeXml(one(body, 'title') ?? '');
		if (title !== post.title) problems.push(`${at} title ${show(title)} != ${show(post.title)}`);
		const description = decodeXml(one(body, 'description') ?? '');
		if (description !== post.description)
			problems.push(`${at} description differs from the post frontmatter`);
		const pubDate = one(body, 'pubDate') ?? '';
		const want = new Date(effectiveDate(post)).toUTCString();
		if (!RFC_822.test(pubDate) || pubDate !== want)
			problems.push(`${at} <pubDate> ${show(pubDate)} != ${show(want)}`);
		const time = new Date(pubDate).getTime();
		if (time > previous) problems.push(`${at} <pubDate> ${pubDate} is newer than the item before`);
		if (!Number.isNaN(time)) previous = time;
		const categories = blocks(body, 'category').map(decodeXml);
		if (categories.join('\u0000') !== post.tags.join('\u0000'))
			problems.push(`${at} <category> ${show(categories)} != tags ${show(post.tags)}`);
	});
	for (const slug of expected.keys()) {
		const count = seen.get(slug) ?? 0;
		if (count !== 1) problems.push(`${SITE}${prefix}/posts/${slug} listed ${count} time(s)`);
	}
	return { problems, items: items.length };
}

// --- the rows -----------------------------------------------------------------

/**
 * Evaluate every row against a candidate Next export.
 *
 * @returns the row table and the exit code: 0 all pass, 1 any row failed, 2 an
 *   input is missing and nothing could be asserted (rows is then empty)
 */
export function evaluate(candidateDir: string): { code: 0 | 1 | 2; rows: Row[] } {
	const rows: Row[] = [];
	const pass = (row: string, detail: string): void =>
		void rows.push({ row, status: 'PASS', detail });
	const fail = (row: string, detail: string): void =>
		void rows.push({ row, status: 'FAIL', detail });

	if (!existsSync(candidateDir)) {
		console.error(`FATAL: candidate build not found: ${candidateDir}`);
		return { code: 2, rows };
	}
	if (!existsSync(BASELINE_JSON)) {
		console.error(`FATAL: frozen baseline not found: ${BASELINE_JSON}`);
		return { code: 2, rows };
	}
	for (const locale of ['en', 'ko'])
		if (!existsSync(join(POSTS_ROOT, locale))) {
			console.error(`FATAL: post sources not found: ${join(POSTS_ROOT, locale)}`);
			return { code: 2, rows };
		}
	const frozen = JSON.parse(readFileSync(BASELINE_JSON, 'utf8')) as {
		site: Record<string, string>;
	};
	for (const name of FEEDS)
		if (!frozen.site[name]) {
			console.error(`FATAL: ${BASELINE_JSON} carries no site hash for ${name}`);
			return { code: 2, rows };
		}
	// A duplicate published slug or unreadable frontmatter throws; keep it inside
	// the exit-code contract (2 = an input the harness cannot read), not an
	// unhandled rejection that exits 1 like a failed assertion.
	let en: Map<string, SourcePost>;
	let ko: Map<string, SourcePost>;
	try {
		en = loadPublishedPosts('en');
		ko = loadPublishedPosts('ko');
	} catch (error) {
		console.error(`FATAL: post sources unreadable: ${(error as Error).message}`);
		return { code: 2, rows };
	}

	// --- F1-F9  the three feeds --------------------------------------------
	let index = 1;
	for (const name of FEEDS) {
		const id = (): string => `F${index++}`;
		const candFile = join(candidateDir, name);
		const exported = existsSync(candFile) && statSync(candFile).isFile();
		if (exported) pass(`${id()} ${name} exported`, `file at ${candFile}`);
		else {
			fail(`${id()} ${name} exported`, `no FILE at ${candFile} (a directory or nothing)`);
			index += 2;
			continue;
		}
		const cand = readFileSync(candFile, 'utf8');

		const hash = shapeHash(cand);
		if (hash === frozen.site[name])
			pass(`${id()} ${name} semantic shape`, `feedShape hash ${hash} equals the frozen baseline`);
		else
			fail(
				`${id()} ${name} semantic shape`,
				`feedShape hash ${hash} != frozen ${frozen.site[name]}`,
			);

		const row = `${id()} ${name} entries match posts`;
		if (name === 'sitemap.xml') {
			const { problems, posts, pages } = sitemapProblems(cand, en, ko);
			if (problems.length === 0)
				pass(
					row,
					`${posts} post route(s) once each with hreflang en/ko/x-default and <lastmod>; ${pages} page route(s) with alternates`,
				);
			else fail(row, summarise(problems));
		} else {
			const locale = name === 'rss.xml' ? 'en' : 'ko';
			const { problems, items } = rssProblems(cand, locale, en, ko);
			if (problems.length === 0)
				pass(
					row,
					`${items} item(s): each published post once, link/guid/title/description/RFC-822 pubDate/categories, newest first`,
				);
			else fail(row, summarise(problems));
		}
	}

	// --- S1  the Pagefind bundle ---------------------------------------------
	const entryFile = join(candidateDir, 'pagefind', 'pagefind-entry.json');
	let fragments: Fragment[] = [];
	if (!existsSync(entryFile)) {
		fail('S1 Pagefind bundle', `missing ${entryFile}`);
	} else {
		const entry = JSON.parse(readFileSync(entryFile, 'utf8')) as {
			version: string;
			languages: Record<string, { page_count: number }>;
		};
		const languages = Object.keys(entry.languages).sort();
		try {
			fragments = readFragments(candidateDir);
		} catch (error) {
			fail('S1 Pagefind bundle', `fragment decode failed: ${(error as Error).message}`);
		}
		if (languages.join(',') === 'en,ko' && fragments.length > 0)
			pass(
				'S1 Pagefind bundle',
				`pagefind ${entry.version}, languages ${languages.join('+')}, ${fragments.length} fragment(s)`,
			);
		else if (!rows.some((r) => r.row === 'S1 Pagefind bundle'))
			fail(
				'S1 Pagefind bundle',
				`languages [${languages.join(', ')}] (expected en,ko), ${fragments.length} fragment(s)`,
			);
	}

	// --- S2-S3  the representative article's fragments ------------------------
	for (const [locale, expected] of Object.entries(ARTICLE_FRAGMENTS)) {
		const row = `S${locale === 'en' ? 2 : 3} ${locale.toUpperCase()} article fragment`;
		const matches = fragments.filter((f) => f.url === expected.url);
		if (matches.length !== 1) {
			fail(
				row,
				matches.length === 0
					? `no fragment with url ${expected.url}`
					: `${matches.length} fragments share url ${expected.url}; search would return the article twice`,
			);
			continue;
		}
		const fragment = matches[0];
		const problems: string[] = [];
		if (fragment.meta?.title !== expected.title)
			problems.push(
				`title ${JSON.stringify(fragment.meta?.title)} != ${JSON.stringify(expected.title)}`,
			);
		const lang = fragment.filters?.lang ?? [];
		if (lang.length !== 1 || lang[0] !== locale)
			problems.push(`filters.lang ${JSON.stringify(lang)} != ["${locale}"]`);
		const category = fragment.filters?.category ?? [];
		if (category.length !== 1 || category[0] !== expected.category)
			problems.push(`filters.category ${JSON.stringify(category)} != ["${expected.category}"]`);
		if (!fragment.content.includes(expected.prose))
			problems.push(`prose ${JSON.stringify(expected.prose)} not in the indexed body`);
		for (const text of expected.ignored)
			if (fragment.content.includes(text))
				problems.push(`ignored region text ${JSON.stringify(text)} leaked into the index`);
		if (problems.length === 0)
			pass(
				row,
				`url, title, lang=${locale}, category=${expected.category}, prose present, ${expected.ignored.length} ignored regions absent; ${fragment.word_count} words`,
			);
		else fail(row, problems.join('; '));
	}

	// --- S4  body marker scope -------------------------------------------------
	// Posts plus the Slice 4 study cohort. The Svelte index carried study
	// fragments (its StudyPageShell marked data-pagefind-body, same as the
	// port), so indexing them is intended, not leakage. Listed per-URL like
	// SHELL_CLAIMS: a prefix would silently approve the next surface (e.g.
	// /talks) without its own deliberate decision.
	const INDEXED_NON_POST_URLS = [
		'/study.html',
		'/study/dsa-i.html',
		'/study/dsa-ii.html',
		'/study/dsa-iii.html',
		'/study/dsa-iv.html',
		'/study/aws-ai-practitioner.html',
		'/ko/study.html',
		'/ko/study/dsa-i.html',
		'/ko/study/dsa-ii.html',
		'/ko/study/dsa-iii.html',
		'/ko/study/dsa-iv.html',
		'/ko/study/aws-ai-practitioner.html',
	];
	const outside = fragments
		.map((f) => f.url)
		.filter((url) => !/^(\/ko)?\/posts\//.test(url) && !INDEXED_NON_POST_URLS.includes(url));
	if (fragments.length > 0 && outside.length === 0)
		pass(
			'S4 body marker scope',
			`all ${fragments.length} fragment(s) are post or approved study pages`,
		);
	else if (fragments.length > 0)
		fail('S4 body marker scope', `non-post page(s) indexed: ${outside.join(', ')}`);
	else fail('S4 body marker scope', 'no fragments to scope');

	return { code: rows.some((r) => r.status === 'FAIL') ? 1 : 0, rows };
}

export async function runAssertions(candidateDir: string, quiet = false): Promise<number> {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};
	const { code, rows } = evaluate(candidateDir);
	if (code === 2) return 2;
	const width = Math.max(...rows.map((r) => r.row.length));
	say('\nROW TABLE');
	for (const { row, status, detail } of rows)
		say(`  ${status.padEnd(4)} ${row.padEnd(width)}  ${detail}`);
	const failed = rows.filter((r) => r.status === 'FAIL');
	say(`\nRESULT: ${rows.length - failed.length} pass, ${failed.length} fail`);
	if (failed.length) return 1;
	say(
		'Scope: sitemap, both RSS feeds and the index for one bilingual article. /feed, /ko/feed and _redirects are migration:feed; the search page runtime is not asserted here.',
	);
	return 0;
}

if (process.argv[1]?.endsWith('assert-publishing-surfaces.ts')) {
	runAssertions(process.argv[2] ?? 'next/build').then((code) => process.exit(code));
}
