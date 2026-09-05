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

import { linkedSlugs, writeFixture } from './assert-c5-glob-sites.ts';

const require = createRequire(import.meta.url);
const CONTROLS_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(CONTROLS_PATH), '..');
const SUITE = join(REPO_ROOT, 'scripts/assert-c5-glob-sites.ts');
const SOURCE_BUILD = join(REPO_ROOT, 'build');
const SOURCE_NEXT_BUILD = join(REPO_ROOT, 'next/build');
const ORACLE_PAGES = ['index.html', 'posts.html', 'ko.html', join('ko', 'posts.html')] as const;
/** The built Next pages the seventeenth call site's row reads. */
const NEXT_PAGES = [join('ko', 'system', '3b.html'), join('system', '3b.html')] as const;
/** A title the Korean page must render, resolved from the Korean corpus. */
const KOREAN_SERIES_TITLE = '토큰 스택: 다시 스캔하지 않는 네 겹의 코드 인텔리전스';
const ENGLISH_SERIES_TITLE =
	'The Token Stack: Four Layers of Code Intelligence Without Re-Scanning';

type Kind = 'DEFECT' | 'INVARIANCE';
type Surface = 'oracle' | 'next' | 'fixture';

interface Control {
	id: string;
	kind: Kind;
	surface: Surface;
	what: string;
	/** Rewrites one oracle page, addressed by its path under the scratch build. */
	page?: (typeof ORACLE_PAGES)[number];
	/** Rewrites one built Next page, addressed by its path under the scratch Next build. */
	nextPage?: (typeof NEXT_PAGES)[number];
	apply?: (html: string) => string;
	/** Rewrites the fixture corpus in place. */
	mutate?: (root: string) => void;
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
		id: 'D9',
		kind: 'DEFECT',
		surface: 'next',
		what: 'the built Korean page drops one series title',
		nextPage: join('ko', 'system', '3b.html'),
		apply: (html) => html.replace(KOREAN_SERIES_TITLE, ''),
	},
	{
		id: 'D10',
		kind: 'DEFECT',
		surface: 'next',
		what: 'the built Korean page keeps the English snapshot title, as if the merge never ran',
		nextPage: join('ko', 'system', '3b.html'),
		apply: (html) => html.replace(KOREAN_SERIES_TITLE, ENGLISH_SERIES_TITLE),
	},
	{
		id: 'I3',
		kind: 'INVARIANCE',
		surface: 'next',
		what: 'the series markup is reformatted around unchanged titles',
		nextPage: join('ko', 'system', '3b.html'),
		apply: (html) =>
			html.replaceAll('<li class="series-item"', '<li data-control="c5" class="series-item"'),
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
];

/** Scratch copies of only the pages the suite reads, from both builds. */
function scratchBuilds(root: string): { svelteBuild: string; nextBuild: string } {
	const svelteBuild = join(root, 'build');
	const nextBuild = join(root, 'next-build');
	for (const page of ORACLE_PAGES) {
		const target = join(svelteBuild, page);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(join(SOURCE_BUILD, page), target);
	}
	for (const page of NEXT_PAGES) {
		const target = join(nextBuild, page);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(join(SOURCE_NEXT_BUILD, page), target);
	}
	return { svelteBuild, nextBuild };
}

function runSuite(
	builds: { svelteBuild: string; nextBuild: string },
	fixtureRoot?: string,
): number {
	const args = [
		'--import',
		require.resolve('tsx'),
		SUITE,
		'--svelte-build',
		builds.svelteBuild,
		'--next-build',
		builds.nextBuild,
		...(fixtureRoot ? ['--fixture-root', fixtureRoot] : []),
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
		const baselineBuilds = scratchBuilds(join(root, 'baseline'));
		const baselineFixture = join(root, 'baseline-fixture');
		writeFixture(baselineFixture);
		const baseline = runSuite(baselineBuilds, baselineFixture);
		if (baseline !== 0) failures.push(`BASELINE unmodified copies: exit ${baseline}, expected 0`);
		console.log(
			`${baseline === 0 ? 'PASS' : 'FAIL'}  BASE  ${'BASELINE'.padEnd(10)} exit ${baseline} (expected 0)  unmodified scratch oracle and fixture`,
		);

		// A missing oracle is "could not run", not "passed".
		const emptyBuild = join(root, 'empty/build');
		mkdirSync(emptyBuild, { recursive: true });
		const missing = runSuite({ svelteBuild: emptyBuild, nextBuild: emptyBuild });
		if (missing !== 2) failures.push(`BASELINE missing oracle: exit ${missing}, expected 2`);
		console.log(
			`${missing === 2 ? 'PASS' : 'FAIL'}  MISS  ${'BASELINE'.padEnd(10)} exit ${missing} (expected 2)  a missing Svelte build cannot pass`,
		);

		for (const control of CONTROLS) {
			const scratch = join(root, control.id);
			const builds = scratchBuilds(scratch);
			let fixtureRoot: string | undefined;

			if (control.surface === 'oracle' || control.surface === 'next') {
				const target =
					control.surface === 'oracle'
						? join(builds.svelteBuild, control.page!)
						: join(builds.nextBuild, control.nextPage!);
				const before = readFileSync(target, 'utf8');
				const after = control.apply!(before);
				if (after === before)
					throw new Error(`${control.id} changed nothing in ${target}; the control proves nothing`);
				writeFileSync(target, after);
			} else {
				fixtureRoot = join(scratch, 'fixture');
				writeFixture(fixtureRoot);
				control.mutate!(fixtureRoot);
			}

			const expected = control.kind === 'DEFECT' ? 1 : 0;
			const code = runSuite(builds, fixtureRoot);
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

	const total = CONTROLS.length + 2;
	const defects = CONTROLS.filter((control) => control.kind === 'DEFECT').length;
	console.log(
		`\n${total} controls: ${defects} defect (must exit 1), ${total - defects} invariance/baseline (must exit 0 or 2)`,
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
