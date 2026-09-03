/**
 * /feed, /ko/feed and `_redirects` — executable parity assertions.
 *
 *   pnpm migration:feed
 *   pnpm exec tsx scripts/assert-feed-redirects.ts <candidate-dir> <baseline-dir>
 *
 * These are the last three C8 surfaces. The whole-site comparator
 * (`migration-verify.ts`) sees all of them -- `_redirects` as a site artifact,
 * the two pages by their field map -- but at Slice 1 it is red for hundreds of
 * unrelated reasons (every unported page), so a green row for these surfaces
 * could not be read off it. This file isolates them so they can be proven now
 * and keep being proven per commit.
 *
 * What "proven" means here, per surface:
 *
 *   _redirects  the exported file exists as a FILE at the baseline path; the
 *               comparator's own site-artifact hash equals the frozen value in
 *               `verification/baseline/svelte-e23e808.json`; and the bytes
 *               equal the Svelte build's bytes. Two rows because the comparator
 *               hashes the file after collapsing whitespace
 *               (`migration-verify.ts`, the `SITE_FILES` loop), so a
 *               whitespace-only drift would pass its row; the byte row is what
 *               catches it.
 *
 *   /feed       the PAGE-OWNED contract of `SocialFeedPage.svelte`, asserted
 *   /ko/feed    the way `assert-article-parity.ts` asserts the article: exact
 *               `<title>`, meta description and canonical (against the frozen
 *               baseline fields); `<html lang>`; the `<h1>`, the `~/path`
 *               crumb and the lede; the campaign list -- count, order, each
 *               campaign's `<time datetime>` and text, cluster id, topic, and
 *               every chip's label, href, class tokens, `target` and `rel`;
 *               the blog chip's locale prefix; and the empty-state paragraph
 *               (present with the same text, or absent, exactly as in the
 *               Svelte build).
 *
 * Whole-page `internalLinks` / `textHash` equality with the frozen baseline is
 * NOT asserted: the Next site shell is still partial (fewer nav links than the
 * SvelteKit chrome), so those fields are shell-owned noise until Slice 3. The
 * controls prove that a shell change is invisible here and a page-owned change
 * is not.
 *
 * Expected values come from the SVELTE build (`build/feed.html`,
 * `build/ko/feed.html`) and the frozen baseline JSON, never from the candidate.
 * Both sides are read through the same extractor, so a parsing bug cannot make
 * one side look right by accident; Svelte's scoping hashes and hydration
 * comments are stripped before comparison.
 *
 * Three exit codes, as the sibling assertion scripts:
 *
 *   0   every row passes
 *   1   at least one row FAILED
 *   2   the script could not run at all (a build or the baseline is missing)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_JSON = 'verification/baseline/svelte-e23e808.json';

export const REDIRECTS = '_redirects';

/**
 * `lang` is the one field where the frozen baseline is NOT the oracle.
 *
 * The baseline records `pages["/ko/feed"].lang === "en"`: SvelteKit's
 * `hooks.server.ts` takes the locale from Paraglide's `url` strategy, and
 * `vite.config.ts` `urlPatterns` has no `/feed` entry, so `/ko/feed` falls
 * through to the base locale. It is one of the seven KO pages the C13 contract
 * lists as shipping `lang="en"`, and `assert-c13-shell.ts` already requires
 * every candidate page's `lang` to match its URL locale (its row 1 would go
 * red on a faithful `en`). The port therefore uses `ko`, and this file asserts
 * `ko`; the baseline's value is reported in the row detail so the divergence
 * stays visible rather than absorbed.
 */
export const FEED_PAGES = {
	en: { path: '/feed', file: 'feed.html', lang: 'en' },
	ko: { path: '/ko/feed', file: join('ko', 'feed.html'), lang: 'ko' },
} as const;

type FeedLocale = keyof typeof FEED_PAGES;

type Status = 'PASS' | 'FAIL';

interface Row {
	row: string;
	status: Status;
	detail: string;
}

export interface Chip {
	text: string;
	href: string | null;
	target: string | null;
	rel: string | null;
	classes: string[];
}

export interface Campaign {
	datetime: string | null;
	dateText: string;
	clusterId: string | null;
	topic: string;
	chips: Chip[];
}

export interface FeedShape {
	lang: string | null;
	title: string | null;
	description: string | null;
	canonical: string | null;
	h1: string | null;
	crumb: string | null;
	lede: string | null;
	empty: string | null;
	campaigns: Campaign[];
}

interface FrozenPage {
	lang: string | null;
	title: string | null;
	description: string | null;
	canonical: string | null;
	h1: string[];
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
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}

function attrOf(tag: string, name: string): string | null {
	const raw = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
	return raw === undefined ? null : decodeEntities(raw);
}

/** Class tokens minus Svelte's per-component scoping hash (`svelte-1quq4e0`). */
function classTokens(tag: string): string[] {
	return (attrOf(tag, 'class') ?? '')
		.split(/\s+/)
		.filter((token) => token.length > 0 && !token.startsWith('svelte-'))
		.sort();
}

function textOf(inner: string): string {
	return decodeEntities(inner.replace(/<[^>]*>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();
}

interface Element {
	tag: string;
	open: string;
	inner: string;
}

const VOID_TAGS = new Set(['meta', 'link', 'br', 'img', 'input', 'hr']);

/**
 * Every element whose opening tag satisfies `want`, with its inner HTML found
 * by a balanced walk over same-named tags. The walk matters: a campaign `<li>`
 * holds the chip `<li>`s, and a non-greedy match to the first `</li>` would
 * end the campaign at its first chip.
 */
function elements(html: string, want: (tag: string, name: string) => boolean): Element[] {
	const found: Element[] = [];
	for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*>/gi)) {
		const name = match[1].toLowerCase();
		if (!want(match[0], name)) continue;
		if (VOID_TAGS.has(name) || match[0].endsWith('/>')) {
			found.push({ tag: name, open: match[0], inner: '' });
			continue;
		}
		const start = (match.index ?? 0) + match[0].length;
		const step = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
		step.lastIndex = start;
		let depth = 1;
		let end = -1;
		for (let hit = step.exec(html); hit; hit = step.exec(html)) {
			depth += hit[1] === '/' ? -1 : 1;
			if (depth === 0) {
				end = hit.index;
				break;
			}
		}
		found.push({ tag: name, open: match[0], inner: end === -1 ? '' : html.slice(start, end) });
	}
	return found;
}

function byClass(html: string, token: string): Element[] {
	return elements(html, (tag) => classTokens(tag).includes(token));
}

function byTag(html: string, name: string): Element[] {
	return elements(html, (_, n) => n === name);
}

function first(list: Element[]): Element | null {
	return list.length > 0 ? list[0] : null;
}

/** The page-owned shape of a built feed page. Works on both SvelteKit and Next output. */
export function feedShape(rawHtml: string): FeedShape {
	// Svelte 5 hydration markers (`<!--[-->`, `<!--]-->`) and React's
	// `<!--$-->` boundaries carry no content.
	const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '');
	const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? '';
	const title = first(byTag(html, 'title'));
	const description = first(
		elements(html, (tag, name) => name === 'meta' && attrOf(tag, 'name') === 'description'),
	);
	const canonical = first(
		elements(html, (tag, name) => name === 'link' && attrOf(tag, 'rel') === 'canonical'),
	);
	const h1 = first(byTag(html, 'h1'));
	const crumb = first(byClass(html, 'crumb'));
	const lede = first(byClass(html, 'feed__lede'));
	const empty = first(byClass(html, 'feed__empty'));
	const list = first(byClass(html, 'feed__list'));
	const campaigns: Campaign[] = (list ? byClass(list.inner, 'campaign') : []).map((campaign) => {
		const time = first(byTag(campaign.inner, 'time'));
		const cluster = first(byClass(campaign.inner, 'campaign__id'));
		const topic = first(byClass(campaign.inner, 'campaign__topic'));
		const links = first(byClass(campaign.inner, 'campaign__links'));
		const chips: Chip[] = (links ? byTag(links.inner, 'a') : []).map((a) => ({
			text: textOf(a.inner),
			href: attrOf(a.open, 'href'),
			target: attrOf(a.open, 'target'),
			rel: attrOf(a.open, 'rel'),
			classes: classTokens(a.open),
		}));
		return {
			datetime: time ? attrOf(time.open, 'datetime') : null,
			dateText: time ? textOf(time.inner) : '',
			clusterId: cluster ? textOf(cluster.inner) : null,
			topic: topic ? textOf(topic.inner) : '',
			chips,
		};
	});
	return {
		lang: attrOf(htmlTag, 'lang'),
		title: title ? textOf(title.inner) : null,
		description: description ? attrOf(description.open, 'content') : null,
		canonical: canonical ? attrOf(canonical.open, 'href') : null,
		h1: h1 ? textOf(h1.inner) : null,
		crumb: crumb ? textOf(crumb.inner) : null,
		lede: lede ? textOf(lede.inner) : null,
		empty: empty ? textOf(empty.inner) : null,
		campaigns,
	};
}

/**
 * The comparator's site-artifact material, `migration-verify.ts` verbatim:
 * whitespace collapsed, then sha256 truncated to 16 hex characters.
 */
export function redirectsSiteHash(raw: string): string {
	return createHash('sha256').update(raw.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
}

function firstDifference(a: string, b: string): string {
	let at = 0;
	while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
	const window = (s: string): string => JSON.stringify(s.slice(Math.max(0, at - 40), at + 40));
	return `first difference at byte ${at}: ${window(a)} != ${window(b)}`;
}

function show(value: unknown): string {
	return JSON.stringify(value);
}

/** Every way the candidate campaign list differs from the expected one, in reading order. */
function diffCampaigns(expected: Campaign[], actual: Campaign[]): string[] {
	const problems: string[] = [];
	if (expected.length !== actual.length) {
		problems.push(`${actual.length} campaign(s), expected ${expected.length}`);
	}
	const count = Math.min(expected.length, actual.length);
	for (let i = 0; i < count; i += 1) {
		const want = expected[i];
		const got = actual[i];
		const at = `campaign[${i}]`;
		if (want.datetime !== got.datetime)
			problems.push(`${at} <time datetime> ${show(got.datetime)} != ${show(want.datetime)}`);
		if (want.dateText !== got.dateText)
			problems.push(`${at} <time> text ${show(got.dateText)} != ${show(want.dateText)}`);
		if (want.clusterId !== got.clusterId)
			problems.push(`${at} cluster id ${show(got.clusterId)} != ${show(want.clusterId)}`);
		if (want.topic !== got.topic)
			problems.push(`${at} topic ${show(got.topic)} != ${show(want.topic)}`);
		if (want.chips.length !== got.chips.length) {
			problems.push(`${at} ${got.chips.length} chip(s), expected ${want.chips.length}`);
		}
		const chips = Math.min(want.chips.length, got.chips.length);
		for (let j = 0; j < chips; j += 1) {
			const w = want.chips[j];
			const g = got.chips[j];
			const chip = `${at} chip[${j}]`;
			for (const field of ['text', 'href', 'target', 'rel'] as const) {
				if (w[field] !== g[field])
					problems.push(`${chip} ${field} ${show(g[field])} != ${show(w[field])}`);
			}
			if (w.classes.join(' ') !== g.classes.join(' '))
				problems.push(`${chip} classes ${show(g.classes)} != ${show(w.classes)}`);
		}
	}
	return problems;
}

/**
 * Run the C8 remainder rows against a candidate Next export.
 *
 * @param candidateDir - the Next export root (normally `next/build`)
 * @param baselineDir - the SvelteKit build root the page-owned values are read
 *   from (normally `build`); the frozen `_redirects` hash comes from the
 *   baseline JSON, not from this directory
 * @param quiet - suppress the per-row log lines (the controls runner sets it)
 * @returns 0 when every row passes, 1 when at least one row fails, 2 when a
 *   build or the frozen baseline is missing and nothing could be asserted
 */
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
		pages: Record<string, FrozenPage>;
	};
	if (!frozen.site[REDIRECTS]) {
		console.error(`FATAL: ${BASELINE_JSON} carries no site hash for ${REDIRECTS}`);
		return 2;
	}
	if (!existsSync(join(baselineDir, REDIRECTS))) {
		console.error(`FATAL: Svelte baseline ${REDIRECTS} not found: ${join(baselineDir, REDIRECTS)}`);
		return 2;
	}
	const expected = {} as Record<FeedLocale, { svelte: FeedShape; frozen: FrozenPage }>;
	for (const locale of Object.keys(FEED_PAGES) as FeedLocale[]) {
		const page = FEED_PAGES[locale];
		const baseFile = join(baselineDir, page.file);
		if (!existsSync(baseFile)) {
			console.error(`FATAL: Svelte baseline page not found: ${baseFile}`);
			return 2;
		}
		const frozenPage = frozen.pages[page.path];
		if (!frozenPage) {
			console.error(`FATAL: ${BASELINE_JSON} carries no page row for ${page.path}`);
			return 2;
		}
		const svelte = feedShape(readFileSync(baseFile, 'utf8'));
		// The Svelte build on disk and the frozen JSON must agree on the fields
		// both carry; otherwise there is no single oracle to assert against.
		const disagree = (
			[
				['title', svelte.title, frozenPage.title],
				['description', svelte.description, frozenPage.description],
				['canonical', svelte.canonical, frozenPage.canonical],
				['h1', svelte.h1, frozenPage.h1[0] ?? null],
			] as const
		).filter(([, a, b]) => a !== b);
		if (disagree.length) {
			console.error(
				`FATAL: ${baseFile} disagrees with ${BASELINE_JSON} on ${disagree.map(([f]) => f).join(', ')}; the Svelte build is not the frozen baseline`,
			);
			return 2;
		}
		expected[locale] = { svelte, frozen: frozenPage };
	}

	// --- R1-R3  _redirects ------------------------------------------------------
	{
		const candFile = join(candidateDir, REDIRECTS);
		const exported = existsSync(candFile) && statSync(candFile).isFile();
		if (exported) {
			pass(`R1 ${REDIRECTS} exported`, `file at ${candFile}`);
			const cand = readFileSync(candFile);
			const base = readFileSync(join(baselineDir, REDIRECTS));
			const hash = redirectsSiteHash(cand.toString('utf8'));
			if (hash === frozen.site[REDIRECTS])
				pass(
					`R2 ${REDIRECTS} comparator hash`,
					`site-artifact hash ${hash} equals the frozen baseline`,
				);
			else
				fail(
					`R2 ${REDIRECTS} comparator hash`,
					`site-artifact hash ${hash} != frozen ${frozen.site[REDIRECTS]} (Svelte build hashes ${redirectsSiteHash(base.toString('utf8'))})`,
				);
			if (cand.equals(base))
				pass(`R3 ${REDIRECTS} exact bytes`, `${cand.length} bytes identical to the Svelte build`);
			else
				fail(
					`R3 ${REDIRECTS} exact bytes`,
					`candidate ${cand.length} bytes, Svelte ${base.length}; ${firstDifference(base.toString('utf8'), cand.toString('utf8'))}`,
				);
		} else {
			fail(`R1 ${REDIRECTS} exported`, `no FILE at ${candFile} (a directory or nothing)`);
			fail(`R2 ${REDIRECTS} comparator hash`, 'nothing to hash');
			fail(`R3 ${REDIRECTS} exact bytes`, 'nothing to compare');
		}
	}

	// --- P1-P12  the two feed pages -------------------------------------------
	let index = 1;
	for (const locale of Object.keys(FEED_PAGES) as FeedLocale[]) {
		const page = FEED_PAGES[locale];
		const id = (): string => `P${index++}`;
		const { svelte, frozen: frozenPage } = expected[locale];
		const candFile = join(candidateDir, page.file);
		const exported = existsSync(candFile) && statSync(candFile).isFile();
		if (exported) pass(`${id()} ${page.path} exported`, `file at ${candFile}`);
		else {
			fail(`${id()} ${page.path} exported`, `no FILE at ${candFile} (a directory or nothing)`);
			index += 5;
			continue;
		}
		const cand = feedShape(readFileSync(candFile, 'utf8'));

		// head: the three fields the frozen baseline carries for this page
		{
			const problems: string[] = [];
			if (cand.title !== frozenPage.title)
				problems.push(`<title> ${show(cand.title)} != ${show(frozenPage.title)}`);
			if (cand.description !== frozenPage.description)
				problems.push(`description ${show(cand.description)} != ${show(frozenPage.description)}`);
			if (cand.canonical !== frozenPage.canonical)
				problems.push(`canonical ${show(cand.canonical)} != ${show(frozenPage.canonical)}`);
			if (problems.length === 0)
				pass(
					`${id()} ${page.path} head`,
					`title ${show(cand.title)}, description and canonical ${cand.canonical} equal the frozen baseline`,
				);
			else fail(`${id()} ${page.path} head`, problems.join('; '));
		}

		// html lang: see the FEED_PAGES comment for why `ko` is asserted where
		// the frozen baseline records `en`.
		{
			const note =
				frozenPage.lang === page.lang
					? 'the frozen baseline agrees'
					: `the frozen baseline records lang=${show(frozenPage.lang)} for this page; see FEED_PAGES`;
			if (cand.lang === page.lang)
				pass(
					`${id()} ${page.path} html lang`,
					`<html lang="${cand.lang}"> matches the URL locale; ${note}`,
				);
			else
				fail(
					`${id()} ${page.path} html lang`,
					`<html lang=${show(cand.lang)}> != "${page.lang}" (the URL locale); ${note}`,
				);
		}

		// header: h1 (frozen + Svelte agree), crumb and lede (Svelte build)
		{
			const problems: string[] = [];
			if (cand.h1 !== svelte.h1) problems.push(`<h1> ${show(cand.h1)} != ${show(svelte.h1)}`);
			if (cand.crumb !== svelte.crumb)
				problems.push(`crumb ${show(cand.crumb)} != ${show(svelte.crumb)}`);
			if (cand.lede !== svelte.lede)
				problems.push(`lede ${show(cand.lede)} != ${show(svelte.lede)}`);
			if (problems.length === 0)
				pass(
					`${id()} ${page.path} header`,
					`h1 ${show(cand.h1)}, crumb ${show(cand.crumb)}, lede (${cand.lede?.length ?? 0} chars) equal the Svelte build`,
				);
			else fail(`${id()} ${page.path} header`, problems.join('; '));
		}

		// campaigns: the ordered list, every chip, and the blog chip's locale prefix
		{
			const problems = diffCampaigns(svelte.campaigns, cand.campaigns);
			const prefix = `${locale === 'ko' ? '/ko' : ''}/posts/`;
			cand.campaigns.forEach((campaign, i) =>
				campaign.chips.forEach((chip, j) => {
					if (chip.classes.includes('chip--blog') && !(chip.href ?? '').startsWith(prefix))
						problems.push(
							`campaign[${i}] chip[${j}] blog chip href ${show(chip.href)} does not start with ${prefix}`,
						);
				}),
			);
			const chips = cand.campaigns.reduce((n, c) => n + c.chips.length, 0);
			if (problems.length === 0)
				pass(
					`${id()} ${page.path} campaigns`,
					`${cand.campaigns.length} campaign(s), ${chips} chip(s): order, dates, ids, topics, labels, hrefs, classes, target and rel equal the Svelte build`,
				);
			else fail(`${id()} ${page.path} campaigns`, problems.join('; '));
		}

		// empty state: present with the same text, or absent, exactly as in Svelte
		{
			const problems: string[] = [];
			if (cand.empty !== svelte.empty)
				problems.push(`empty-state ${show(cand.empty)} != ${show(svelte.empty)}`);
			if ((cand.empty !== null) !== (cand.campaigns.length === 0))
				problems.push(
					`empty-state ${cand.empty === null ? 'absent' : 'present'} with ${cand.campaigns.length} campaign(s)`,
				);
			if (problems.length === 0)
				pass(
					`${id()} ${page.path} empty state`,
					cand.empty === null
						? `absent on both sides (${cand.campaigns.length} campaign(s) rendered)`
						: `${show(cand.empty)} on both sides`,
				);
			else fail(`${id()} ${page.path} empty state`, problems.join('; '));
		}
	}

	// --- report ----------------------------------------------------------------
	const width = Math.max(...rows.map((r) => r.row.length));
	say('\nROW TABLE');
	for (const { row, status, detail } of rows)
		say(`  ${status.padEnd(4)} ${row.padEnd(width)}  ${detail}`);
	const failed = rows.filter((r) => r.status === 'FAIL');
	say(`\nRESULT: ${rows.length - failed.length} pass, ${failed.length} fail`);
	if (failed.length) return 1;
	say(
		'Scope: _redirects and the page-owned contract of /feed and /ko/feed. Shell-owned internalLinks/textHash parity for these pages closes with the site shell in Slice 3.',
	);
	return 0;
}

if (process.argv[1]?.endsWith('assert-feed-redirects.ts')) {
	runAssertions(process.argv[2] ?? 'next/build', process.argv[3] ?? 'build').then((code) =>
		process.exit(code),
	);
}
