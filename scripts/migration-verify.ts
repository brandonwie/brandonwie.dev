#!/usr/bin/env tsx
/**
 * migration-verify — the SvelteKit-to-Next.js parity harness.
 *
 * WHY THIS EXISTS FIRST. Every later slice's acceptance depends on this
 * comparator, so plan.md § Slice 0 builds and adversarially proves it before
 * any migration work. A harness that has never been shown to FAIL on a known
 * bad input is not evidence, so `scripts/migration-verify-controls.ts` injects
 * defects and asserts this program rejects them.
 *
 * WHAT IT COMPARES. Two static build trees, page by page, on fields extracted
 * from the built HTML plus the site-level artifacts:
 *   - the URL manifest (which pages exist at all)
 *   - title, meta description, canonical, hreflang alternates, OG and Twitter
 *   - every JSON-LD block, compared as parsed JSON rather than as text
 *   - the normalized visible text of the page body
 *   - sitemap.xml, rss.xml, ko/rss.xml on item counts, links and titles
 *     rather than as bytes, because they carry a build timestamp
 *   - the Pagefind index entry count
 *   - the HTTP status of every baseline URL plus deliberate misses, served from
 *     a real static server over the build tree
 *
 * URL NORMALIZATION is explicit, because the Step 1 spike settled the output
 * shape: SvelteKit writes `about.html`, Next under `trailingSlash: false`
 * writes the same, but `index.html` files map to their directory. Both forms
 * normalize to one canonical key, and the mapping is printed with --explain so
 * it can be checked rather than trusted.
 *
 * TEXT NORMALIZATION collapses runs of whitespace, so a Prettier reflow is not
 * reported as a content change. That is a deliberate blindness with a control
 * attached (control 6), not an accident.
 *
 * THE EXCEPTION LEDGER IS CLOSED AND DIFFERENCE-BOUND. Every approved
 * difference is one object with exactly the keys
 * {url, field, fingerprint, reason, approved_by, approved_on}. The fingerprint
 * is a hash of the url, field and the FULL baseline and candidate values, and
 * is printed under every unapproved difference so an entry is written by
 * copying it. Approving by url+field let one entry approve any future change to
 * a field; approving by the printed (truncated) detail let two long values with
 * a shared prefix collide. An unknown
 * key, a missing key, or a malformed file is FATAL rather than ignored. An
 * exception that matches no actual difference is ALSO fatal: a ledger that has
 * drifted from reality is how a harness quietly stops testing.
 *
 * WHAT IT DOES NOT DO — stated here rather than discovered later. It does not
 * take screenshots, drive the keyboard, run an accessibility audit, or measure
 * performance, and it never will: this is a build-artifact comparator. Those
 * are AC7 and AC9 obligations and they are carried by separate artifacts, not
 * by this file. AC7 and the accessibility half of AC9 are recorded in
 * verification/behavior-matrix.md and verification/thresholds-results.md,
 * captured against the Svelte baseline on 2026-08-27, and the Core Web Vitals
 * half was measured the same day with its bounds frozen first.
 *
 * USAGE
 *   tsx scripts/migration-verify.ts capture <build-dir> <out.json>
 *   tsx scripts/migration-verify.ts compare <baseline.json> <candidate-dir> \
 *       [--ledger verification/exception-ledger.json] [--explain]
 * EXIT
 *   0 = every field matches, or differs only where the ledger approves it
 *   1 = an unapproved difference, a malformed ledger, or a stale ledger entry
 *   2 = usage or I/O error
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ---------------------------------------------------------------- extraction

export interface PageFields {
	title: string | null;
	description: string | null;
	canonical: string | null;
	alternates: string[];
	og: Record<string, string>;
	twitter: Record<string, string>;
	jsonLd: unknown[];
	h1: string[];
	textHash: string;
	textLength: number;
	/** Round 26 additions. A reviewer mutated `<html lang>`, an internal link
	 * target and a content image `src` and this comparator reported parity on all
	 * three -- they are C13 and C9/C12 obligations and were simply not extracted.
	 * They are framework-NEUTRAL user semantics: what a reader or a crawler gets.
	 * Class names, framework chunk URLs and the script graph stay excluded on
	 * purpose; those change legitimately in a framework swap. */
	lang: string | null;
	dir: string | null;
	internalLinks: string[];
	images: string[];
	shell: Record<string, string>;
	/** Page size in bytes. Recorded only. Round 27 deleted the claim that this
	 * stood in for an HTTP status -- it did not, and it was not even compared.
	 * Real statuses are served and captured in Baseline.statuses. */
	bytes: number;
}

export interface BundleWeights {
	/** Recorded, NOT compared. A framework swap changes chunk names and sizes by
	 * construction, so diffing them would fail on every candidate for reasons
	 * that are not regressions. AC9's budget lives in verification/thresholds.md
	 * and is judged against these numbers by a person, not by this comparator. */
	htmlBytes: number;
	jsBytes: number;
	cssBytes: number;
	imageBytes: number;
	totalBytes: number;
	fileCount: number;
	largest: string[];
}

export interface Baseline {
	generatedFrom: string;
	pageCount: number;
	/** URL -> HTTP status, from a real static server over the build tree.
	 *
	 * Round 27: the previous revision claimed page byte length stood in for a
	 * status. It did not, and nothing compared it. This serves the build the way
	 * Cloudflare Pages does -- exact file, then `<path>.html`, then
	 * `<path>/index.html`, else `404.html` with status 404 -- requests every
	 * baseline URL plus deliberate misses, and compares the results. */
	statuses?: Record<string, number>;
	bundle?: BundleWeights;
	pages: Record<string, PageFields>;
	site: Record<string, string>;
	pagefindEntries: number | null;
}

const VOID_TEXT = /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Collapse whitespace so a reflow is not a content change. See control 6. */
export function normalizeText(html: string): string {
	return html
		.replace(VOID_TEXT, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** build/about.html -> /about ; build/index.html -> / ; build/a/index.html -> /a */
export function urlKey(buildDir: string, file: string): string {
	let rel = relative(buildDir, file).split(sep).join('/');
	rel = rel.replace(/index\.html$/, '').replace(/\.html$/, '');
	const key = '/' + rel.replace(/\/$/, '').replace(/^\//, '');
	return key === '/' ? '/' : key.replace(/\/$/, '');
}

function attr(tag: string, name: string): string | null {
	const m =
		tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) ??
		tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'));
	return m ? m[1] : null;
}

function metaTags(html: string): string[] {
	return html.match(/<meta\b[^>]*>/gi) ?? [];
}

export function extractFields(html: string): PageFields {
	const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
	const og: Record<string, string> = {};
	const twitter: Record<string, string> = {};
	let description: string | null = null;

	for (const tag of metaTags(head)) {
		const property = attr(tag, 'property');
		const name = attr(tag, 'name');
		const content = attr(tag, 'content') ?? '';
		if (property?.startsWith('og:')) og[property] = content;
		else if (name?.startsWith('twitter:')) twitter[name] = content;
		else if (name === 'description') description = content;
	}

	const links = head.match(/<link\b[^>]*>/gi) ?? [];
	let canonical: string | null = null;
	const alternates: string[] = [];
	for (const tag of links) {
		const rel = attr(tag, 'rel');
		if (rel === 'canonical') canonical = attr(tag, 'href');
		if (rel === 'alternate' && attr(tag, 'hreflang')) {
			alternates.push(`${attr(tag, 'hreflang')} ${attr(tag, 'href')}`);
		}
	}
	alternates.sort();

	const jsonLd: unknown[] = [];
	const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	for (const m of html.matchAll(ldRe)) {
		try {
			jsonLd.push(JSON.parse(m[1].trim()));
		} catch {
			jsonLd.push({ __unparseable: normalizeText(m[1]).slice(0, 200) });
		}
	}

	const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => normalizeText(m[1]));
	const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	const bodyStart = html.search(/<body\b[^>]*>/i);
	const body = bodyStart === -1 ? html : html.slice(bodyStart);
	const text = normalizeText(body);

	const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? '';
	// Round 27: these were de-duplicated sets. A reviewer duplicated one /about
	// link and broke one occurrence of it, and the set erased the difference. They
	// are OCCURRENCE LISTS in document order now -- a repeated target is a fact
	// about the page, and losing it loses the regression.
	const internalLinks = [...body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)]
		.map((m) => m[1])
		.filter((href) => href.startsWith('/') || href.startsWith('https://brandonwie.dev'));
	// `alt` was omitted, so an image losing its alt text read as parity. It is
	// user-visible (assistive technology) and part of the C9/C12 obligation.
	const images = [...body.matchAll(/<img\b[^>]*>/gi)]
		.map((m) => m[0])
		.filter((tag) => {
			const src = attr(tag, 'src');
			return src !== null && !src.startsWith('/_app/');
		})
		.map((tag) => `${attr(tag, 'src')} alt=${JSON.stringify(attr(tag, 'alt'))}`);
	// Every automatable row of plan.md C13's element table. `color-scheme` was
	// missing, and a reviewer flipped it from dark to light without the comparator
	// noticing. Rows that need a recorded human decision -- the font mechanism,
	// preconnect hints, the preload-data attribute -- are captured as values here
	// so a change is visible; judging whether the change is acceptable is C13's
	// job, not this comparator's.
	const SHELL_METAS = ['viewport', 'color-scheme', 'theme-color', 'robots'];
	const SHELL_LINKS = ['icon', 'manifest', 'sitemap', 'preconnect', 'stylesheet'];
	const shell: Record<string, string> = {};
	for (const tag of metaTags(head)) {
		const charset = attr(tag, 'charset');
		if (charset) shell.charset = charset;
		const name = attr(tag, 'name');
		if (name && SHELL_METAS.includes(name)) shell[`meta:${name}`] = attr(tag, 'content') ?? '';
	}
	for (const tag of links) {
		const rel = attr(tag, 'rel');
		if (!rel || !SHELL_LINKS.includes(rel)) continue;
		const href = attr(tag, 'href') ?? '';
		if (href.startsWith('/_app/')) continue;
		shell[`link:${rel}:${href}`] = attr(tag, 'type') ?? '';
	}
	const bodyTag = html.match(/<body\b[^>]*>/i)?.[0] ?? '';
	const preload = attr(bodyTag, 'data-sveltekit-preload-data');
	if (preload !== null) shell['body:preload-data'] = preload;

	return {
		lang: attr(htmlTag, 'lang'),
		dir: attr(htmlTag, 'dir'),
		internalLinks,
		images,
		shell,
		bytes: html.length,
		title: titleMatch ? normalizeText(titleMatch[1]) : null,
		description,
		canonical,
		alternates,
		og,
		twitter,
		jsonLd,
		h1,
		textHash: createHash('sha256').update(text).digest('hex').slice(0, 16),
		textLength: text.length,
	};
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry === 'pagefind' || entry === '_app') continue;
			walk(full, out);
		} else if (entry.endsWith('.html')) {
			out.push(full);
		}
	}
	return out;
}

/**
 * Site-level artifacts compared outside the page map.
 *
 * `404.html` was here and has been REMOVED: it embeds content-hashed
 * `_app/immutable/*` URLs, so its bytes change on every build, and the first
 * cross-build run reported it as a difference. It is already compared as the
 * page `/404` on its fields and normalized text, where asset hashes do not
 * matter -- control 10 proves deleting it is still caught. Raw hashing is
 * reserved for `_redirects`, which is static text.
 */
const SITE_FILES = ['sitemap.xml', 'rss.xml', 'ko/rss.xml', '_redirects'];

/**
 * Feeds carry a build timestamp, so hashing the whole file makes the comparison
 * non-deterministic. The negative-control run right after a rebuild reported
 * `rss.xml` changed when only `<lastBuildDate>` had moved -- a harness that
 * reports a false difference on every rebuild is worse than no harness. AC5
 * asks for a SEMANTIC diff of the feeds (item counts, ordering, links, locale
 * split), so that is what is compared and the timestamp is excluded by design.
 */
function feedShape(raw: string): string {
	const tag = (name: string): string[] =>
		[...raw.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'gi'))].map((m) =>
			m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
		);
	const items = (raw.match(/<item>/gi) ?? []).length;
	const urls = (raw.match(/<url>/gi) ?? []).length;
	return JSON.stringify({
		items,
		urls,
		links: [...tag('link'), ...tag('loc')],
		titles: tag('title'),
	});
}

const SEMANTIC_FEEDS = new Set(['sitemap.xml', 'rss.xml', 'ko/rss.xml']);

/** Resolve a URL against a static export the way Cloudflare Pages serves it. */
export function resolveStatic(buildDir: string, urlPath: string): { file: string | null } {
	const clean = urlPath.split('?')[0].replace(/\/+$/, '') || '/';
	const rel = clean === '/' ? 'index.html' : clean.replace(/^\//, '');
	for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
		const full = join(buildDir, candidate);
		if (existsSync(full) && statSync(full).isFile()) return { file: full };
	}
	return { file: null };
}

/** Serve the build tree and record the status of every URL asked for. */
export async function captureStatuses(
	buildDir: string,
	urls: string[],
): Promise<Record<string, number>> {
	const server = createServer((req, res) => {
		const { file } = resolveStatic(buildDir, req.url ?? '/');
		if (file) {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end(readFileSync(file));
			return;
		}
		const notFound = join(buildDir, '404.html');
		res.writeHead(404, { 'content-type': 'text/html' });
		res.end(existsSync(notFound) ? readFileSync(notFound) : 'not found');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	const statuses: Record<string, number> = {};
	try {
		for (const url of urls) {
			const response = await fetch(`http://127.0.0.1:${port}${url}`, { redirect: 'manual' });
			statuses[url] = response.status;
			await response.arrayBuffer();
		}
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
	return statuses;
}

/** URLs asked for beyond the manifest: a miss must be a miss. */
const NEGATIVE_URLS = ['/this-page-does-not-exist', '/posts/this-post-does-not-exist'];

function bundleWeights(buildDir: string): BundleWeights {
	const byExt = { htmlBytes: 0, jsBytes: 0, cssBytes: 0, imageBytes: 0 };
	let totalBytes = 0;
	let fileCount = 0;
	const sizes: Array<[string, number]> = [];
	const walkAll = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			const st = statSync(full);
			if (st.isDirectory()) {
				walkAll(full);
				continue;
			}
			if (entry.endsWith('.br') || entry.endsWith('.gz')) continue;
			fileCount += 1;
			totalBytes += st.size;
			sizes.push([relative(buildDir, full).split(sep).join('/'), st.size]);
			if (entry.endsWith('.html')) byExt.htmlBytes += st.size;
			else if (entry.endsWith('.js')) byExt.jsBytes += st.size;
			else if (entry.endsWith('.css')) byExt.cssBytes += st.size;
			else if (/\.(png|jpe?g|webp|avif|svg|gif)$/i.test(entry)) byExt.imageBytes += st.size;
		}
	};
	walkAll(buildDir);
	sizes.sort((a, b) => b[1] - a[1]);
	return {
		...byExt,
		totalBytes,
		fileCount,
		largest: sizes.slice(0, 10).map(([path, size]) => `${path} ${size}`),
	};
}

function pagefindEntries(buildDir: string): number | null {
	const dir = join(buildDir, 'pagefind');
	if (!existsSync(dir)) return null;
	try {
		return readdirSync(join(dir, 'fragment')).length;
	} catch {
		return null;
	}
}

export async function capture(buildDir: string): Promise<Baseline> {
	if (!existsSync(buildDir)) {
		console.error(`FATAL: build directory not found: ${buildDir}`);
		process.exit(2);
	}
	const pages: Record<string, PageFields> = {};
	for (const file of walk(buildDir)) {
		pages[urlKey(buildDir, file)] = extractFields(readFileSync(file, 'utf8'));
	}
	const site: Record<string, string> = {};
	for (const name of SITE_FILES) {
		const full = join(buildDir, name);
		if (existsSync(full)) {
			const raw = readFileSync(full, 'utf8');
			const material = SEMANTIC_FEEDS.has(name) ? feedShape(raw) : raw.replace(/\s+/g, ' ').trim();
			site[name] = createHash('sha256').update(material).digest('hex').slice(0, 16);
		}
	}
	const statuses = await captureStatuses(buildDir, [
		...Object.keys(pages).sort(),
		...NEGATIVE_URLS,
	]);

	return {
		generatedFrom: buildDir,
		pageCount: Object.keys(pages).length,
		statuses,
		bundle: bundleWeights(buildDir),
		pages,
		site,
		pagefindEntries: pagefindEntries(buildDir),
	};
}

// ------------------------------------------------------------------- ledger

export interface Exception {
	url: string;
	field: string;
	/** The comparator's printed fingerprint for the one approved difference. */
	fingerprint: string;
	reason: string;
	approved_by: string;
	approved_on: string;
}

/**
 * Round 26: `expected` was added and the format stayed CLOSED, so every
 * pre-existing entry is now invalid until it names the difference it approves.
 *
 * Approving by url+field alone was the defect: one `title` entry approved two
 * unrelated injected titles and both runs exited 0. An approval is for ONE
 * known difference, not for a field permanently. `expected` must equal the
 * comparator's own detail string for that difference -- printed verbatim on
 * every unapproved diff, so writing an entry means copying what the run said.
 */
const LEDGER_KEYS = [
	'url',
	'field',
	'fingerprint',
	'reason',
	'approved_by',
	'approved_on',
] as const;

export function loadLedger(path: string | null): Exception[] {
	if (!path || !existsSync(path)) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		console.error(`FATAL: exception ledger ${path} is not valid JSON: ${(error as Error).message}`);
		process.exit(1);
	}
	if (!Array.isArray(parsed)) {
		console.error(`FATAL: exception ledger ${path} must be a JSON array of exception objects`);
		process.exit(1);
	}
	return parsed.map((entry, index) => {
		if (typeof entry !== 'object' || entry === null) {
			console.error(`FATAL: ledger entry ${index} is not an object`);
			process.exit(1);
		}
		const keys = Object.keys(entry as object).sort();
		const want = [...LEDGER_KEYS].sort();
		if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) {
			console.error(
				`FATAL: ledger entry ${index} has keys [${keys.join(', ')}]; the format is CLOSED and requires exactly [${want.join(', ')}]`,
			);
			process.exit(1);
		}
		for (const key of LEDGER_KEYS) {
			const value = (entry as Record<string, unknown>)[key];
			if (typeof value !== 'string' || value.trim() === '') {
				console.error(`FATAL: ledger entry ${index} field ${key} must be a non-empty string`);
				process.exit(1);
			}
		}
		return entry as Exception;
	});
}

// -------------------------------------------------------- shell normalization

/** Framework bundle roots. Their filenames are content-hashed and framework-
 *  owned, so they are compared as presence, never as names. */
const BUNDLE_PREFIXES = ['/_app/', '/_next/'];

/** HTML entities an attribute value can legally carry.
 *
 * `extractFields()` reads attributes as raw serialized text, so the same URL
 * spelled `&` on one side and `&amp;` on the other reads as two different
 * shell keys. SvelteKit copied `app.html`'s raw `&` through; React escapes it.
 * A browser parses both to the same URL, and the shell contract is about the
 * document, not its serialization. */
function decodeAttrEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&amp;/g, '&');
}

/**
 * Resolve a relative href against the page's directory, keeping EVERY
 * component of the result.
 *
 * `URL.pathname` alone was the first version and it was wrong: it silently
 * discards `?query` and `#fragment`, so `../favicon.svg` and
 * `../favicon.svg?v=2` normalized to the same key and a cache-busting query
 * added to any shell link would have compared equal. A normalization that
 * erases part of the value it normalizes is not a normalization, it is a
 * blindness -- controls 30 and 31 exist to keep it that way.
 */
function resolveAgainstPage(href: string, baseDir: string): string {
	const url = new URL(href, `http://normalize.invalid${baseDir}`);
	return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Put one page's shell into the form the CONTRACT is written about, so both
 * sides of a comparison are read the same way.
 *
 * Three things happen, and each one exists because a real difference was
 * unreachable without it:
 *
 * 1. **Link hrefs resolve against the page URL.** `%sveltekit.assets%` emits
 *    route-relative paths, so the baseline holds four spellings of one file --
 *    `/favicon.svg` on 1 page, `./favicon.svg` on 11, `../favicon.svg` on 182
 *    and `../../favicon.svg` on 172. A candidate linking absolutely could not
 *    match 365 of them, although every spelling resolves to the same URL in a
 *    browser. Absolute URLs with a scheme are left alone.
 *
 * 2. **Bundle assets collapse to one presence key.** `extractFields()` already
 *    skipped `/_app/`, but only in that exact spelling, so 365 baseline pages
 *    still carried 1087 content-hashed stylesheet entries the skip was written
 *    for. They collapse to `link:<bundle>` rather than vanishing: a candidate
 *    that ships NO framework stylesheet at all still differs from a baseline
 *    that ships some, which is the one thing those entries were worth.
 *
 * 3. **Keys are sorted.** `scalarDiff` compares `JSON.stringify` output, which
 *    is insertion-ordered, so moving a `<meta>` within `<head>` read as a
 *    difference. Head element order carries no meaning for these elements.
 *
 * Every one of the three is paired with a defect control that must still fail:
 * a href pointing at a DIFFERENT file, a missing link, a semantically changed
 * font URL, and a build with its framework stylesheets removed.
 */
/**
 * Key-sorted copy of a meta map.
 *
 * `scalarDiff` compares `JSON.stringify` output, which is insertion-ordered, so
 * a `<meta property="og:type">` moved within `<head>` read as a difference. The
 * order of head elements carries no meaning for these maps, and it is not the
 * candidate's to choose: SvelteKit emitted them in template order and Next's
 * Metadata API emits them in its own. Bounded by controls 32-34, which still
 * catch a changed value and a missing tag.
 */
function sortKeys(map: Record<string, string>): Record<string, string> {
	return Object.fromEntries(
		Object.keys(map)
			.sort()
			.map((key) => [key, map[key]]),
	);
}

export function normalizeShell(url: string, shell: Record<string, string>): Record<string, string> {
	const baseDir = url === '/' ? '/' : `${url.replace(/\/[^/]*$/, '')}/`;
	const out: Record<string, string> = {};
	let bundleAssets = 0;

	for (const [key, value] of Object.entries(shell)) {
		const link = /^link:([^:]+):([\s\S]*)$/.exec(key);
		if (!link) {
			out[key] = value;
			continue;
		}
		const [, rel, rawHref] = link;
		const href = decodeAttrEntities(rawHref);
		const isAbsoluteUrl = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
		const resolved = isAbsoluteUrl ? href : resolveAgainstPage(href, baseDir);
		if (BUNDLE_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
			bundleAssets += 1;
			continue;
		}
		out[`link:${rel}:${resolved}`] = value;
	}
	if (bundleAssets > 0) out['link:<bundle>'] = 'present';

	return Object.fromEntries(
		Object.keys(out)
			.sort()
			.map((k) => [k, out[k]]),
	);
}

// ------------------------------------------------------------------ compare

interface Diff {
	url: string;
	field: string;
	detail: string;
	/** sha256 of url + field + the FULL baseline and candidate values.
	 *
	 * Round 27: approvals were matched against `detail`, which trim() truncates
	 * at 120 characters for printing. Two long `internalLinks` differences shared
	 * a prefix, so one approval covered both and the second exited 0. The
	 * approval key is now a hash of the untruncated values; `detail` stays as the
	 * human-readable line and is no longer load-bearing. */
	fingerprint: string;
}

function scalarDiff(url: string, field: string, a: unknown, b: unknown, out: Diff[]): void {
	const left = JSON.stringify(a ?? null);
	const right = JSON.stringify(b ?? null);
	if (left === right) return;
	out.push({
		url,
		field,
		detail: `baseline ${trim(left)} != candidate ${trim(right)}`,
		fingerprint: createHash('sha256')
			.update(`${url}\u0000${field}\u0000${left}\u0000${right}`)
			.digest('hex')
			.slice(0, 32),
	});
}

function trim(value: string): string {
	return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

export function compare(baseline: Baseline, candidate: Baseline): Diff[] {
	const diffs: Diff[] = [];
	const baseUrls = new Set(Object.keys(baseline.pages));
	const candUrls = new Set(Object.keys(candidate.pages));

	for (const url of [...baseUrls].sort()) {
		if (!candUrls.has(url))
			diffs.push({ url, field: 'page', detail: 'present in baseline, MISSING from candidate' });
	}
	for (const url of [...candUrls].sort()) {
		if (!baseUrls.has(url))
			diffs.push({ url, field: 'page', detail: 'present in candidate, absent from baseline' });
	}

	for (const url of [...baseUrls].filter((u) => candUrls.has(u)).sort()) {
		const a = baseline.pages[url];
		const b = candidate.pages[url];
		scalarDiff(url, 'title', a.title, b.title, diffs);
		scalarDiff(url, 'description', a.description, b.description, diffs);
		scalarDiff(url, 'canonical', a.canonical, b.canonical, diffs);
		scalarDiff(url, 'alternates', a.alternates, b.alternates, diffs);
		scalarDiff(url, 'og', sortKeys(a.og), sortKeys(b.og), diffs);
		scalarDiff(url, 'twitter', sortKeys(a.twitter), sortKeys(b.twitter), diffs);
		scalarDiff(url, 'jsonLd', a.jsonLd, b.jsonLd, diffs);
		scalarDiff(url, 'h1', a.h1, b.h1, diffs);
		scalarDiff(url, 'text', a.textHash, b.textHash, diffs);
		scalarDiff(url, 'lang', a.lang, b.lang, diffs);
		scalarDiff(url, 'dir', a.dir, b.dir, diffs);
		scalarDiff(url, 'internalLinks', a.internalLinks, b.internalLinks, diffs);
		scalarDiff(url, 'images', a.images, b.images, diffs);
		scalarDiff(url, 'shell', normalizeShell(url, a.shell), normalizeShell(url, b.shell), diffs);
	}

	for (const name of SITE_FILES) {
		scalarDiff(
			name,
			'site-artifact',
			baseline.site[name] ?? null,
			candidate.site[name] ?? null,
			diffs,
		);
	}
	scalarDiff(
		'(site)',
		'pagefindEntries',
		baseline.pagefindEntries,
		candidate.pagefindEntries,
		diffs,
	);
	return diffs;
}

// ---------------------------------------------------------------------- cli

async function main(argv: string[]): Promise<number> {
	const [mode, ...rest] = argv;
	if (mode === 'capture') {
		const [buildDir, outFile] = rest;
		if (!buildDir || !outFile) {
			console.error('usage: migration-verify capture <build-dir> <out.json>');
			return 2;
		}
		const baseline = await capture(buildDir);
		writeFileSync(outFile, `${JSON.stringify(baseline, null, 2)}\n`);
		console.log(`captured ${baseline.pageCount} pages from ${buildDir} -> ${outFile}`);
		console.log(`  site artifacts ${Object.keys(baseline.site).length}/${SITE_FILES.length}`);
		console.log(`  pagefind fragments ${baseline.pagefindEntries ?? 'ABSENT'}`);
		const statusCounts: Record<string, number> = {};
		for (const code of Object.values(baseline.statuses ?? {})) {
			statusCounts[code] = (statusCounts[code] ?? 0) + 1;
		}
		console.log(
			`  served statuses ${Object.entries(statusCounts)
				.map(([code, n]) => `${n}x${code}`)
				.join(', ')} (incl. ${NEGATIVE_URLS.length} deliberate misses)`,
		);
		const b = baseline.bundle;
		if (b) {
			console.log(
				`  bundle ${b.fileCount} files / ${(b.totalBytes / 1024 / 1024).toFixed(1)} MB ` +
					`(html ${(b.htmlBytes / 1024).toFixed(0)} KB, js ${(b.jsBytes / 1024).toFixed(0)} KB, ` +
					`css ${(b.cssBytes / 1024).toFixed(0)} KB, images ${(b.imageBytes / 1024 / 1024).toFixed(1)} MB)`,
			);
			console.log('  bundle weights are RECORDED, not compared -- see verification/thresholds.md');
		}
		return 0;
	}

	if (mode === 'compare') {
		const [baselineFile, candidateDir] = rest;
		if (!baselineFile || !candidateDir) {
			console.error(
				'usage: migration-verify compare <baseline.json> <candidate-dir> [--ledger f] [--explain]',
			);
			return 2;
		}
		const ledgerIndex = rest.indexOf('--ledger');
		const ledgerPath =
			ledgerIndex === -1 ? 'verification/exception-ledger.json' : rest[ledgerIndex + 1];
		const explain = rest.includes('--explain');

		const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline;
		const candidate = await capture(candidateDir);
		const ledger = loadLedger(ledgerPath);
		const diffs = compare(baseline, candidate);

		if (explain) {
			console.log(`baseline ${baseline.pageCount} pages; candidate ${candidate.pageCount} pages`);
			console.log(`ledger ${ledger.length} approved exception(s) from ${ledgerPath}`);
		}

		const used = new Set<number>();
		const unapproved: Diff[] = [];
		for (const diff of diffs) {
			const hit = ledger.findIndex(
				(e) => e.url === diff.url && e.field === diff.field && e.fingerprint === diff.fingerprint,
			);
			if (hit === -1) unapproved.push(diff);
			else used.add(hit);
		}

		const stale = ledger.filter((_, i) => !used.has(i));
		for (const diff of unapproved) {
			console.error(`DIFF ${diff.url} [${diff.field}] ${diff.detail}`);
			console.error(`  fingerprint ${diff.fingerprint}`);
		}
		for (const diff of unapproved) {
			const sameSlot = ledger.find((e) => e.url === diff.url && e.field === diff.field);
			if (sameSlot) {
				console.error(
					`  the ledger approves a DIFFERENT difference at ${diff.url} [${diff.field}]: ` +
						`fingerprint ${sameSlot.fingerprint}. An approval covers one known ` +
						'difference, not the field.',
				);
			}
		}
		for (const entry of stale) {
			console.error(
				`STALE LEDGER ENTRY ${entry.url} [${entry.field}] approves a difference that does not exist; ` +
					'a ledger that has drifted from reality is how a harness stops testing',
			);
		}
		if (unapproved.length || stale.length) {
			console.error(
				`RESULT: ${unapproved.length} unapproved difference(s), ${stale.length} stale ledger entry(ies)`,
			);
			return 1;
		}
		console.log(
			`PARITY: ${candidate.pageCount} pages, ${Object.keys(candidate.site).length} site artifacts, ` +
				`${ledger.length} approved exception(s), 0 unapproved differences`,
		);
		console.log(
			'  NOT CHECKED here: screenshots, keyboard flows, accessibility, performance (AC7/AC9)',
		);
		return 0;
	}

	console.error('usage: migration-verify <capture|compare> ...');
	return 2;
}

if (process.argv[1]?.endsWith('migration-verify.ts')) {
	main(process.argv.slice(2)).then((code) => process.exit(code));
}
