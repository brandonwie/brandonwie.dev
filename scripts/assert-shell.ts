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

/**
 * Comments are removed HERE, before any structural extraction, and that
 * placement is the whole point. An earlier revision stripped them only inside
 * `normalizeText`, so `region()` matched raw HTML: a header commented out
 * entirely still counted as present, and the suite returned 6 pass / 0 fail on
 * a page with no chrome at all. SC-11 and SC-12 execute that counterexample.
 *
 * Stripping globally does not weaken SC-10, the adjacent-text comment
 * invariance row: React's `<!-- -->` separators still must not change any
 * result, and now they cannot reach a comparison at all.
 */
function readRoute(dir: string, route: string): string | null {
	const base = route === '/' ? 'index' : route.replace(/^\//, '');
	for (const candidate of [`${base}.html`, join(base, 'index.html')]) {
		const file = resolve(dir, candidate);
		if (existsSync(file) && statSync(file).isFile()) {
			return readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
		}
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
	// Both sides are checked, and the classification is asserted before any
	// content is compared. An earlier revision asserted only the candidate and
	// let every row `continue` past a baseline it could not extract, so deleting
	// the baseline's header made the comparison silently vanish and a retargeted
	// candidate nav link still passed. Missing comparison data is a failure,
	// never a skip: SC-13 and SC-14 execute that counterexample.
	//
	// Not every baseline route carries chrome -- the SvelteKit 404 is a
	// standalone error document with no header or footer. Those routes are
	// classified, not skipped: the candidate must agree about whether a route
	// has chrome, and only chrome-bearing routes go on to the content rows. A
	// route the baseline dresses and the candidate does not (or the reverse) is
	// a finding, which is exactly how the candidate's dressed /404 surfaced.
	const hasChrome = (dir: string, route: string): boolean => {
		const html = readRoute(dir, route) ?? '';
		return region(html, 'header', 'site-nav') !== null && navOf(html) !== null;
	};

	/**
	 * The SPA fallback is a different RENDERING STAGE, not a chrome regression.
	 *
	 * `svelte.config.js:70` sets `fallback: '404.html'`, so the baseline's
	 * `404.html` is a bootstrap shell: its body is script only, it calls
	 * `kit.start`, and `src/routes/+error.svelte:5-6` states the error page
	 * "Renders inside the root layout, so the SiteHeader + Footer chrome is
	 * present" — after client startup. The Next candidate prerenders its 404
	 * instead, chrome included.
	 *
	 * An earlier revision compared the two statically and reported "baseline has
	 * no chrome, candidate has chrome" as a defect. That was comparing a
	 * pre-hydration shell against a rendered page. The row below RECOGNIZES the
	 * fallback from evidence rather than hardcoding `/404` as an exclusion: it
	 * must boot the app AND carry no static chrome. A fallback that stops
	 * booting, or a baseline route that merely lost its chrome, fails
	 * recognition and falls back into the strict comparison — so this cannot
	 * become a hole. SC-15 executes that.
	 *
	 * NOT VERIFIED HERE: that the baseline's chrome actually appears after
	 * startup in a browser. The static evidence establishes the mechanism; the
	 * rendered-stage check is owed and is recorded as owed.
	 */
	const isBootstrapFallback = (dir: string, route: string): boolean => {
		const html = readRoute(dir, route) ?? '';
		const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
		const boots = /kit\.start\s*\(/.test(html);
		const visible = body
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<[^>]+>/g, '')
			.trim();
		return boots && visible.length === 0 && region(html, 'header', 'site-nav') === null;
	};

	const asymmetric: string[] = [];
	const chromeRoutes: string[] = [];
	const fallbacks: string[] = [];
	for (const route of shared) {
		if (isBootstrapFallback(baselineDir, route)) {
			fallbacks.push(route);
			continue;
		}
		const cand = hasChrome(candidateDir, route);
		const base = hasChrome(baselineDir, route);
		if (cand !== base) {
			asymmetric.push(
				`${route}: baseline ${base ? 'has' : 'has no'} chrome, candidate ${cand ? 'has' : 'has no'} chrome`,
			);
		} else if (base) chromeRoutes.push(route);
	}
	if (asymmetric.length > 0) {
		record('FAIL', 'SH-01 chrome routes', asymmetric.join('; '));
	} else {
		record(
			'PASS',
			'SH-01 chrome routes',
			`${chromeRoutes.length} chrome-bearing route(s), both sides agreeing on every classification` +
				(fallbacks.length > 0
					? `; ${fallbacks.length} client-rendered fallback(s) recognized and compared at their own stage: ${fallbacks.join(', ')} (rendered-stage check OWED, not run here)`
					: ''),
		);
	}

	// Containers, on the routes both sides dress.
	const missing: string[] = [];
	for (const route of chromeRoutes) {
		for (const [side, dir] of [
			['candidate', candidateDir],
			['baseline', baselineDir],
		] as const) {
			const html = readRoute(dir, route) ?? '';
			if (region(html, 'footer', 'site-footer') === null) missing.push(`${route}: ${side} footer`);
		}
	}
	if (missing.length > 0) {
		record('FAIL', 'SH-02 containers', missing.join('; '));
		report();
		return 1;
	}
	record(
		'PASS',
		'SH-02 containers',
		`footer present on both sides of ${chromeRoutes.length} route(s)`,
	);

	if (chromeRoutes.length === 0) {
		record('FAIL', 'SH-02 containers', 'no chrome-bearing route to compare');
		report();
		return 1;
	}

	const shared2 = chromeRoutes;
	assertNav(candidateDir, baselineDir, shared2);
	assertActive(candidateDir, baselineDir, shared2);
	assertFooter(candidateDir, baselineDir, shared2);
	assertSkipLink(candidateDir, shared2);

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
		if (!base || !cand) {
			problems.push(`${route}: nav missing on ${!cand ? 'candidate' : 'baseline'}`);
			continue;
		}
		const shape = (links: Link[]): string =>
			links.map((link) => `${link.href}=${link.text}`).join(' | ');
		if (shape(cand) !== shape(base)) {
			problems.push(`${route}: nav is ${shape(cand)}, baseline is ${shape(base)}`);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-03 nav links', problems.join('; '));
	else
		record(
			'PASS',
			'SH-03 nav links',
			`href, label and order match the baseline inside the header nav on ${routes.length} route(s)`,
		);
}

function assertActive(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const cand = navOf(readRoute(candidateDir, route) ?? '');
		const base = navOf(readRoute(baselineDir, route) ?? '');
		if (!base || !cand) {
			problems.push(`${route}: nav missing on ${!cand ? 'candidate' : 'baseline'}`);
			continue;
		}
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
	if (problems.length > 0) record('FAIL', 'SH-04 active section', problems.join('; '));
	else
		record(
			'PASS',
			'SH-04 active section',
			`is-active and aria-current are bound to the same nav item as the baseline, per route`,
		);
}

function assertFooter(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const candFooter = region(readRoute(candidateDir, route) ?? '', 'footer', 'site-footer');
		const baseFooter = region(readRoute(baselineDir, route) ?? '', 'footer', 'site-footer');
		if (candFooter === null || baseFooter === null) {
			problems.push(
				`${route}: footer missing on ${candFooter === null ? 'candidate' : 'baseline'}`,
			);
			continue;
		}
		const shape = (html: string): string =>
			linksIn(html)
				.map((link) => `${link.href}=${link.text}`)
				.join(' | ');
		if (shape(candFooter) !== shape(baseFooter)) {
			problems.push(`${route}: footer links differ from the baseline`);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-05 footer links', problems.join('; '));
	else
		record(
			'PASS',
			'SH-05 footer links',
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
	if (problems.length > 0) record('FAIL', 'SH-06 skip link', problems.join('; '));
	else
		record(
			'PASS',
			'SH-06 skip link',
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
