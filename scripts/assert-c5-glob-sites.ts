/**
 * C5 -- the seventeen `import.meta.glob` call sites, proven through consumers.
 *
 *   pnpm migration:c5
 *   pnpm migration:c5 --svelte-build <dir>
 *
 * WHAT COUNTS AS PROOF HERE. An inventory row saying "site 5 becomes
 * `listPostsForLocale('en')`" asserts nothing: the strategy can be right and
 * the port still drop a draft filter, sort the other way, or key the Korean
 * fallback by path instead of slug. Every row below therefore compares the
 * Next data layer against something produced independently of it:
 *
 *   ORACLE ROWS   the Svelte build's own exported HTML. `build/posts.html`
 *                 lists 167 posts in the order `src/routes/posts/+page.ts`
 *                 sorted them; if the port's order differs by one pair, the
 *                 row goes red. The pages are the real downstream consumers
 *                 of five of the seven unported call sites, and they are read
 *                 as bytes, not re-derived.
 *
 *   FIXTURE ROWS  three semantics the live corpus cannot show, because it has
 *                 167 English posts, 167 Korean posts with the SAME slugs, and
 *                 zero drafts: draft filtering, the Korean-to-English fallback,
 *                 and its slug-keyed (not path-keyed) deduplication. Each runs
 *                 the real modules against a temporary corpus in a child whose
 *                 working directory is the fixture, which is how
 *                 `next/scripts/assert-posts-controls.ts` already isolates
 *                 `CONTENT_ROOT`.
 *
 *   S2 ROWS       slug derivation over all 334 source files, plus the forced
 *                 failure: a path that yields an empty slug must raise a
 *                 diagnostic naming it, never a `<loc>` or `<guid>` pointing at
 *                 the list page. That half is shared C5/C8 evidence.
 *
 * The seventeenth call site, `src/routes/ko/system/3b/+page.ts:11`, is read
 * from the BUILT Korean page: its blog-series titles have to survive the
 * localization merge into `next/build/ko/system/3b.html`, which is the only
 * place that call site's output becomes observable.
 *
 * Three exit codes, as the sibling assertion scripts:
 *
 *   0   every row passes
 *   1   at least one row FAILED
 *   2   the script could not run at all (a build is missing)
 */
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_URL } from '../src/lib/seo.ts';

const require = createRequire(import.meta.url);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const NEXT_ROOT = join(REPO_ROOT, 'next');
const PROBE_ENV = 'C5_FIXTURE_PROBE';

/** Files whose basenames the S2 rows check, and the two that are not lower-case. */
const MIXED_CASE_SLUGS = ['updatedAt-staleness-guard', 'test-L-vs-realpath-symlink-detection'];

/**
 * The one slug-derivation expression, written the same way at all twelve sites.
 *
 * S2's positive half is "all twelve slug-derivation sites enumerated, each
 * producing the expected slug from a real path" (`plan.md:677`). Enumerating
 * them as a hard-coded list would prove nothing on its own -- a thirteenth site
 * could appear and the list would still pass -- so the row RECOMPUTES the set
 * from source and compares it to this one, then runs the source expression
 * itself against every real path.
 */
const SVELTE_SLUG_EXPRESSION = ".split('/').pop()?.replace('.md', '') ?? ''";

/** The twelve sites, as `plan.md:612-618` enumerates them. */
const SLUG_SITES = [
	'src/routes/+layout.ts:30',
	'src/routes/+page.ts:24',
	'src/routes/ko/+page.ts:22',
	'src/routes/ko/posts/+page.ts:28',
	'src/routes/ko/posts/+page.ts:37',
	'src/routes/ko/rss.xml/+server.ts:38',
	'src/routes/ko/rss.xml/+server.ts:53',
	'src/routes/ko/system/3b/+page.ts:19',
	'src/routes/posts/+page.ts:16',
	'src/routes/rss.xml/+server.ts:30',
	'src/routes/sitemap.xml/+server.ts:33',
	'src/routes/sitemap.xml/+server.ts:40',
] as const;

/** The source expression, evaluated exactly as the twelve sites evaluate it. */
function svelteSlug(pathOrGlobKey: string): string {
	return pathOrGlobKey.split('/').pop()?.replace('.md', '') ?? '';
}

/** Every `file:line` under `src/` whose line holds the derivation expression. */
function findSlugSites(repoRoot: string): string[] {
	const found: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (/\.(ts|svelte|js)$/.test(entry.name)) {
				readFileSync(full, 'utf8')
					.split('\n')
					.forEach((line, index) => {
						if (line.includes(SVELTE_SLUG_EXPRESSION))
							found.push(`${relative(repoRoot, full)}:${index + 1}`);
					});
			}
		}
	};
	walk(join(repoRoot, 'src'));
	return found.sort();
}

interface Row {
	row: string;
	status: 'PASS' | 'FAIL';
	detail: string;
}

/**
 * Post slugs in the order an exported page links them.
 *
 * Only `/posts/<slug>` and `/ko/posts/<slug>` hrefs count: `/posts` (the list
 * link in the nav) has no second segment and is skipped, so the nav cannot
 * inflate the sequence.
 */
function linkedSlugs(html: string, prefix: '' | '/ko'): string[] {
	const pattern = new RegExp(`href="${prefix}/posts/([^"/#?]+)"`, 'g');
	return [...html.matchAll(pattern)].map((match) => match[1]);
}

function sequenceProblem(actual: string[], expected: string[]): string | null {
	if (actual.length !== expected.length)
		return `${actual.length} entries, expected ${expected.length}`;
	const at = actual.findIndex((slug, index) => slug !== expected[index]);
	if (at === -1) return null;
	return `position ${at}: ${actual[at]} != ${expected[at]}`;
}

/** The sitemap row's verdict, as a pure function so a control can doctor its input. */
export interface SitemapSets {
	englishUrls: string[];
	koreanUrls: string[];
	alternates: string[];
	englishExpected: string[];
	koreanExpected: string[];
	alternatesExpected: string[];
}

/**
 * Null when the sitemap matches, else the first disagreement.
 *
 * EVERY CLAUSE NAMES A COUNT. The first version asked only whether any Korean
 * URL was empty and whether every alternate was backed by a Korean file. Both
 * are vacuously true of an EMPTY array, so deleting all 167 Korean URL blocks
 * left the row green — the reviewer demonstrated exactly that. Controls D12 and
 * D13 are those deletions, and they are why this is a function rather than a
 * chain of `??` inside the row.
 */
export function sitemapVerdict(sets: SitemapSets): string | null {
	const sameSet = (actual: string[], expected: string[]) =>
		actual.length === expected.length &&
		[...actual].sort().join(',') === [...expected].sort().join(',');
	return (
		sequenceProblem(sets.englishUrls, sets.englishExpected) ??
		sequenceProblem(sets.koreanUrls, sets.koreanExpected) ??
		(sets.englishUrls.some((slug) => slug === '') ? 'an English URL has an empty slug' : null) ??
		(sets.koreanUrls.some((slug) => slug === '') ? 'a Korean URL has an empty slug' : null) ??
		(sets.alternates.length === 0 ? 'the sitemap emits no hreflang alternates at all' : null) ??
		(sameSet(sets.alternates, sets.alternatesExpected)
			? null
			: `alternates are ${sets.alternates.length} entries, expected exactly the ${sets.alternatesExpected.length} English posts with a Korean file`)
	);
}

/** One fixture corpus, written under a scratch root shaped like the repository. */
function writeFixture(root: string): void {
	const post = (title: string, date: string, updated?: string, draft = false) =>
		`---\ntitle: ${title}\ndescription: Fixture\ndate: '${date}'\n${
			updated ? `updated: '${updated}'\n` : ''
		}tags:\n  - fixture\ncategory: fixture${draft ? '\ndraft: true' : ''}\n---\n\nBody.\n`;

	const files: [string, string][] = [
		// English: two same-date posts (tie-break), one with a newer `updated`,
		// one draft, and one with no Korean twin (the fallback's only source).
		['src/content/posts/en/alpha/one.md', post('EN One', '2026-01-01')],
		['src/content/posts/en/alpha/two.md', post('EN Two', '2026-01-01')],
		['src/content/posts/en/beta/three.md', post('EN Three', '2026-01-02', '2026-03-01')],
		['src/content/posts/en/beta/hidden.md', post('EN Hidden', '2026-04-01', undefined, true)],
		['src/content/posts/en/beta/only-en.md', post('EN Only', '2026-02-01')],
		// Published in English, DRAFTED in Korean. Both stacks add to the dedup set
		// AFTER the draft filter, so this must still fall back to English.
		['src/content/posts/en/beta/ko-drafted.md', post('EN Ko-Drafted', '2026-01-15')],
		// Korean: `two` is filed under a DIFFERENT category, so a path-keyed
		// fallback would wrongly re-add the English `two`.
		['src/content/posts/ko/alpha/one.md', post('KO One', '2026-01-01')],
		['src/content/posts/ko/gamma/two.md', post('KO Two', '2026-01-01')],
		['src/content/posts/ko/beta/three.md', post('KO Three', '2026-01-02', '2026-03-01')],
		['src/content/posts/ko/beta/hidden-ko.md', post('KO Hidden', '2026-04-01', undefined, true)],
		[
			'src/content/posts/ko/beta/ko-drafted.md',
			post('KO Ko-Drafted', '2026-01-15', undefined, true),
		],
	];

	mkdirSync(join(root, 'next'), { recursive: true });
	for (const [relative, source] of files) {
		const file = join(root, relative);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, source);
	}
}

/** A corpus holding one file whose basename derives an empty slug. */
function writeBrokenFixture(root: string): void {
	writeFixture(root);
	// `walk()` collects anything ending in `.md`, so a file named exactly `.md`
	// reaches slug derivation and must stop it there -- before a `<loc>` or a
	// `<guid>` naming the list page is emitted.
	writeFileSync(
		join(root, 'src/content/posts/en/beta/.md'),
		`---\ntitle: Broken\ndescription: Fixture\ndate: '2026-01-01'\ntags:\n  - fixture\ncategory: fixture\n---\n\nBody.\n`,
	);
}

/**
 * The three series slugs the system fixture pins, and the drafted title that
 * must never reach the page.
 *
 * They are real slugs from the real snapshot, because the snapshot is imported
 * by module path and is NOT redirected by the fixture's working directory --
 * only the post corpus is. So the fixture controls exactly one variable: which
 * Korean posts exist for those slugs.
 */
const SYSTEM_FIXTURE = {
	/** Has a published Korean post: its Korean title must win. */
	localized: 'one-folder-three-agents',
	/** Has a DRAFTED Korean post: the English title must win and the draft must not leak. */
	drafted: 'rules-that-route-themselves',
	/** Has no Korean post at all: the English title must win. */
	untranslated: 'skills-three-transports',
	localizedTitle: 'KO Localized Series Entry',
	draftedTitle: 'KO Drafted Series Entry',
} as const;

/**
 * A corpus that exercises the two series branches the live corpus cannot.
 *
 * The live corpus has a published Korean post for all ten series slugs, so
 * neither the untranslated fallback nor the draft exclusion has a single live
 * instance. This writes a Korean corpus holding exactly one published and one
 * drafted series post, and omits the third slug entirely.
 */
function writeSystemFixture(root: string): void {
	const post = (title: string, draft = false) =>
		`---\ntitle: ${title}\ndescription: Fixture\ndate: '2026-01-01'\ntags:\n  - fixture\ncategory: fixture${
			draft ? '\ndraft: true' : ''
		}\n---\n\nBody.\n`;

	const files: [string, string][] = [
		[
			`src/content/posts/ko/fixture/${SYSTEM_FIXTURE.localized}.md`,
			post(SYSTEM_FIXTURE.localizedTitle),
		],
		[
			`src/content/posts/ko/fixture/${SYSTEM_FIXTURE.drafted}.md`,
			post(SYSTEM_FIXTURE.draftedTitle, true),
		],
		// SYSTEM_FIXTURE.untranslated is deliberately absent.
		['src/content/posts/en/fixture/placeholder.md', post('EN Placeholder')],
	];
	for (const [relative, body] of files) {
		const absolute = join(root, relative);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, body);
	}
	// `posts.ts` resolves its content root from the working directory, so the
	// child is rooted here; the directory must exist for `next build`'s sibling
	// assumption to hold.
	mkdirSync(join(root, 'next'), { recursive: true });
}

interface SystemProbe {
	/** The rendered Korean page, scripts already stripped by the child. */
	markup: string;
	/** What `koreanTitleBySlug()` made of the fixture corpus. */
	koreanTitles: Record<string, string>;
	/** Series list items in the rendered markup. */
	seriesItems: number;
}

interface ProbeResult {
	en: string[];
	ko: string[];
	koTitles: string[];
	fallback: string[];
	emptySlug: string | null;
	feedsAgree: boolean;
	rssHasEmptyLink: boolean;
}

/** Run the real modules against a fixture corpus, in a child rooted at it. */
function probeFixture<T>(root: string, mode: 'lists' | 'article' | 'generators' | 'system'): T {
	const child = spawnSync(process.execPath, ['--import', require.resolve('tsx'), SCRIPT_PATH], {
		cwd: join(root, 'next'),
		encoding: 'utf8',
		env: {
			...process.env,
			[PROBE_ENV]: mode,
			TSX_TSCONFIG_PATH: join(NEXT_ROOT, 'tsconfig.json'),
		},
	});
	if (child.status !== 0)
		throw new Error(`fixture probe failed (${child.status ?? child.signal}):\n${child.stderr}`);
	return JSON.parse(child.stdout) as T;
}

/** Every field a page uses to declare which language its body is in. */
export interface ArticleLocaleFields {
	ogLocale: string | null;
	alternateLocale: string[];
	canonical: string | null;
	noindex: boolean;
	jsonLdInLanguage: string | null;
	jsonLdId: string | null;
	langFacet: string | null;
}

/** What those fields must say for a body written in `locale`, served at `url`. */
export function articleLocaleVerdict(
	fields: ArticleLocaleFields,
	expected: { locale: 'en' | 'ko'; url: string; alternateLocale: string[]; noindex: boolean },
): string | null {
	const ogCode = expected.locale === 'ko' ? 'ko_KR' : 'en_US';
	const languageTag = expected.locale === 'ko' ? 'ko-KR' : 'en-US';
	const problems: string[] = [];
	if (fields.ogLocale !== ogCode)
		problems.push(`og:locale is ${String(fields.ogLocale)}, expected ${ogCode}`);
	if (fields.alternateLocale.join(',') !== expected.alternateLocale.join(','))
		problems.push(
			`og:locale:alternate is [${fields.alternateLocale.join(', ')}], expected [${expected.alternateLocale.join(', ')}]`,
		);
	if (fields.jsonLdInLanguage !== languageTag)
		problems.push(
			`JSON-LD inLanguage is ${String(fields.jsonLdInLanguage)}, expected ${languageTag}`,
		);
	if (fields.jsonLdId !== expected.url)
		problems.push(`JSON-LD @id is ${String(fields.jsonLdId)}, expected ${expected.url}`);
	if (fields.canonical !== expected.url)
		problems.push(`canonical is ${String(fields.canonical)}, expected ${expected.url}`);
	if (fields.langFacet !== expected.locale)
		problems.push(
			`the Pagefind lang facet is ${String(fields.langFacet)}, expected ${expected.locale}`,
		);
	if (fields.noindex !== expected.noindex)
		problems.push(`noindex is ${fields.noindex}, expected ${expected.noindex}`);
	return problems.length === 0 ? null : problems.join('; ');
}

/** What the Korean article route does with a fixture corpus, as rendered markup. */
interface ArticleProbe {
	fallbackMarkup: string;
	fallbackFields: ArticleLocaleFields;
	draftedOutcome: 'not-found' | 'rendered' | 'other';
	draftedMetadataKeys: string[];
	translatedFields: ArticleLocaleFields;
}

/** What the feed and sitemap generators do with an underivable path. */
interface GeneratorProbe {
	sitemapError: string | null;
	rssError: string | null;
	sitemapEmitted: string | null;
	rssEmitted: string | null;
}

/** The child half: prints what the real modules make of the fixture corpus. */
async function runProbe(mode: string): Promise<number> {
	if (mode === 'article') return runArticleProbe();
	if (mode === 'generators') return runGeneratorProbe();
	if (mode === 'system') return runSystemProbe();

	const { listPostsForLocale, listKoreanPostsWithEnglishFallback } =
		await import('../next/src/content/post-list.ts');
	const { postSlugFrom } = await import('../next/src/content/posts.ts');
	const { rssXml } = await import('../next/src/content/feeds.ts');

	let emptySlug: string | null = null;
	try {
		postSlugFrom('src/content/posts/en/beta/.md');
	} catch (error) {
		emptySlug = error instanceof Error ? error.message : String(error);
	}

	const fallback = listKoreanPostsWithEnglishFallback();
	const koreanRss = rssXml('ko');
	const result: ProbeResult = {
		en: listPostsForLocale('en').map((post) => post.slug),
		ko: listPostsForLocale('ko').map((post) => post.slug),
		koTitles: listPostsForLocale('ko').map((post) => post.frontmatter.title),
		fallback: fallback.map((post) => `${post.lang}:${post.slug}`),
		emptySlug,
		// The Korean feed derives the same fallback independently
		// (`feeds.ts:178-187`); a row asserts the two agree rather than
		// assuming it.
		feedsAgree:
			[...koreanRss.matchAll(/<link>[^<]*\/ko\/posts\/([^<]+)<\/link>/g)]
				.map((match) => match[1])
				.join(',') === fallback.map((post) => post.slug).join(','),
		rssHasEmptyLink: /\/ko\/posts\/<\/link>/.test(koreanRss),
	};
	process.stdout.write(JSON.stringify(result));
	return 0;
}

/**
 * Render the Korean article route against the fixture corpus.
 *
 * `only-en` has no Korean post, so the route must serve the English body with
 * the notice and index it as English. `ko-drafted` HAS a Korean post that is
 * drafted, so the route must 404 rather than quietly serve English in its
 * place -- the distinction `loadPost` alone cannot make, since it returns null
 * for both.
 */
async function runArticleProbe(): Promise<number> {
	const { Article, generateArticleMetadata } = await import('../next/src/content/article.tsx');
	// `react-dom` lives in `next/node_modules`, and this child runs with its
	// working directory inside the fixture, so a bare specifier from `scripts/`
	// does not resolve. Ask the Next package for it.
	// Typed structurally rather than via `typeof import('react-dom/server')`:
	// `tsconfig.scripts.json` restricts `types` to node, so the module's own
	// declarations are not visible from `scripts/` and the type-only import does
	// not resolve there.
	const nextRequire = createRequire(join(NEXT_ROOT, 'package.json'));
	const { renderToStaticMarkup } = nextRequire('react-dom/server') as {
		renderToStaticMarkup: (node: unknown) => string;
	};

	const render = async (slug: string) =>
		renderToStaticMarkup(await Article({ slug, locale: 'ko' }));
	const langFacet = (markup: string) =>
		markup.match(/data-pagefind-filter="lang"[^>]*>([^<]*)</)?.[1] ?? null;
	// The JSON-LD is the ONLY place `inLanguage` and `@id` become observable, so
	// it is read from the script block rather than from the module that wrote it.
	const jsonLd = (markup: string): Record<string, unknown> => {
		const raw = markup.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
		return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
	};

	/** Every language-declaring field of one Korean-route render. */
	const fieldsOf = async (slug: string): Promise<ArticleLocaleFields> => {
		const markup = await render(slug);
		const structured = jsonLd(markup);
		const metadata = (await generateArticleMetadata(slug, 'ko')) as {
			alternates?: { canonical?: string };
			robots?: { index?: boolean };
			openGraph?: { locale?: string; alternateLocale?: string[] };
		};
		return {
			ogLocale: metadata.openGraph?.locale ?? null,
			alternateLocale: metadata.openGraph?.alternateLocale ?? [],
			canonical: metadata.alternates?.canonical ?? null,
			noindex: metadata.robots?.index === false,
			jsonLdInLanguage: (structured.inLanguage as string | undefined) ?? null,
			jsonLdId:
				((structured.mainEntityOfPage as { '@id'?: string } | undefined)?.['@id'] as
					string | undefined) ?? null,
			langFacet: langFacet(markup),
		};
	};

	const fallbackMarkup = await render('only-en');
	const fallbackFields = await fieldsOf('only-en');
	let draftedOutcome: ArticleProbe['draftedOutcome'] = 'rendered';
	try {
		await render('ko-drafted');
	} catch (error) {
		draftedOutcome =
			error instanceof Error && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(error.message)
				? 'not-found'
				: 'other';
	}
	// A withdrawn URL must not describe itself either: `generateArticleMetadata`
	// returns an empty object where the page 404s.
	const draftedMetadataKeys = Object.keys(await generateArticleMetadata('ko-drafted', 'ko'));
	const translatedFields = await fieldsOf('three');

	const result: ArticleProbe = {
		fallbackMarkup,
		fallbackFields,
		draftedOutcome,
		draftedMetadataKeys,
		translatedFields,
	};
	process.stdout.write(JSON.stringify(result));
	return 0;
}

/**
 * Render the Korean /system/3b composition against the fixture corpus.
 *
 * This is the same arm that proves row 11: the branches cannot appear in any
 * built page, because the live corpus translates all ten series slugs and holds
 * no drafts. Rendering the REAL composition -- not a helper, not the localizer
 * in isolation -- is what makes this consumer evidence.
 */
async function runSystemProbe(): Promise<number> {
	const { System3bPage } = await import('../next/src/content/system-3b.tsx');
	const { koreanTitleBySlug } = await import('../next/src/content/post-list.ts');
	// `react-dom` lives in `next/node_modules` and this child runs inside the
	// fixture, so a bare specifier from `scripts/` does not resolve -- the same
	// reason `runArticleProbe` asks the Next package for it.
	const nextRequire = createRequire(join(NEXT_ROOT, 'package.json'));
	const { renderToStaticMarkup } = nextRequire('react-dom/server') as {
		renderToStaticMarkup: (node: unknown) => string;
	};

	const raw = renderToStaticMarkup(System3bPage({ locale: 'ko' }));
	const markup = raw.replace(/<script[\s\S]*?<\/script>/g, '');
	const result: SystemProbe = {
		markup,
		koreanTitles: koreanTitleBySlug(),
		seriesItems: (markup.match(/<li[^>]*class="series-item"/g) ?? []).length,
	};
	process.stdout.write(JSON.stringify(result));
	return 0;
}

/** Feed and sitemap generation over a corpus holding an underivable path. */
async function runGeneratorProbe(): Promise<number> {
	const { rssXml, sitemapXml } = await import('../next/src/content/feeds.ts');

	const attempt = (generate: () => string) => {
		try {
			return { error: null, emitted: generate() };
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error), emitted: null };
		}
	};
	const sitemap = attempt(() => sitemapXml());
	const rss = attempt(() => rssXml('en'));

	const result: GeneratorProbe = {
		sitemapError: sitemap.error,
		rssError: rss.error,
		sitemapEmitted: sitemap.emitted,
		rssEmitted: rss.emitted,
	};
	process.stdout.write(JSON.stringify(result));
	return 0;
}

export interface C5Options {
	/** Exported Svelte site the oracle rows read. Default `<repo>/build`. */
	svelteBuild?: string;
	/**
	 * Exported Next site the row-16 pages are read from. Default
	 * `<repo>/next/build`. `--next-build <dir>` exists so the D9/D10/I3 controls
	 * can point the suite at a doctored scratch copy of the built Korean page
	 * without touching the real export.
	 */
	nextBuild?: string;
	/**
	 * A corpus the fixture rows use instead of the one this script writes.
	 * `--fixture-root <dir>` exists so the negative controls can hand over a
	 * deliberately broken corpus; the directory is left where it was found.
	 */
	fixtureRoot?: string;
	/**
	 * A system corpus the F7 rows use instead of the one this script writes.
	 * `--system-fixture-root <dir>` exists so the fallback and draft controls can
	 * hand over a doctored corpus; the directory is left where it was found.
	 */
	systemFixtureRoot?: string;
}

async function runAssertions(options: C5Options = {}): Promise<number> {
	const svelteBuild = options.svelteBuild ?? join(REPO_ROOT, 'build');
	const nextBuild = options.nextBuild ?? join(REPO_ROOT, 'next/build');

	// Row state is per-run, not module-level: the controls invoke this file
	// repeatedly, and a shared array would carry one run's rows into the next.
	const rows: Row[] = [];
	const say = (line: string) => console.log(line);
	const check = (row: string, ok: boolean, okDetail: string, failDetail: string): void => {
		rows.push({ row, status: ok ? 'PASS' : 'FAIL', detail: ok ? okDetail : failDetail });
	};
	// Every page the oracle rows read, not just the first one. A build that
	// emitted `posts.html` and not `ko.html` used to reach the row and throw, and
	// an uncaught throw exits 1 -- the same code a red row uses, which every
	// DEFECT control accepts as success.
	const oraclePages = ['index.html', 'posts.html', 'ko.html', join('ko', 'posts.html')];
	const absent = oraclePages.filter((page) => !existsSync(join(svelteBuild, page)));
	if (absent.length > 0) {
		console.error(
			`C5 cannot run: ${absent.map((page) => join(svelteBuild, page)).join(', ')} missing. Run \`pnpm build:svelte\` first.`,
		);
		return 2;
	}
	// The same precheck for the two exported Next pages row 16 reads.
	//
	// The CLI rejection handler already turns any throw into exit 2, so an
	// unguarded read here would NOT be mistaken for a red row. This precheck is
	// not that safety net: it exists so a missing export is reported as a named
	// diagnostic naming the command that produces it, rather than as an ENOENT
	// stack, and so the `PART`-shaped baseline has a specific behavior to assert.
	const nextPages = [join('ko', 'system', '3b.html'), join('system', '3b.html')];
	const absentNext = nextPages.filter((page) => !existsSync(join(nextBuild, page)));
	if (absentNext.length > 0) {
		console.error(
			`C5 cannot run: ${absentNext.map((page) => join(nextBuild, page)).join(', ')} missing. Run \`pnpm build:next\` first.`,
		);
		return 2;
	}
	// `posts.ts` derives its content root from the working directory, the same
	// assumption `next build` makes. Everything else here is absolute.
	process.chdir(NEXT_ROOT);
	const { listPostsForLocale, listKoreanPostsWithEnglishFallback } =
		await import('../next/src/content/post-list.ts');
	const { listPublishedPosts, loadPost, postSlugFrom } =
		await import('../next/src/content/posts.ts');
	const { rssXml, sitemapXml } = await import('../next/src/content/feeds.ts');

	const english = listPostsForLocale('en');
	const korean = listPostsForLocale('ko');
	const koreanWithFallback = listKoreanPostsWithEnglishFallback();
	const read = (page: string) => readFileSync(join(svelteBuild, page), 'utf8');

	// --- oracle rows -----------------------------------------------------------
	const listProblem = sequenceProblem(
		english.map((post) => post.slug),
		linkedSlugs(read('posts.html'), ''),
	);
	check(
		'site 4  posts/+page.ts:5 -> /posts list',
		listProblem === null,
		`${english.length} slugs match build/posts.html in order`,
		`build/posts.html disagrees: ${listProblem}`,
	);

	const homeProblem = sequenceProblem(
		english.slice(0, 10).map((post) => post.slug),
		linkedSlugs(read('index.html'), ''),
	);
	check(
		'site 2  +page.ts:13 -> / recent posts',
		homeProblem === null,
		'the 10 most recent English slugs match build/index.html in order',
		`build/index.html disagrees: ${homeProblem}`,
	);

	const koHomeProblem = sequenceProblem(
		korean.slice(0, 10).map((post) => post.slug),
		linkedSlugs(read('ko.html'), '/ko'),
	);
	check(
		'site 3  ko/+page.ts:11 -> /ko recent posts',
		koHomeProblem === null,
		'the 10 most recent Korean slugs match build/ko.html in order',
		`build/ko.html disagrees: ${koHomeProblem}`,
	);

	const koListProblem = sequenceProblem(
		koreanWithFallback.map((post) => post.slug),
		linkedSlugs(read(join('ko', 'posts.html')), '/ko'),
	);
	check(
		'sites 5-6  ko/posts/+page.ts:10,15 -> /ko/posts list',
		koListProblem === null,
		`${koreanWithFallback.length} slugs match build/ko/posts.html in order`,
		`build/ko/posts.html disagrees: ${koListProblem}`,
	);

	// --- layout rows: the same datasets, selected by locale --------------------
	const sample = english[0]?.slug ?? '';
	const englishTitle = english[0]?.frontmatter.title;
	const koreanTitle = korean.find((post) => post.slug === sample)?.frontmatter.title;
	check(
		'site 0  +layout.ts:14 -> English palette dataset',
		english.length > 0 && typeof englishTitle === 'string',
		`${english.length} published English posts, ordered as /posts (row above)`,
		'the English layout dataset is empty',
	);
	check(
		'site 1  +layout.ts:19 -> Korean palette dataset',
		korean.length > 0 &&
			typeof koreanTitle === 'string' &&
			koreanTitle !== englishTitle &&
			korean.every((post) => !post.relativePath.startsWith('..')),
		`${korean.length} Korean posts; locale selection returns Korean titles (${sample})`,
		`locale selection did not swap titles for ${sample}: ${String(koreanTitle)}`,
	);

	// --- S2 positive: the twelve sites, then every real path through them ----
	const foundSites = findSlugSites(REPO_ROOT);
	const expectedSites = [...SLUG_SITES].sort();
	const siteProblem =
		foundSites.length !== expectedSites.length
			? `source holds ${foundSites.length} derivation site(s), the enumeration names ${expectedSites.length}`
			: (foundSites.find((site, index) => site !== expectedSites[index]) ?? null);
	check(
		'S2 positive  the twelve slug-derivation sites',
		siteProblem === null,
		`all ${foundSites.length} sites recomputed from source and matched: ${foundSites.join(', ')}`,
		typeof siteProblem === 'string' && siteProblem.includes('derivation site')
			? siteProblem
			: `enumeration drifted from source at ${String(siteProblem)}`,
	);

	// --- S2 positive: every slug derivation site, over the whole corpus --------
	const derivations = (['en', 'ko'] as const).flatMap((locale) =>
		listPublishedPosts(locale).map((post) => ({
			locale,
			relativePath: post.relativePath,
			slug: post.slug,
		})),
	);
	// Not a restatement of the port's own logic: `svelteSlug` IS the source
	// expression, so this compares the two implementations on every real path.
	const wrong = derivations.filter(({ relativePath, slug }) => slug !== svelteSlug(relativePath));
	const ambiguous = derivations.filter(({ relativePath }) =>
		relativePath.split('/').pop()!.slice(0, -3).includes('.md'),
	);
	const mixedCaseFound = MIXED_CASE_SLUGS.filter((slug) =>
		derivations.some((entry) => entry.slug === slug),
	);
	check(
		'S2 positive  every real path through both implementations',
		wrong.length === 0 &&
			ambiguous.length === 0 &&
			mixedCaseFound.length === MIXED_CASE_SLUGS.length,
		`${derivations.length} paths derive identically under the source expression and the port, including ${MIXED_CASE_SLUGS.join(' and ')}`,
		wrong.length > 0
			? `${wrong.length} mis-derived, first: ${wrong[0].relativePath} -> ${wrong[0].slug}`
			: ambiguous.length > 0
				? `${ambiguous[0].relativePath} contains '.md' before its extension, where the Svelte expression and the port disagree`
				: `mixed-case slugs missing from the corpus: ${MIXED_CASE_SLUGS.filter((slug) => !mixedCaseFound.includes(slug)).join(', ')}`,
	);

	// --- S2 forced failure: an empty slug must raise, not emit a bad URL -------
	let diagnostic = '';
	try {
		postSlugFrom('src/content/posts/en/frontend/.md');
	} catch (error) {
		diagnostic = error instanceof Error ? error.message : String(error);
	}
	check(
		'S2 forced failure  empty slug raises a diagnostic',
		diagnostic.includes('src/content/posts/en/frontend/.md'),
		`derivation raises and names the path: ${diagnostic}`,
		diagnostic === ''
			? 'an underivable path returned a slug instead of raising'
			: `the diagnostic does not name the offending path: ${diagnostic}`,
	);

	// --- feed and sitemap rows: the already-ported glob consumers --------------
	const enFeedSlugs = [...rssXml('en').matchAll(/<guid[^>]*>[^<]*\/posts\/([^<]+)<\/guid>/g)].map(
		(match) => match[1],
	);
	const enFeedProblem = sequenceProblem(
		enFeedSlugs,
		english.map((post) => post.slug),
	);
	check(
		'site 7  rss.xml/+server.ts:25 -> English feed items',
		enFeedProblem === null,
		`${enFeedSlugs.length} feed items match the English list order, one per published post`,
		`the English feed and the English list disagree: ${enFeedProblem}`,
	);

	const koFeedSlugs = [
		...rssXml('ko').matchAll(/<guid[^>]*>[^<]*\/ko\/posts\/([^<]+)<\/guid>/g),
	].map((match) => match[1]);
	const koFeedProblem = sequenceProblem(
		koFeedSlugs,
		koreanWithFallback.map((post) => post.slug),
	);
	check(
		'sites 8-9  ko/rss.xml/+server.ts:25,26 -> Korean feed items',
		koFeedProblem === null,
		`${koFeedSlugs.length} items match the Korean list-with-fallback order exactly`,
		`the Korean feed and the Korean list disagree: ${koFeedProblem}`,
	);

	const sitemap = sitemapXml();
	const englishUrls = [...sitemap.matchAll(/<loc>https:\/\/[^/]+\/posts\/([^<]*)<\/loc>/g)].map(
		(match) => match[1],
	);
	const koreanUrls = [...sitemap.matchAll(/<loc>https:\/\/[^/]+\/ko\/posts\/([^<]*)<\/loc>/g)].map(
		(match) => match[1],
	);
	const koTwins = new Set(listPublishedPosts('ko').map((post) => post.slug));
	const alternates = [
		...new Set(
			[...sitemap.matchAll(/hreflang="ko" href="[^"]*\/ko\/posts\/([^"]+)"/g)].map(
				(match) => match[1],
			),
		),
	];
	// `sitemapXml()` has ONE loop, over the English posts, and emits the Korean
	// `<url>` block inside it (`feeds.ts:138-165`), exactly as
	// `src/routes/sitemap.xml/+server.ts:37-49` does. So the Korean URLs follow
	// the ENGLISH path order restricted to twinned slugs -- not Korean path
	// order, which differs the moment a translation is filed under another
	// category, as the fixture's `two` already is.
	const twinnedInEnglishOrder = listPublishedPosts('en')
		.map((post) => post.slug)
		.filter((slug) => koTwins.has(slug));
	const sitemapProblem = sitemapVerdict({
		englishUrls,
		koreanUrls,
		alternates,
		englishExpected: listPublishedPosts('en').map((post) => post.slug),
		koreanExpected: twinnedInEnglishOrder,
		alternatesExpected: twinnedInEnglishOrder,
	});
	check(
		'sites 10-11  sitemap.xml/+server.ts:22,23 -> sitemap URLs',
		sitemapProblem === null,
		`${englishUrls.length} English post URLs in path order and ${koreanUrls.length} Korean ones in the English iteration's order, no empty slug, and exactly ${alternates.length} hreflang alternates matching the English posts that have a Korean file`,
		`sitemap disagrees: ${sitemapProblem}`,
	);

	// --- article rows ----------------------------------------------------------
	const article = await loadPost(sample, 'en');
	const koreanArticle = await loadPost(sample, 'ko');
	check(
		'sites 12-13  posts/[slug]/+page.ts:35,36 -> article + translation flag',
		article !== null && article.hasKoreanTranslation === koTwins.has(sample),
		`${sample}: loaded, hasKoreanTranslation=${String(article?.hasKoreanTranslation)} matches the Korean file's presence`,
		`${sample}: article ${article === null ? 'did not load' : 'reported the wrong translation flag'}`,
	);
	check(
		'sites 14-15  ko/posts/[slug]/+page.ts:37,38 -> Korean article',
		koreanArticle !== null && koreanArticle.locale === 'ko',
		`${sample}: the Korean article loads from the Korean corpus`,
		`${sample}: the Korean article did not load`,
	);

	// --- site 16: the seventeenth call site, read from the built Korean page ---
	//
	// `src/routes/ko/system/3b/+page.ts:11` globs the Korean corpus to build a
	// slug-to-title map that `localizeSnapshot` merges over the snapshot's
	// `blog_series`. The built page is the only place that output becomes
	// observable, so these rows read it as bytes.
	const { koreanTitleBySlug } = await import('../next/src/content/post-list.ts');
	const seriesSource = (await import('../next/src/data/system-snapshot.ts')).default.blog_series;
	const koreanTitles = koreanTitleBySlug();

	/**
	 * Rendered markup only.
	 *
	 * A Next page carries its RSC payload inline in `self.__next_f.push(...)`,
	 * so every string it renders also appears inside a `<script>` as JSON.
	 * Searching the whole file would let a page that dropped a title from its
	 * MARKUP still match on the payload copy -- which is what control D9
	 * demonstrated before this stripped the scripts out.
	 */
	const renderedMarkup = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '');

	const koreanSystemHtml = renderedMarkup(
		readFileSync(join(nextBuild, 'ko', 'system', '3b.html'), 'utf8'),
	);
	const englishSystemHtml = renderedMarkup(
		readFileSync(join(nextBuild, 'system', '3b.html'), 'utf8'),
	);

	// CARDINALITY FIRST. Every assertion below is over `seriesSource`, and all of
	// them are vacuously true when it is empty. The count is recomputed from the
	// snapshot rather than hard-coded as the only check, so a snapshot that
	// legitimately grows fails LOUDLY here instead of silently weakening the
	// rows that follow.
	const SERIES_EXPECTED = 10;
	const translated = seriesSource.filter((entry) => koreanTitles[entry.slug] !== undefined);
	check(
		'site 16  ko/system/3b/+page.ts:11 -> the corpus supplies every series title',
		seriesSource.length === SERIES_EXPECTED && translated.length === SERIES_EXPECTED,
		`the snapshot carries ${seriesSource.length} series entries and the Korean corpus resolves a title for all ${translated.length}`,
		`expected ${SERIES_EXPECTED} series entries each resolved from the Korean corpus; got ${seriesSource.length} entries, ${translated.length} resolved (unresolved: ${seriesSource
			.filter((entry) => koreanTitles[entry.slug] === undefined)
			.map((entry) => entry.slug)
			.join(', ')})`,
	);

	/**
	 * The rendered series items, and the title INSIDE each one.
	 *
	 * WHY THIS IS POSITIONAL AND NOT A PAGE-WIDE SEARCH. An earlier version of
	 * these rows asked whether each expected title appeared anywhere on the page
	 * and, separately, how many `series-item` elements existed. Both questions
	 * pass against a page whose ten items are EMPTY and whose ten titles have
	 * been moved into an unrelated element -- reproduced, 31 rows green. Nothing
	 * bound a title to the entry it belongs to. These rows now compare the
	 * sequence of titles read out of the items against the sequence the merge
	 * should have produced, so position, identity and count all have to agree.
	 */
	const titleInItem = (block: string) =>
		block.match(/<a[^>]*href="[^"]*\/posts\/[^"]*"[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ??
		block.match(/<span[^>]*class="name"[^>]*>([^<]+)<\/span>/)?.[1]?.trim() ??
		'';
	const itemsIn = (html: string) =>
		[...html.matchAll(/<li[^>]*class="series-item"[\s\S]*?<\/li>/g)].map((match) => match[0]);

	const koreanItems = itemsIn(koreanSystemHtml);
	const englishItems = itemsIn(englishSystemHtml);
	const koreanRendered = koreanItems.map(titleInItem);
	const englishRendered = englishItems.map(titleInItem);
	const koreanExpected = seriesSource.map((entry) => koreanTitles[entry.slug] ?? entry.title);
	const englishExpected = seriesSource.map((entry) => entry.title);
	const sameSequence = (a: string[], b: string[]) =>
		a.length === b.length && a.every((value, index) => value === b[index]);
	const firstMismatch = (a: string[], b: string[]) => {
		for (let index = 0; index < Math.max(a.length, b.length); index += 1)
			if (a[index] !== b[index])
				return `index ${index}: ${String(a[index])} != ${String(b[index])}`;
		return 'none';
	};

	check(
		'site 16b  each built Korean item carries ITS entry localized title',
		koreanExpected.length > 0 && sameSequence(koreanRendered, koreanExpected),
		`all ${koreanRendered.length} series items carry their own entry's localized title, in snapshot order`,
		`rendered ${koreanRendered.length} titles against ${koreanExpected.length} expected; ${firstMismatch(koreanRendered, koreanExpected)}`,
	);

	// A title that is present but EMPTY, or an item that rendered no title at
	// all, is the failure the sequence check above is built to catch; this row
	// states it separately so the diagnostic names it directly.
	const emptyKorean = koreanRendered.filter((title) => title === '').length;
	check(
		'site 16c  the series list renders as a list, with a title in every item',
		koreanItems.length === seriesSource.length &&
			englishItems.length === seriesSource.length &&
			emptyKorean === 0,
		`both built pages render ${koreanItems.length} series items and every Korean item holds a non-empty title`,
		`series items: Korean ${koreanItems.length}, English ${englishItems.length}, expected ${seriesSource.length} on each; empty Korean titles: ${emptyKorean}`,
	);

	// The merge is per-route, not global. No `englishSystemHtml === ''` escape
	// hatch -- the precheck above makes an absent English export exit 2, so
	// reaching here means it was built.
	check(
		'site 16d  localization is locale-scoped',
		englishExpected.length > 0 && sameSequence(englishRendered, englishExpected),
		'every English item keeps its own English snapshot title, so the Korean merge did not leak across routes',
		`English page: ${firstMismatch(englishRendered, englishExpected)}`,
	);

	// --- fixture rows: what 167/167/no-drafts cannot show ----------------------
	const suppliedFixture = options.fixtureRoot;
	const fixtureRoot = suppliedFixture ?? mkdtempSync(join(tmpdir(), 'c5-glob-sites-'));
	try {
		if (!suppliedFixture) writeFixture(fixtureRoot);
		const probe = probeFixture<ProbeResult>(fixtureRoot, 'lists');

		check(
			'F1 draft filtering',
			!probe.en.includes('hidden') &&
				!probe.ko.includes('hidden-ko') &&
				!probe.fallback.some((entry) => entry.endsWith(':hidden')),
			'a drafted fixture post is absent from the English, Korean and fallback lists',
			`a draft survived: en=${probe.en.join(',')} ko=${probe.ko.join(',')} fallback=${probe.fallback.join(',')}`,
		);

		check(
			'F2 Korean fallback, keyed by slug',
			probe.fallback.join(',') === 'ko:three,en:only-en,en:ko-drafted,ko:one,ko:two',
			'the untranslated post falls back as English; a post whose Korean twin is a DRAFT also falls back, because the dedup set is filled after the draft filter; and a Korean twin filed under another category still suppresses its English source',
			`fallback order was ${probe.fallback.join(',')}`,
		);

		check(
			'F3 tie-break and effectiveDate',
			probe.en.join(',') === 'three,only-en,ko-drafted,one,two' &&
				probe.ko.join(',') === 'three,one,two',
			'`updated` outranks `date`, and same-date posts keep path-ascending order',
			`en=${probe.en.join(',')} ko=${probe.ko.join(',')}`,
		);

		check(
			'F4 locale selection returns Korean text',
			probe.koTitles.every((title) => title.startsWith('KO ')),
			'the Korean dataset carries Korean titles, not the English source titles',
			`Korean titles were ${probe.koTitles.join(', ')}`,
		);

		check(
			'F5 feed and list share one fallback rule',
			probe.feedsAgree && !probe.rssHasEmptyLink,
			'the Korean feed and the Korean list produce the same sequence on the fixture',
			'the Korean feed and the Korean list disagree on the fixture corpus',
		);

		check(
			'F6 empty slug raises inside the fixture too',
			probe.emptySlug !== null && probe.emptySlug.includes('.md'),
			`the fixture child also raises: ${probe.emptySlug}`,
			'an underivable path did not raise in the fixture child',
		);

		// --- row 11: the Korean article's English fallback, as rendered ----------
		const article = probeFixture<ArticleProbe>(fixtureRoot, 'article');
		// The title also appears inside the JSON-LD, so the body assertion reads the
		// markup with the script blocks removed -- otherwise structured data alone
		// could satisfy it.
		const fallbackBody = article.fallbackMarkup.replace(/<script[\s\S]*?<\/script>/g, '');
		check(
			'site 11  ko/posts/[slug]/+page.ts:38 -> English fallback under a Korean URL',
			fallbackBody.includes('<h1>EN Only</h1>') && fallbackBody.includes('post__fallback'),
			'a slug with no Korean post renders the English body under the Korean route and carries the translation notice',
			`fallback body carried the heading: ${fallbackBody.includes('<h1>EN Only</h1>')}, notice present: ${fallbackBody.includes('post__fallback')}`,
		);
		check(
			'site 11b  a drafted translation is withdrawn, not replaced',
			article.draftedOutcome === 'not-found' && article.draftedMetadataKeys.length === 0,
			'a drafted Korean post 404s instead of falling back to English, and describes itself with no metadata at all',
			`drafted outcome was ${article.draftedOutcome}; metadata carried ${article.draftedMetadataKeys.length} keys (${article.draftedMetadataKeys.join(', ')})`,
		);
		// Rows 11c/11d: the fallback's LANGUAGE, which row 11 does not constrain.
		// `PostDetail.svelte:73` derives one `contentLocale` and hangs `og:locale`
		// (164), its alternate (165-169), the JSON-LD `inLanguage` (142) and
		// `@id`/canonical (71) plus the Pagefind facet (204) off it, so an English
		// body under a Korean URL declares English in all six places.
		const fallbackVerdict = articleLocaleVerdict(article.fallbackFields, {
			locale: 'en',
			url: `${SITE_URL}/posts/only-en`,
			alternateLocale: [],
			noindex: true,
		});
		check(
			'site 11c  the English fallback declares English, not the route locale',
			fallbackVerdict === null,
			'og:locale, its alternate, the JSON-LD inLanguage and @id, the canonical and the Pagefind facet all follow the CONTENT, and the page asks not to be indexed',
			`fallback declared: ${String(fallbackVerdict)}`,
		);
		const translatedVerdict = articleLocaleVerdict(article.translatedFields, {
			locale: 'ko',
			url: `${SITE_URL}/ko/posts/three`,
			alternateLocale: ['en_US'],
			noindex: false,
		});
		check(
			'site 11d  a real translation still declares Korean',
			translatedVerdict === null,
			'the same six fields say Korean for a Korean body, and the page stays indexable -- the fallback rule must not leak into translated pages',
			`translated declared: ${String(translatedVerdict)}`,
		);

		// --- S2 forced failure, through the generators themselves ----------------
		const brokenRoot = mkdtempSync(join(tmpdir(), 'c5-broken-'));
		try {
			writeBrokenFixture(brokenRoot);
			const generators = probeFixture<GeneratorProbe>(brokenRoot, 'generators');
			check(
				'S2 forced failure  the generators stop before emitting a URL',
				generators.sitemapError !== null &&
					generators.rssError !== null &&
					// BOTH diagnostics must name the path. Requiring only the sitemap's
					// would let any unrelated RSS exception satisfy the row: a failure that
					// never reached the derivation still leaves `rssEmitted` null.
					generators.sitemapError.includes('.md') &&
					generators.rssError.includes('.md') &&
					generators.sitemapEmitted === null &&
					generators.rssEmitted === null,
				`an underivable corpus path stops sitemapXml() and rssXml() at the derivation: ${generators.sitemapError}`,
				`sitemap emitted ${generators.sitemapEmitted === null ? 'nothing' : 'output'} (error: ${String(generators.sitemapError)}); rss emitted ${generators.rssEmitted === null ? 'nothing' : 'output'} (error: ${String(generators.rssError)})`,
			);
		} finally {
			rmSync(brokenRoot, { recursive: true, force: true });
		}
	} finally {
		if (!suppliedFixture) rmSync(fixtureRoot, { recursive: true, force: true });
	}

	// --- F7: the two series branches the live corpus cannot show ---------------
	//
	// The built page proves the localized case, because all ten slugs are
	// translated. It CANNOT prove the other two clauses of row 17: an entry with
	// no Korean post keeps its English title, and a drafted Korean title never
	// appears. This corpus supplies exactly one of each and renders the real
	// composition against it.
	const suppliedSystemFixture = options.systemFixtureRoot;
	const systemFixtureRoot = suppliedSystemFixture ?? mkdtempSync(join(tmpdir(), 'c5-system-'));
	try {
		if (!suppliedSystemFixture) writeSystemFixture(systemFixtureRoot);
		const system = probeFixture<SystemProbe>(systemFixtureRoot, 'system');
		const titleOf = (slug: string) =>
			seriesSource.find((entry) => entry.slug === slug)?.title ?? '';
		// Bound to the ITEM, exactly as the built-page rows are: a page-wide
		// search would accept a title that had been detached from its entry.
		const fixtureItems = itemsIn(system.markup);
		const fixtureTitles = fixtureItems.map(titleInItem);
		const titleAt = (slug: string) => {
			const index = seriesSource.findIndex((entry) => entry.slug === slug);
			return index === -1 ? '' : (fixtureTitles[index] ?? '');
		};
		const localizedBound = titleAt(SYSTEM_FIXTURE.localized) === SYSTEM_FIXTURE.localizedTitle;
		const untranslatedBound =
			titleAt(SYSTEM_FIXTURE.untranslated) === titleOf(SYSTEM_FIXTURE.untranslated);
		const draftedBound = titleAt(SYSTEM_FIXTURE.drafted) === titleOf(SYSTEM_FIXTURE.drafted);
		const draftLeaked = system.markup.includes(SYSTEM_FIXTURE.draftedTitle);
		check(
			'F7 series titles: translated, untranslated, drafted',
			fixtureItems.length === seriesSource.length &&
				localizedBound &&
				untranslatedBound &&
				draftedBound &&
				!draftLeaked,
			`the rendered page keeps ${fixtureItems.length} entries, each carrying its own title: the translated slug takes its Korean title, the untranslated and drafted slugs keep their English snapshot titles, and the drafted Korean title appears nowhere`,
			`items ${fixtureItems.length} (expected ${seriesSource.length}); localized bound to its item: ${localizedBound}; untranslated bound: ${untranslatedBound}; drafted bound: ${draftedBound}; drafted title leaked: ${draftLeaked}`,
		);
		// The draft filter is the only reason `drafted` falls back, so prove the
		// map itself excluded it rather than inferring it from the markup alone.
		check(
			'F7b the drafted translation never enters the title map',
			system.koreanTitles[SYSTEM_FIXTURE.localized] === SYSTEM_FIXTURE.localizedTitle &&
				system.koreanTitles[SYSTEM_FIXTURE.drafted] === undefined &&
				system.koreanTitles[SYSTEM_FIXTURE.untranslated] === undefined,
			'koreanTitleBySlug() carries the published translation and neither the drafted nor the absent one',
			`map held: localized=${String(system.koreanTitles[SYSTEM_FIXTURE.localized])}, drafted=${String(system.koreanTitles[SYSTEM_FIXTURE.drafted])}, untranslated=${String(system.koreanTitles[SYSTEM_FIXTURE.untranslated])}`,
		);
	} finally {
		if (!suppliedSystemFixture) rmSync(systemFixtureRoot, { recursive: true, force: true });
	}

	// --- report ----------------------------------------------------------------
	const width = Math.max(...rows.map((entry) => entry.row.length));
	say('\nROW TABLE');
	for (const { row, status, detail } of rows)
		say(`  ${status.padEnd(4)} ${row.padEnd(width)}  ${detail}`);
	const failed = rows.filter((entry) => entry.status === 'FAIL');
	say(`\nRESULT: ${rows.length - failed.length} pass, ${failed.length} fail`);
	if (failed.length) return 1;
	say(
		'Scope: all 17 glob call sites, each through a consumer. The seventeenth, `src/routes/ko/system/3b/+page.ts:11`, is read from the BUILT Korean page (rows `site 16`-`site 16d`), which is the only place its output becomes observable. Drafts, the Korean-to-English fallback, its slug-keyed dedup, and the series-title fallback and draft exclusion are proven on fixtures, because the live corpus has 167 English posts, 167 Korean posts with the same slugs, and no drafts.',
	);
	return 0;
}

function optionsFrom(argv: string[]): C5Options {
	const value = (flag: string) => {
		const at = argv.indexOf(flag);
		return at !== -1 && argv[at + 1] ? resolve(argv[at + 1]) : undefined;
	};
	return {
		svelteBuild: value('--svelte-build'),
		nextBuild: value('--next-build'),
		fixtureRoot: value('--fixture-root'),
		systemFixtureRoot: value('--system-fixture-root'),
	};
}

export { linkedSlugs, runAssertions, writeFixture, writeSystemFixture, SYSTEM_FIXTURE };

if (process.argv[1]?.endsWith('assert-c5-glob-sites.ts')) {
	const run =
		process.env[PROBE_ENV] !== undefined
			? runProbe(process.env[PROBE_ENV])
			: runAssertions(optionsFrom(process.argv));
	run.then(
		(code) => process.exit(code),
		(error: unknown) => {
			// Exit 2, never 1. The controls expect 1 from every DEFECT row, so a
			// harness that crashed would otherwise pass as one of them.
			console.error(`C5 could not run: ${error instanceof Error ? error.stack : String(error)}`);
			process.exit(2);
		},
	);
}
