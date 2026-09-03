/**
 * Publishing surfaces -- sitemap, both RSS feeds and the Pagefind index.
 *
 *   pnpm migration:publishing                   # next/build against build/
 *   pnpm migration:publishing <candidate-dir> <baseline-dir>
 *
 * The whole-site comparator (`migration-verify.ts`) already hashes the three
 * feeds by semantic shape and counts Pagefind fragments, but at Slice 1 that
 * comparator is red for 360+ unrelated reasons (every unported page), so a
 * green feed row could not be read off it. This file isolates the publishing
 * contracts so they can be proven now and keep being proven per commit.
 *
 * What "proven" means here, per surface:
 *
 *   Feeds      the exported file exists as a FILE at the baseline path; its
 *              semantic shape (`feedShape` from the comparator: item/url
 *              counts, ordered links, titles) hashes to the frozen baseline
 *              value in `verification/baseline/svelte-e23e808.json`; and the
 *              bytes equal the Svelte build's bytes once `<lastBuildDate>` --
 *              the one field that legitimately moves per build -- is removed.
 *              The byte row exists because the semantic shape does not see
 *              `hreflang` alternates, `<lastmod>`, `<pubDate>` or
 *              `<category>`, and a port can lose any of them silently.
 *
 *   Pagefind   the bundle exists with both languages; the representative
 *              article has one fragment per locale whose url, title,
 *              `lang` and `category` filters are asserted EXACTLY (plan.md C10
 *              forbids "non-empty" assertions, since `SearchPage.svelte:73-76`
 *              substitutes '' / 'Untitled'); the fragment body contains a
 *              known sentence of the prose and none of the `data-pagefind-ignore`
 *              regions' text; and no page outside `/posts` was indexed, which
 *              is what proves the body marker is scoped rather than absent.
 *
 * Fragments are read directly: a `.pf_fragment` is gzip whose payload is the
 * 12-byte marker `pagefind_dcd` followed by JSON. Querying through the browser runtime
 * (filters, excerpts, the dev-mode masking at `SearchPage.svelte:38-40`) is
 * the search page's contract and closes with that port, not here.
 *
 * Three exit codes, as the sibling assertion scripts:
 *
 *   0   every row passes
 *   1   at least one row FAILED
 *   2   the script could not run at all (a build is missing)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { feedShape } from './migration-verify.ts';

export const ARTICLE_SLUG = 'giscus-sveltekit-integration';
export const FEEDS = ['sitemap.xml', 'rss.xml', 'ko/rss.xml'] as const;
const BASELINE_JSON = 'verification/baseline/svelte-e23e808.json';
const FRAGMENT_MARKER = 'pagefind_dcd';

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

interface Row {
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

/** `<lastBuildDate>` is the build clock; everything else in a feed is content. */
export function withoutBuildDate(raw: string): string {
	return raw.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, '<lastBuildDate/>');
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

function firstDifference(a: string, b: string): string {
	let at = 0;
	while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
	const window = (s: string): string => JSON.stringify(s.slice(Math.max(0, at - 40), at + 40));
	return `first difference at byte ${at}: ${window(a)} != ${window(b)}`;
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

	if (!existsSync(candidateDir)) {
		console.error(`FATAL: candidate build not found: ${candidateDir}`);
		return 2;
	}
	if (!existsSync(BASELINE_JSON)) {
		console.error(`FATAL: frozen baseline not found: ${BASELINE_JSON}`);
		return 2;
	}
	const frozen = JSON.parse(readFileSync(BASELINE_JSON, 'utf8')) as {
		site: Record<string, string>;
	};
	for (const name of FEEDS) {
		if (!existsSync(join(baselineDir, name))) {
			console.error(`FATAL: Svelte baseline feed not found: ${join(baselineDir, name)}`);
			return 2;
		}
		if (!frozen.site[name]) {
			console.error(`FATAL: ${BASELINE_JSON} carries no site hash for ${name}`);
			return 2;
		}
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
		const base = readFileSync(join(baselineDir, name), 'utf8');

		const hash = shapeHash(cand);
		if (hash === frozen.site[name])
			pass(`${id()} ${name} semantic shape`, `feedShape hash ${hash} equals the frozen baseline`);
		else
			fail(
				`${id()} ${name} semantic shape`,
				`feedShape hash ${hash} != frozen ${frozen.site[name]} (Svelte build hashes ${shapeHash(base)})`,
			);

		const candBytes = withoutBuildDate(cand);
		const baseBytes = withoutBuildDate(base);
		if (candBytes === baseBytes)
			pass(
				`${id()} ${name} exact bytes`,
				`${candBytes.length} bytes identical minus <lastBuildDate>`,
			);
		else
			fail(
				`${id()} ${name} exact bytes`,
				`candidate ${candBytes.length} bytes, Svelte ${baseBytes.length}; ${firstDifference(baseBytes, candBytes)}`,
			);
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
	const outside = fragments.map((f) => f.url).filter((url) => !/^(\/ko)?\/posts\//.test(url));
	if (fragments.length > 0 && outside.length === 0)
		pass('S4 body marker scope', `all ${fragments.length} fragment(s) are post pages`);
	else if (fragments.length > 0)
		fail('S4 body marker scope', `non-post page(s) indexed: ${outside.join(', ')}`);
	else fail('S4 body marker scope', 'no fragments to scope');

	// --- report ----------------------------------------------------------------
	const width = Math.max(...rows.map((r) => r.row.length));
	say('\nROW TABLE');
	for (const { row, status, detail } of rows)
		say(`  ${status.padEnd(4)} ${row.padEnd(width)}  ${detail}`);
	const failed = rows.filter((r) => r.status === 'FAIL');
	say(`\nRESULT: ${rows.length - failed.length} pass, ${failed.length} fail`);
	if (failed.length) return 1;
	say(
		'Scope: sitemap, both RSS feeds and the index for one bilingual article. /feed, /ko/feed, _redirects and the search page runtime remain open.',
	);
	return 0;
}

if (process.argv[1]?.endsWith('assert-publishing-surfaces.ts')) {
	runAssertions(process.argv[2] ?? 'next/build', process.argv[3] ?? 'build').then((code) =>
		process.exit(code),
	);
}
