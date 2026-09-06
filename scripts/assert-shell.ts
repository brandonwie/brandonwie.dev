/**
 * migration:shell — the global chrome's assertion table, executed.
 *
 *   pnpm migration:shell                        # next/build against build/
 *   pnpm migration:shell <candidate> <baseline>
 *
 * WHY THIS IS NOT PART OF migration:c13. C13 reads both sides through
 * `migration-verify.ts`'s `capture()`, whose `shell` map holds only
 * `meta:<name>` (migration-verify.ts:273), `link:<rel>:<href>` (:280) and
 * `body:preload-data` (:284). No header, footer, nav or landmark structure can
 * enter that map, so C13 physically cannot see the chrome: removing a page's
 * entire header leaves its `shell` byte-identical. This suite therefore reads
 * the exported HTML directly, and C13 keeps its document-level rows unchanged.
 *
 * EXPECTATIONS COME FROM THE BASELINE, not from this file. For every route the
 * candidate exports that the baseline also has, the header and footer are
 * extracted from BOTH and compared structurally. A value this script gets wrong
 * cannot silently become the standard.
 *
 * Structural, not byte-identical, and the two differences are principled:
 *   - Svelte emits scoped-style classes (`svelte-a8kxe2`); React does not.
 *     Those tokens are stripped before comparing.
 *   - React separates adjacent text nodes with `<!-- -->`, so `~/글` is emitted
 *     as `~/<!-- -->글`. Comments are stripped and whitespace collapsed before
 *     text is compared. This is exactly why a page-wide string match for a nav
 *     label would fail, and why every assertion below is scoped to its own
 *     container.
 *
 * Exit 0 = no chrome regression on the routes the candidate builds today. It
 * never means the chrome is discharged over all 366 routes; the row table
 * prints its coverage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

type Status = 'PASS' | 'FAIL';

let failures = 0;
const rows: { status: Status; id: string; detail: string }[] = [];

function record(status: Status, id: string, detail: string): void {
	rows.push({ status, id, detail });
	if (status === 'FAIL') failures += 1;
}

/** Strip Svelte scoped-style tokens so both stacks' class lists are comparable. */
function normalizeClasses(value: string): string {
	return value
		.split(/\s+/)
		.filter((token) => token && !/^svelte-[a-z0-9]+$/i.test(token))
		.join(' ');
}

/** Comments removed, entities left alone, whitespace collapsed. */
function normalizeText(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function attrOf(tag: string, name: string): string | null {
	const match = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag);
	return match ? match[1] : null;
}

/** The inner HTML of the first element with the given tag name and class token. */
function region(html: string, tagName: string, classToken: string): string | null {
	const open = new RegExp(`<${tagName}\\b[^>]*class="[^"]*\\b${classToken}\\b[^"]*"[^>]*>`, 'i');
	const match = open.exec(html);
	if (!match) return null;
	const start = match.index + match[0].length;
	const close = `</${tagName}>`;
	let depth = 1;
	let cursor = start;
	const opener = new RegExp(`<${tagName}\\b`, 'gi');
	while (depth > 0) {
		opener.lastIndex = cursor;
		const nextOpen = opener.exec(html);
		const nextClose = html.indexOf(close, cursor);
		if (nextClose === -1) return null;
		if (nextOpen && nextOpen.index < nextClose) {
			depth += 1;
			cursor = nextOpen.index + nextOpen[0].length;
		} else {
			depth -= 1;
			cursor = nextClose + close.length;
		}
	}
	return html.slice(start, cursor - close.length);
}

interface Link {
	href: string;
	text: string;
	classes: string;
	current: string | null;
}

function linksIn(html: string): Link[] {
	const out: Link[] = [];
	for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
		const tag = /<a\b[^>]*>/i.exec(match[0])?.[0] ?? '';
		out.push({
			href: attrOf(tag, 'href') ?? '',
			text: normalizeText(match[1]),
			classes: normalizeClasses(attrOf(tag, 'class') ?? ''),
			current: attrOf(tag, 'aria-current'),
		});
	}
	return out;
}

function routesOf(dir: string): string[] {
	const root = resolve(dir);
	const out: string[] = [];
	const walk = (current: string): void => {
		for (const entry of readdirSync(current)) {
			const full = join(current, entry);
			if (statSync(full).isDirectory()) {
				if (entry === '_next' || entry === 'pagefind' || entry.startsWith('.')) continue;
				walk(full);
			} else if (entry.endsWith('.html')) {
				const rel = relative(root, full).split(sep).join('/');
				out.push('/' + rel.replace(/(?:index)?\.html$/, '').replace(/\/$/, ''));
			}
		}
	};
	walk(root);
	return out.sort();
}

function readRoute(dir: string, route: string): string | null {
	const base = route === '/' ? 'index' : route.replace(/^\//, '');
	for (const candidate of [`${base}.html`, join(base, 'index.html')]) {
		const file = resolve(dir, candidate);
		if (existsSync(file) && statSync(file).isFile()) return readFileSync(file, 'utf8');
	}
	return null;
}

function main(): number {
	const candidateDir = process.argv[2] ?? 'next/build';
	const baselineDir = process.argv[3] ?? 'build';

	for (const [label, dir] of [
		['candidate', candidateDir],
		['baseline', baselineDir],
	] as const) {
		if (!existsSync(dir)) {
			console.error(`missing ${label} export: ${dir}`);
			return 2;
		}
	}

	const candidateRoutes = routesOf(candidateDir).filter(
		(route) => !route.startsWith('/migration-fixture') && route !== '/_not-found',
	);

	// Guard 1: a route set that is empty, or that shrank to nothing comparable,
	// would let every row below pass over zero pages. Assert the set BEFORE
	// iterating it — a suite that can pass vacuously is not a suite.
	if (candidateRoutes.length === 0) {
		record('FAIL', 'SH-00 route set', 'the candidate exported no comparable routes');
		report();
		return 1;
	}

	const shared = candidateRoutes.filter((route) => readRoute(baselineDir, route) !== null);
	if (shared.length === 0) {
		record(
			'FAIL',
			'SH-00 route set',
			'no candidate route exists in the baseline to compare against',
		);
		report();
		return 1;
	}
	record(
		'PASS',
		'SH-00 route set',
		`${shared.length} route(s) shared with the baseline: ${shared.join(', ')}`,
	);

	// Guard 2: both containers must exist on every shared route before any row
	// inspects their contents. Without this, a missing header would surface as
	// "0 nav links, 0 expected" rather than as the regression it is.
	const missing: string[] = [];
	for (const route of shared) {
		const html = readRoute(candidateDir, route) ?? '';
		if (region(html, 'header', 'site-nav') === null) missing.push(`${route}: header`);
		if (region(html, 'footer', 'site-footer') === null) missing.push(`${route}: footer`);
	}
	if (missing.length > 0) {
		record('FAIL', 'SH-01 containers', missing.join('; '));
		report();
		return 1;
	}
	record(
		'PASS',
		'SH-01 containers',
		`header and footer present on ${shared.length}/${shared.length} routes`,
	);

	assertNav(candidateDir, baselineDir, shared);
	assertActive(candidateDir, baselineDir, shared);
	assertFooter(candidateDir, baselineDir, shared);
	assertSkipLink(candidateDir, shared);

	report();
	return failures > 0 ? 1 : 0;
}

function navOf(html: string): Link[] | null {
	const header = region(html, 'header', 'site-nav');
	if (header === null) return null;
	const nav = region(header, 'nav', 'site-nav__links');
	if (nav === null) return null;
	return linksIn(nav).filter((link) => link.classes.split(' ').includes('site-nav__link'));
}

function assertNav(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const cand = navOf(readRoute(candidateDir, route) ?? '');
		const base = navOf(readRoute(baselineDir, route) ?? '');
		if (!base) continue;
		if (!cand) {
			problems.push(`${route}: candidate has no nav`);
			continue;
		}
		const shape = (links: Link[]): string =>
			links.map((link) => `${link.href}=${link.text}`).join(' | ');
		if (shape(cand) !== shape(base)) {
			problems.push(`${route}: nav is ${shape(cand)}, baseline is ${shape(base)}`);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-02 nav links', problems.join('; '));
	else
		record(
			'PASS',
			'SH-02 nav links',
			`href, label and order match the baseline inside the header nav on ${routes.length} route(s)`,
		);
}

function assertActive(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const cand = navOf(readRoute(candidateDir, route) ?? '');
		const base = navOf(readRoute(baselineDir, route) ?? '');
		if (!base || !cand) continue;
		const marks = (links: Link[]): string =>
			links
				.map(
					(link) =>
						`${link.href}:${link.classes.split(' ').includes('is-active') ? 'active' : '-'}:${link.current ?? '-'}`,
				)
				.join(' | ');
		if (marks(cand) !== marks(base)) {
			problems.push(`${route}: ${marks(cand)} vs baseline ${marks(base)}`);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-03 active section', problems.join('; '));
	else
		record(
			'PASS',
			'SH-03 active section',
			`is-active and aria-current are bound to the same nav item as the baseline, per route`,
		);
}

function assertFooter(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const candFooter = region(readRoute(candidateDir, route) ?? '', 'footer', 'site-footer');
		const baseFooter = region(readRoute(baselineDir, route) ?? '', 'footer', 'site-footer');
		if (candFooter === null || baseFooter === null) continue;
		const shape = (html: string): string =>
			linksIn(html)
				.map((link) => `${link.href}=${link.text}`)
				.join(' | ');
		if (shape(candFooter) !== shape(baseFooter)) {
			problems.push(`${route}: footer links differ from the baseline`);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-04 footer links', problems.join('; '));
	else
		record(
			'PASS',
			'SH-04 footer links',
			`href, label and order match the baseline inside the footer on ${routes.length} route(s)`,
		);
}

function assertSkipLink(candidateDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const html = readRoute(candidateDir, route) ?? '';
		const skip = linksIn(html).find((link) => link.classes.split(' ').includes('skip-link'));
		if (!skip) problems.push(`${route}: no skip link`);
		else if (skip.href !== '#main-content') problems.push(`${route}: skip link href ${skip.href}`);
		else if (!/<main\b[^>]*id="main-content"/i.test(html))
			problems.push(`${route}: skip target missing`);
	}
	if (problems.length > 0) record('FAIL', 'SH-05 skip link', problems.join('; '));
	else
		record(
			'PASS',
			'SH-05 skip link',
			`skip link and its target present on ${routes.length} route(s)`,
		);
}

function report(): void {
	for (const row of rows)
		console.log(`  ${row.status.padEnd(6)} ${row.id.padEnd(22)} ${row.detail}`);
	console.log(`\nRESULT: ${rows.filter((r) => r.status === 'PASS').length} pass, ${failures} fail`);
	console.log(
		'Exit 0 means no chrome regression on the routes the candidate builds today, not full coverage.',
	);
}

process.exit(main());
