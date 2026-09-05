/**
 * Negative controls for the C5 glob-call-site assertions.
 *
 *   pnpm migration:c5:controls
 *
 * `assert-c5-glob-sites.ts` prints a row table. That table is evidence only
 * once each contract has been watched to go red on a deliberate defect and stay
 * green on a change it must ignore:
 *
 *   DEFECT      the assertions MUST exit 1 on a deliberately broken input
 *   INVARIANCE  the assertions MUST exit 0 on a change they should ignore
 *
 * The suite reads two independent surfaces, so both get defects AND a paired
 * invariance:
 *
 *   THE ORACLE    four exported Svelte pages. Dropping a link, swapping a pair
 *                 or truncating a list must go red; reformatting the markup
 *                 around the same links must not.
 *
 *   THE FIXTURE   the temporary corpus behind the draft, fallback and ordering
 *                 rows. Un-drafting the hidden post, or translating the one
 *                 untranslated post, must go red; adding a tag to a fixture
 *                 post's frontmatter must not.
 *
 * Nothing here touches the real `build/`, `next/build` or `src/content/posts`:
 * the oracle controls copy the four pages the suite reads into a scratch
 * directory under `tmp/`, and the fixture controls write their own corpus. The
 * baseline control runs the same scratch copies unmodified, so a red run means
 * the mutation, not the copying.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	articleLocaleVerdict,
	linkedSlugs,
	sitemapVerdict,
	writeFixture,
	writeSystemFixture,
	SYSTEM_FIXTURE,
	type ArticleLocaleFields,
} from './assert-c5-glob-sites.ts';

const require = createRequire(import.meta.url);
const CONTROLS_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(CONTROLS_PATH), '..');
const SUITE = join(REPO_ROOT, 'scripts/assert-c5-glob-sites.ts');
const SOURCE_BUILD = join(REPO_ROOT, 'build');
const ORACLE_PAGES = ['index.html', 'posts.html', 'ko.html', join('ko', 'posts.html')] as const;
const NEXT_SOURCE_BUILD = join(REPO_ROOT, 'next/build');
const NEXT_PAGES = [join('ko', 'system', '3b.html'), join('system', '3b.html')] as const;

/** The English series titles row 16 compares against, read rather than imported
 *  so `tsconfig.scripts.json` needs no JSON module resolution. */
const SERIES_TITLES: string[] = (
	JSON.parse(readFileSync(join(REPO_ROOT, 'src/lib/data/system-snapshot.json'), 'utf8')) as {
		blog_series: { title: string }[];
	}
).blog_series.map((entry) => entry.title);

type Kind = 'DEFECT' | 'INVARIANCE';
type Surface = 'oracle' | 'fixture' | 'next' | 'system';

interface Control {
	id: string;
	kind: Kind;
	surface: Surface;
	what: string;
	/** Rewrites one oracle page, addressed by its path under the scratch build. */
	page?: (typeof ORACLE_PAGES)[number];
	apply?: (html: string) => string;
	/** Rewrites the fixture corpus in place. */
	mutate?: (root: string) => void;
	/** Rewrites one exported Next page, addressed under the scratch Next build. */
	nextPage?: (typeof NEXT_PAGES)[number];
	/** Rewrites the system fixture corpus the F7 rows render against. */
	mutateSystem?: (root: string) => void;
}

/** One rendered series item: the whole `<li>`, and the title inside it.
 *
 *  Read from the MARKUP with the script blocks stripped, exactly as row 16
 *  reads it -- a control that doctored the RSC payload instead would not be
 *  changing what the row inspects.
 *
 *  The title is addressed EXPLICITLY: a published entry renders it in the
 *  anchor, a planned one in `<span class="name">`. An earlier version took the
 *  first `<a>`-or-`<span>` in the item, which only avoided the leading
 *  `<span class="idx">` because React splits `{order}.` into `1<!-- -->.` and
 *  the marker breaks a `[^<]+` run. That is correctness by accident: it would
 *  start returning "1" the moment the index stopped being interpolated. */
interface RenderedSeriesItem {
	block: string;
	title: string;
}

function renderedSeriesItems(html: string): RenderedSeriesItem[] {
	const markup = html.replace(/<script[\s\S]*?<\/script>/g, '');
	return [...markup.matchAll(/<li[^>]*class="series-item"[\s\S]*?<\/li>/g)].map((match) => {
		const block = match[0];
		const title =
			block.match(/<a[^>]*href="[^"]*\/posts\/[^"]*"[^>]*>([^<]+)<\/a>/)?.[1] ??
			block.match(/<span[^>]*class="name"[^>]*>([^<]+)<\/span>/)?.[1] ??
			'';
		return { block, title: title.trim() };
	});
}

/** Drop the nth `/posts/<slug>` link from a page, leaving the card around it. */
function dropLink(html: string, prefix: '' | '/ko', index: number): string {
	const slug = linkedSlugs(html, prefix)[index];
	return html.replace(`href="${prefix}/posts/${slug}"`, 'href="#dropped"');
}

/** Swap two adjacent post links, changing order without changing membership. */
function swapLinks(html: string, prefix: '' | '/ko', first: number): string {
	const slugs = linkedSlugs(html, prefix);
	const [a, b] = [slugs[first], slugs[first + 1]];
	return html
		.replace(`href="${prefix}/posts/${a}"`, `href="${prefix}/posts/__swap__"`)
		.replace(`href="${prefix}/posts/${b}"`, `href="${prefix}/posts/${a}"`)
		.replace(`href="${prefix}/posts/__swap__"`, `href="${prefix}/posts/${b}"`);
}

const CONTROLS: Control[] = [
	{
		id: 'D1',
		kind: 'DEFECT',
		surface: 'oracle',
		what: '/posts drops one post link',
		page: 'posts.html',
		apply: (html) => dropLink(html, '', 40),
	},
	{
		id: 'D2',
		kind: 'DEFECT',
		surface: 'oracle',
		what: '/posts keeps every post but swaps two neighbours',
		page: 'posts.html',
		apply: (html) => swapLinks(html, '', 12),
	},
	{
		id: 'D3',
		kind: 'DEFECT',
		surface: 'oracle',
		what: '/ko/posts loses its last entry',
		page: join('ko', 'posts.html'),
		apply: (html) => dropLink(html, '/ko', linkedSlugs(html, '/ko').length - 1),
	},
	{
		id: 'D4',
		kind: 'DEFECT',
		surface: 'oracle',
		what: 'the home page reorders its two most recent posts',
		page: 'index.html',
		apply: (html) => swapLinks(html, '', 0),
	},
	{
		id: 'D5',
		kind: 'DEFECT',
		surface: 'oracle',
		what: 'the Korean home page reorders two posts',
		page: 'ko.html',
		apply: (html) => swapLinks(html, '/ko', 3),
	},
	{
		id: 'I1',
		kind: 'INVARIANCE',
		surface: 'oracle',
		what: 'the same list markup is reformatted around unchanged links',
		page: 'posts.html',
		apply: (html) =>
			html
				.replaceAll('class="post-card ', 'data-control="c5" class="post-card ')
				.replaceAll('loading="lazy"', 'loading="eager"'),
	},
	{
		id: 'D6',
		kind: 'DEFECT',
		surface: 'fixture',
		what: 'the drafted fixture post is published',
		mutate: (root) => {
			const file = join(root, 'src/content/posts/en/beta/hidden.md');
			writeFileSync(file, readFileSync(file, 'utf8').replace('\ndraft: true', ''));
		},
	},
	{
		id: 'D7',
		kind: 'DEFECT',
		surface: 'fixture',
		what: 'the untranslated fixture post gains a Korean twin, removing the fallback entry',
		mutate: (root) => {
			const file = join(root, 'src/content/posts/ko/beta/only-en.md');
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(
				file,
				readFileSync(join(root, 'src/content/posts/ko/alpha/one.md'), 'utf8').replace(
					'KO One',
					'KO Only',
				),
			);
		},
	},
	{
		id: 'D8',
		kind: 'DEFECT',
		surface: 'fixture',
		what: 'the Korean twin filed under another category is deleted, so its English source falls back',
		mutate: (root) => rmSync(join(root, 'src/content/posts/ko/gamma/two.md')),
	},
	{
		id: 'D11',
		kind: 'DEFECT',
		surface: 'fixture',
		what: 'the drafted Korean twin is published, so its English source stops falling back',
		mutate: (root) => {
			const file = join(root, 'src/content/posts/ko/beta/ko-drafted.md');
			writeFileSync(file, readFileSync(file, 'utf8').replace('\ndraft: true', ''));
		},
	},
	{
		id: 'I2',
		kind: 'INVARIANCE',
		surface: 'fixture',
		what: 'a fixture post gains a tag its consumers do not order by',
		mutate: (root) => {
			const file = join(root, 'src/content/posts/en/beta/three.md');
			writeFileSync(
				file,
				readFileSync(file, 'utf8').replace('  - fixture', '  - fixture\n  - control'),
			);
		},
	},
	// --- row 16: the built Korean system page -------------------------------
	//
	// These three ids are restored, not reissued. They were written for this
	// surface, left with the agreed PR split, and mean here exactly what they
	// meant then -- renumbering them would break the promise that a control id
	// names one behavior for the life of the suite.
	{
		id: 'D9',
		kind: 'DEFECT',
		surface: 'next',
		what: 'the built Korean page drops one series title',
		nextPage: join('ko', 'system', '3b.html'),
		apply: (html) => html.replace(/<li[^>]*class="series-item"[\s\S]*?<\/li>/, ''),
	},
	{
		id: 'D10',
		kind: 'DEFECT',
		surface: 'next',
		what: 'the built Korean page keeps the English snapshot titles, as if the merge never ran',
		nextPage: join('ko', 'system', '3b.html'),
		apply: (html) => {
			let out = html;
			// Replace INSIDE the item, not the first match in the document: a bare
			// `html.replace(title, english)` would rewrite whichever earlier
			// occurrence happened to match first.
			renderedSeriesItems(html).forEach(({ block, title }, index) => {
				const english = SERIES_TITLES[index];
				if (!title || !english || title === english) return;
				out = out.replace(block, block.replace(`>${title}<`, `>${english}<`));
			});
			return out;
		},
	},
	{
		id: 'I3',
		kind: 'INVARIANCE',
		surface: 'next',
		what: 'the series markup is reformatted around unchanged titles',
		nextPage: join('ko', 'system', '3b.html'),
		// An attribute BEFORE `class`, so the structural row's `<li[^>]*class=`
		// still matches. The titles and the item count are untouched.
		apply: (html) =>
			html.replaceAll('<li class="series-item"', '<li data-reformatted="1" class="series-item"'),
	},
	{
		id: 'D16',
		kind: 'DEFECT',
		surface: 'next',
		what: 'the built Korean page keeps ten series items but moves every title out of them',
		nextPage: join('ko', 'system', '3b.html'),
		// The counterexample that failed review: page-wide presence plus an
		// independent item count both pass against ten EMPTY items whose titles
		// were relocated. Row 16b now reads the title INSIDE each item, so this
		// must go red.
		apply: (html) => {
			const stashed: string[] = [];
			const emptied = html.replace(/<li[^>]*class="series-item"[\s\S]*?<\/li>/g, (block) => {
				const title = renderedSeriesItems(block)[0]?.title ?? '';
				if (!title) return block;
				stashed.push(title);
				return block.replace(`>${title}<`, '><');
			});
			return emptied.replace(
				'</body>',
				`<aside class="stash">${stashed.map((title) => `<p>${title}</p>`).join('')}</aside></body>`,
			);
		},
	},
	{
		id: 'I6',
		kind: 'INVARIANCE',
		surface: 'next',
		what: 'unrelated markup is appended to the built Korean page, leaving the series items intact',
		nextPage: join('ko', 'system', '3b.html'),
		apply: (html) => html.replace('</body>', '<aside class="unrelated"><p>x</p></aside></body>'),
	},
	{
		id: 'D17',
		kind: 'DEFECT',
		surface: 'system',
		what: 'the drafted Korean series post is published, so its title reaches the page',
		mutateSystem: (root) => {
			const file = join(root, `src/content/posts/ko/fixture/${SYSTEM_FIXTURE.drafted}.md`);
			writeFileSync(file, readFileSync(file, 'utf8').replace('\ndraft: true', ''));
		},
	},
	{
		id: 'D18',
		kind: 'DEFECT',
		surface: 'system',
		what: 'the untranslated series slug gains a Korean post, so it stops falling back to English',
		mutateSystem: (root) => {
			const file = join(root, `src/content/posts/ko/fixture/${SYSTEM_FIXTURE.untranslated}.md`);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(
				file,
				`---\ntitle: KO Should Not Appear\ndescription: Fixture\ndate: '2026-01-01'\ntags:\n  - fixture\ncategory: fixture\n---\n\nBody.\n`,
			);
		},
	},
	{
		id: 'I7',
		kind: 'INVARIANCE',
		surface: 'system',
		what: 'the system corpus gains a Korean post that is not a series entry',
		mutateSystem: (root) => {
			const file = join(root, 'src/content/posts/ko/fixture/unrelated-post.md');
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(
				file,
				`---\ntitle: KO Unrelated\ndescription: Fixture\ndate: '2026-01-01'\ntags:\n  - fixture\ncategory: fixture\n---\n\nBody.\n`,
			);
		},
	},
];

/** A scratch copy of only the four oracle pages the suite reads. */
function scratchBuild(root: string): string {
	const svelteBuild = join(root, 'build');
	for (const page of ORACLE_PAGES) {
		const target = join(svelteBuild, page);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(join(SOURCE_BUILD, page), target);
	}
	return svelteBuild;
}

/** Scratch copy of the two exported Next pages row 16 reads. */
function scratchNextBuild(root: string): string {
	const nextBuild = join(root, 'next-build');
	for (const page of NEXT_PAGES) {
		const target = join(nextBuild, page);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(join(NEXT_SOURCE_BUILD, page), target);
	}
	return nextBuild;
}

function runSuite(
	svelteBuild: string,
	fixtureRoot?: string,
	nextBuild?: string,
	systemFixtureRoot?: string,
): number {
	const args = [
		'--import',
		require.resolve('tsx'),
		SUITE,
		'--svelte-build',
		svelteBuild,
		...(fixtureRoot ? ['--fixture-root', fixtureRoot] : []),
		...(nextBuild ? ['--next-build', nextBuild] : []),
		...(systemFixtureRoot ? ['--system-fixture-root', systemFixtureRoot] : []),
	];
	const child = spawnSync(process.execPath, args, {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		env: { ...process.env, TSX_TSCONFIG_PATH: join(REPO_ROOT, 'next/tsconfig.json') },
	});
	if (child.status === null)
		throw new Error(`the C5 suite did not exit (${child.signal}):\n${child.stderr}`);
	return child.status;
}

function main(): number {
	const failures: string[] = [];
	const root = mkdtempSync(join(tmpdir(), 'c5-controls-'));

	try {
		// Baseline: unmodified copies must stay green, so a red control below is
		// the mutation and not the scratch directory.
		const baselineBuild = scratchBuild(join(root, 'baseline'));
		const baselineFixture = join(root, 'baseline-fixture');
		writeFixture(baselineFixture);
		const baseline = runSuite(baselineBuild, baselineFixture);
		if (baseline !== 0) failures.push(`BASELINE unmodified copies: exit ${baseline}, expected 0`);
		console.log(
			`${baseline === 0 ? 'PASS' : 'FAIL'}  BASE  ${'BASELINE'.padEnd(10)} exit ${baseline} (expected 0)  unmodified scratch oracle and fixture`,
		);

		// A missing oracle is "could not run", not "passed".
		const emptyBuild = join(root, 'empty/build');
		mkdirSync(emptyBuild, { recursive: true });
		const missing = runSuite(emptyBuild);
		if (missing !== 2) failures.push(`BASELINE missing oracle: exit ${missing}, expected 2`);
		console.log(
			`${missing === 2 ? 'PASS' : 'FAIL'}  MISS  ${'BASELINE'.padEnd(10)} exit ${missing} (expected 2)  a missing Svelte build cannot pass`,
		);

		// A build that emitted one oracle page and not another must also be "could
		// not run". Before the precheck covered every page, this exited 1 -- and
		// every DEFECT control below accepts exit 1, so a crashed harness passed
		// as a working one.
		const partialBuild = scratchBuild(join(root, 'partial'));
		rmSync(join(partialBuild, 'ko.html'));
		const partial = runSuite(partialBuild);
		if (partial !== 2) failures.push(`BASELINE partial oracle: exit ${partial}, expected 2`);
		console.log(
			`${partial === 2 ? 'PASS' : 'FAIL'}  PART  ${'BASELINE'.padEnd(10)} exit ${partial} (expected 2)  a build missing one oracle page cannot pass`,
		);

		// The same statement for the Next export row 16 reads. The suite's CLI
		// rejection handler already turns any throw into exit 2, so this is not
		// the crash net -- it asserts that a missing built page is reported as
		// "could not run" by a NAMED precheck rather than as an ENOENT stack.
		const partialNextBuild = scratchNextBuild(join(root, 'partial-next'));
		rmSync(join(partialNextBuild, 'ko', 'system', '3b.html'));
		const partialNext = runSuite(
			scratchBuild(join(root, 'partial-next-oracle')),
			undefined,
			partialNextBuild,
		);
		if (partialNext !== 2)
			failures.push(`BASELINE partial next export: exit ${partialNext}, expected 2`);
		console.log(
			`${partialNext === 2 ? 'PASS' : 'FAIL'}  NPRT  ${'BASELINE'.padEnd(10)} exit ${partialNext} (expected 2)  a Next export missing the built Korean page cannot pass`,
		);

		// An unexpected throw is also "could not run": an empty fixture root makes
		// the probe child fail to read a corpus at all.
		const emptyFixture = join(root, 'empty-fixture');
		mkdirSync(join(emptyFixture, 'next'), { recursive: true });
		const crashed = runSuite(scratchBuild(join(root, 'crash')), emptyFixture);
		if (crashed !== 2) failures.push(`BASELINE harness crash: exit ${crashed}, expected 2`);
		console.log(
			`${crashed === 2 ? 'PASS' : 'FAIL'}  CRSH  ${'BASELINE'.padEnd(10)} exit ${crashed} (expected 2)  an unexpected throw exits 2, not 1`,
		);

		// The sitemap row generates its own input, so no scratch file can doctor it.
		// Its verdict is a pure function for exactly that reason, and these three
		// feed it the deletions the row used to accept. D12 is the reviewer's
		// counterexample: with every Korean URL block removed, `.some()` and
		// `.every()` were both vacuously satisfied and the row stayed green.
		const sitemapSets = () => ({
			englishUrls: ['a', 'b'],
			koreanUrls: ['a', 'b'],
			alternates: ['a', 'b'],
			englishExpected: ['a', 'b'],
			koreanExpected: ['a', 'b'],
			alternatesExpected: ['a', 'b'],
		});
		const sitemapChecks: [string, string, string | null, boolean][] = [
			[
				'D12',
				'every Korean post URL is removed',
				sitemapVerdict({ ...sitemapSets(), koreanUrls: [] }),
				true,
			],
			[
				'D13',
				'every hreflang alternate is removed',
				sitemapVerdict({ ...sitemapSets(), alternates: [] }),
				true,
			],
			['I4', 'the same sets arrive intact', sitemapVerdict(sitemapSets()), false],
		];
		for (const [id, what, verdict, mustReject] of sitemapChecks) {
			const ok = mustReject ? verdict !== null : verdict === null;
			if (!ok) failures.push(`${id} ${what}: verdict ${String(verdict)}`);
			console.log(
				`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)}  ${(mustReject ? 'DEFECT' : 'INVARIANCE').padEnd(10)} verdict ${verdict === null ? 'null' : 'set'} (expected ${mustReject ? 'set' : 'null'})  ${what}`,
			);
		}

		// The fallback's language fields come from a rendered page and a metadata
		// object, so no scratch file can doctor those either. Their verdict is pure
		// for the same reason, and D14 is the exact defect this PR shipped once:
		// `og:locale`, the JSON-LD `inLanguage` and its `@id` following the ROUTE
		// locale, so a Korean URL announced `ko_KR` over English prose.
		const englishOriginal = 'https://brandonwie.dev/posts/only-en';
		const englishBody: ArticleLocaleFields = {
			ogLocale: 'en_US',
			alternateLocale: [],
			canonical: englishOriginal,
			noindex: true,
			jsonLdInLanguage: 'en-US',
			jsonLdId: englishOriginal,
			langFacet: 'en',
		};
		const expectEnglish = {
			locale: 'en' as const,
			url: englishOriginal,
			alternateLocale: [] as string[],
			noindex: true,
		};
		const localeChecks: [string, string, string | null, boolean][] = [
			[
				'D14',
				'the fallback declares the route locale instead of the content locale',
				articleLocaleVerdict(
					{
						...englishBody,
						ogLocale: 'ko_KR',
						jsonLdInLanguage: 'ko-KR',
						jsonLdId: 'https://brandonwie.dev/ko/posts/only-en',
					},
					expectEnglish,
				),
				true,
			],
			[
				'D15',
				'the fallback is left indexable beside the English original it copies',
				articleLocaleVerdict({ ...englishBody, noindex: false }, expectEnglish),
				true,
			],
			[
				'I5',
				'the same English fields arrive intact',
				articleLocaleVerdict(englishBody, expectEnglish),
				false,
			],
		];
		for (const [id, what, verdict, mustReject] of localeChecks) {
			const ok = mustReject ? verdict !== null : verdict === null;
			if (!ok) failures.push(`${id} ${what}: verdict ${String(verdict)}`);
			console.log(
				`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)}  ${(mustReject ? 'DEFECT' : 'INVARIANCE').padEnd(10)} verdict ${verdict === null ? 'null' : 'set'} (expected ${mustReject ? 'set' : 'null'})  ${what}`,
			);
		}

		for (const control of CONTROLS) {
			const scratch = join(root, control.id);
			const svelteBuild = scratchBuild(scratch);
			let fixtureRoot: string | undefined;

			let nextBuild: string | undefined;
			let systemFixtureRoot: string | undefined;

			if (control.surface === 'oracle') {
				const target = join(svelteBuild, control.page!);
				const before = readFileSync(target, 'utf8');
				const after = control.apply!(before);
				if (after === before)
					throw new Error(`${control.id} changed nothing in ${target}; the control proves nothing`);
				writeFileSync(target, after);
			} else if (control.surface === 'next') {
				nextBuild = scratchNextBuild(scratch);
				const target = join(nextBuild, control.nextPage!);
				const before = readFileSync(target, 'utf8');
				const after = control.apply!(before);
				if (after === before)
					throw new Error(`${control.id} changed nothing in ${target}; the control proves nothing`);
				writeFileSync(target, after);
			} else if (control.surface === 'system') {
				systemFixtureRoot = join(scratch, 'system-fixture');
				writeSystemFixture(systemFixtureRoot);
				control.mutateSystem!(systemFixtureRoot);
			} else {
				fixtureRoot = join(scratch, 'fixture');
				writeFixture(fixtureRoot);
				control.mutate!(fixtureRoot);
			}

			const expected = control.kind === 'DEFECT' ? 1 : 0;
			const code = runSuite(svelteBuild, fixtureRoot, nextBuild, systemFixtureRoot);
			const ok = code === expected;
			if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected ${expected}`);
			console.log(
				`${ok ? 'PASS' : 'FAIL'}  ${control.id.padEnd(4)}  ${control.kind.padEnd(10)} exit ${code} (expected ${expected})  ${control.what}`,
			);
			rmSync(scratch, { recursive: true, force: true });
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	// 5 baseline runs (BASE, MISS, PART, NPRT, CRSH) and 6 verdict controls (D12,
	// D13, I4 for the sitemap; D14, D15, I5 for the fallback's language) sit
	// outside CONTROLS: the first five assert whole-suite exit codes and the last
	// six call a pure verdict directly, because those two rows generate their own
	// input and no scratch file can doctor it.
	const total = CONTROLS.length + 11;
	const defects = CONTROLS.filter((control) => control.kind === 'DEFECT').length + 4;
	console.log(
		`\n${total} controls: ${defects} defect (a doctored input must be rejected), ${total - defects} invariance/baseline (an untouched or benign input must be accepted)`,
	);
	if (failures.length) {
		for (const line of failures) console.error(`CONTROL FAILED ${line}`);
		console.error(
			`RESULT: ${failures.length}/${total} control(s) failed -- the C5 assertions do not fail closed`,
		);
		return 1;
	}
	console.log(`RESULT: ${total}/${total} controls behaved as specified`);
	return 0;
}

process.exit(main());
