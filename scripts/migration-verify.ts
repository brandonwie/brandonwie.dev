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
 * THE EXCEPTION LEDGER IS CLOSED. Every approved difference is one object with
 * exactly the keys {url, field, reason, approved_by, approved_on}. An unknown
 * key, a missing key, or a malformed file is FATAL rather than ignored. An
 * exception that matches no actual difference is ALSO fatal: a ledger that has
 * drifted from reality is how a harness quietly stops testing.
 *
 * WHAT IT DOES NOT DO — stated here rather than discovered later. It does not
 * take screenshots, drive the keyboard, run an accessibility audit, or measure
 * performance. plan.md lists those in the Slice 0 baseline; they need a browser
 * automation dependency this repository does not have, and adding one is a
 * decision, not an implementation detail. They are AC7 and AC9 obligations and
 * are recorded as open in the task folder rather than silently dropped.
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
}

export interface Baseline {
	generatedFrom: string;
	pageCount: number;
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

	return {
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

function pagefindEntries(buildDir: string): number | null {
	const dir = join(buildDir, 'pagefind');
	if (!existsSync(dir)) return null;
	try {
		return readdirSync(join(dir, 'fragment')).length;
	} catch {
		return null;
	}
}

export function capture(buildDir: string): Baseline {
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
	return {
		generatedFrom: buildDir,
		pageCount: Object.keys(pages).length,
		pages,
		site,
		pagefindEntries: pagefindEntries(buildDir),
	};
}

// ------------------------------------------------------------------- ledger

export interface Exception {
	url: string;
	field: string;
	reason: string;
	approved_by: string;
	approved_on: string;
}

const LEDGER_KEYS = ['url', 'field', 'reason', 'approved_by', 'approved_on'] as const;

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

// ------------------------------------------------------------------ compare

interface Diff {
	url: string;
	field: string;
	detail: string;
}

function scalarDiff(url: string, field: string, a: unknown, b: unknown, out: Diff[]): void {
	const left = JSON.stringify(a ?? null);
	const right = JSON.stringify(b ?? null);
	if (left !== right) {
		out.push({ url, field, detail: `baseline ${trim(left)} != candidate ${trim(right)}` });
	}
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
		scalarDiff(url, 'og', a.og, b.og, diffs);
		scalarDiff(url, 'twitter', a.twitter, b.twitter, diffs);
		scalarDiff(url, 'jsonLd', a.jsonLd, b.jsonLd, diffs);
		scalarDiff(url, 'h1', a.h1, b.h1, diffs);
		scalarDiff(url, 'text', a.textHash, b.textHash, diffs);
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

function main(argv: string[]): number {
	const [mode, ...rest] = argv;
	if (mode === 'capture') {
		const [buildDir, outFile] = rest;
		if (!buildDir || !outFile) {
			console.error('usage: migration-verify capture <build-dir> <out.json>');
			return 2;
		}
		const baseline = capture(buildDir);
		writeFileSync(outFile, `${JSON.stringify(baseline, null, 2)}\n`);
		console.log(`captured ${baseline.pageCount} pages from ${buildDir} -> ${outFile}`);
		console.log(`  site artifacts ${Object.keys(baseline.site).length}/${SITE_FILES.length}`);
		console.log(`  pagefind fragments ${baseline.pagefindEntries ?? 'ABSENT'}`);
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
		const candidate = capture(candidateDir);
		const ledger = loadLedger(ledgerPath);
		const diffs = compare(baseline, candidate);

		if (explain) {
			console.log(`baseline ${baseline.pageCount} pages; candidate ${candidate.pageCount} pages`);
			console.log(`ledger ${ledger.length} approved exception(s) from ${ledgerPath}`);
		}

		const used = new Set<number>();
		const unapproved: Diff[] = [];
		for (const diff of diffs) {
			const hit = ledger.findIndex((e) => e.url === diff.url && e.field === diff.field);
			if (hit === -1) unapproved.push(diff);
			else used.add(hit);
		}

		const stale = ledger.filter((_, i) => !used.has(i));
		for (const diff of unapproved) {
			console.error(`DIFF ${diff.url} [${diff.field}] ${diff.detail}`);
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
	process.exit(main(process.argv.slice(2)));
}
