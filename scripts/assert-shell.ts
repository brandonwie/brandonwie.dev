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
 * REDESIGN (Phosphor Fade terminal shell): the candidate's chrome no longer
 * mirrors the Svelte markup, so the rows compare chrome FUNCTIONS, not markup.
 * The baseline is still read through its own selectors (`header.site-nav`,
 * `footer.site-footer`); the candidate through `header.term-bar`, the tmux
 * status line `nav.term-status` and `footer.term-plan`. Destinations, the
 * current-page marker, footer links with their accessible labels and order,
 * and the skip link are still held to the baseline; nav labels and nav order
 * are not, because D3 renames them to tmux windows by design.
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

type Side = 'candidate' | 'baseline';

// REDESIGN: containers are side-aware. The baseline keeps the Svelte chrome;
// the candidate is the Phosphor Fade terminal shell (next/src/shell/*.tsx).
const HEADER: Record<Side, string> = { baseline: 'site-nav', candidate: 'term-bar' };
const FOOTER: Record<Side, string> = { baseline: 'site-footer', candidate: 'term-plan' };

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

/**
 * The suite, callable in process.
 *
 * Reads both export directories without modifying them. Returns 0 on success,
 * 1 for failed assertions, or 2 for a missing export. `quiet` suppresses row
 * reports. The CLI takes candidate/baseline paths in argv[2]/argv[3], defaulting
 * to `next/build` and `build` respectively.
 *
 * `assert-shell-controls.ts` imports this rather than spawning the script,
 * exactly as every sibling controls suite does. That is a CHANGE-SELECTOR
 * requirement, not a style preference: `migration-route.ts` derives a suite's
 * input set from its entry's transitive imports, and a `spawnSync` edge is
 * invisible to that closure. While the controls spawned this file, editing it
 * selected `migration:shell` but NOT `migration:shell:controls`, so the
 * negative controls did not rerun on the very change they exist to police.
 *
 * Module state is reset on entry because callers run it many times per process.
 */
export function runAssertions(candidateDir: string, baselineDir: string, quiet = false): number {
	rows.length = 0;
	failures = 0;

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
		report(quiet);
		return 1;
	}

	const shared = candidateRoutes.filter((route) => readRoute(baselineDir, route) !== null);
	if (shared.length === 0) {
		record(
			'FAIL',
			'SH-00 route set',
			'no candidate route exists in the baseline to compare against',
		);
		report(quiet);
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
	// REDESIGN: the candidate's chrome is the terminal shell (title bar + tmux
	// status line), so "has chrome" is read through each side's own selectors.
	const hasChrome = (side: Side, dir: string, route: string): boolean => {
		const html = readRoute(dir, route) ?? '';
		return region(html, 'header', HEADER[side]) !== null && navOf(side, html) !== null;
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
	 * NOT VERIFIED HERE, and deliberately so: that the baseline's chrome actually
	 * appears after startup in a browser. This suite reads exported bytes, which
	 * cannot observe a rendering stage. The rendered-stage check was run
	 * separately over the DevTools Protocol and confirmed it -- along with a
	 * locale divergence the bytes could not show. It is recorded in
	 * `verification/contracts/shell-suite-review-findings.md` in the 3B lane.
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
		const cand = hasChrome('candidate', candidateDir, route);
		const base = hasChrome('baseline', baselineDir, route);
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
					? `; ${fallbacks.length} client-rendered fallback(s) recognized and compared at their own stage: ${fallbacks.join(', ')} (rendered stage verified separately, not by this suite)`
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
			// REDESIGN: the candidate footer is `footer.term-plan`; the baseline keeps `footer.site-footer`.
			if (region(html, 'footer', FOOTER[side]) === null) missing.push(`${route}: ${side} footer`);
		}
	}
	if (missing.length > 0) {
		record('FAIL', 'SH-02 containers', missing.join('; '));
		report(quiet);
		return 1;
	}
	record(
		'PASS',
		'SH-02 containers',
		`footer present on both sides of ${chromeRoutes.length} route(s)`,
	);

	if (chromeRoutes.length === 0) {
		record('FAIL', 'SH-02 containers', 'no chrome-bearing route to compare');
		report(quiet);
		return 1;
	}

	const shared2 = chromeRoutes;
	assertNav(candidateDir, baselineDir, shared2);
	assertActive(candidateDir, baselineDir, shared2);
	assertFooter(candidateDir, baselineDir, shared2);
	assertSkipLink(candidateDir, shared2);

	report(quiet);
	return failures > 0 ? 1 : 0;
}

/**
 * The primary nav on each side. The baseline keeps the Svelte header nav
 * (`header.site-nav` > `nav.site-nav__links` > `a.site-nav__link`).
 *
 * REDESIGN: the candidate's primary nav is the tmux status line
 * `nav.term-status`, which sits at the bottom of the enclosure, outside the
 * title bar -- so it is read from the document, not from inside the header.
 * Every anchor in it is a window; the session and clock spans carry no links.
 */
function navOf(side: Side, html: string): Link[] | null {
	if (side === 'baseline') {
		const header = region(html, 'header', HEADER.baseline);
		if (header === null) return null;
		const nav = region(header, 'nav', 'site-nav__links');
		if (nav === null) return null;
		return linksIn(nav).filter((link) => link.classes.split(' ').includes('site-nav__link'));
	}
	const nav = region(html, 'nav', 'term-status');
	return nav === null ? null : linksIn(nav);
}

/** `/ko` for Korean routes, `/` otherwise: the home window's href. */
function localeHome(route: string): string {
	return route === '/ko' || route.startsWith('/ko/') ? '/ko' : '/';
}

interface StatusWindow extends Link {
	index: number;
}

/**
 * The candidate's status-line windows, split into the fixed set and the
 * temporary off-nav window. The split is DERIVED FROM THE BASELINE: the fixed
 * set is the baseline's nav plus the home window, so the temporary window's
 * index is the baseline nav length + 1. A window whose name has no `n:` index,
 * or whose index fits neither slot, is reported, never silently classified.
 */
function windowsOf(
	cand: Link[],
	base: Link[],
): { fixed: StatusWindow[]; temporary: StatusWindow[]; problems: string[] } {
	const fixedCount = base.length + 1;
	const fixed: StatusWindow[] = [];
	const temporary: StatusWindow[] = [];
	const problems: string[] = [];
	for (const link of cand) {
		const index = /^(\d+):/.exec(link.text);
		if (!index) {
			problems.push(`window "${link.text}" (${link.href}) has no n: index`);
			continue;
		}
		// Same object, so callers can compare a marked link to a window by identity.
		const win: StatusWindow = Object.assign(link, { index: Number(index[1]) });
		if (win.index < fixedCount) fixed.push(win);
		else if (win.index === fixedCount) temporary.push(win);
		else problems.push(`window "${link.text}" has index ${win.index}, beyond ${fixedCount}`);
	}
	return { fixed, temporary, problems };
}

function assertNav(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const cand = navOf('candidate', readRoute(candidateDir, route) ?? '');
		const base = navOf('baseline', readRoute(baselineDir, route) ?? '');
		if (!base || !cand) {
			problems.push(`${route}: nav missing on ${!cand ? 'candidate' : 'baseline'}`);
			continue;
		}
		// REDESIGN: labels and order are no longer compared -- D3 replaces
		// `~/Label` with fixed tmux window names in tmux order. What must survive
		// is the set of destinations: the baseline nav plus the locale home.
		const { fixed, temporary, problems: shape } = windowsOf(cand, base);
		problems.push(...shape.map((problem) => `${route}: ${problem}`));
		const indices = fixed.map((win) => win.index).join(',');
		const expectedIndices = Array.from({ length: base.length + 1 }, (_, i) => i).join(',');
		if (indices !== expectedIndices) {
			problems.push(`${route}: fixed window indices are ${indices}, expected ${expectedIndices}`);
		}
		if (temporary.length > 1) problems.push(`${route}: ${temporary.length} temporary windows`);
		if (temporary.length === 1 && cand[cand.length - 1] !== temporary[0]) {
			problems.push(`${route}: the temporary window is not the last window`);
		}
		const got = fixed.map((win) => win.href).sort();
		const want = [...base.map((link) => link.href), localeHome(route)].sort();
		if (got.join(' | ') !== want.join(' | ')) {
			problems.push(
				`${route}: fixed windows link to ${got.join(', ')}; expected ${want.join(', ')}`,
			);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-03 nav links', problems.join('; '));
	else
		record(
			'PASS',
			'SH-03 nav links',
			`fixed status-line windows link to exactly the baseline nav hrefs plus the locale home on ${routes.length} route(s)`,
		);
}

function assertActive(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	const isOn = (link: Link): boolean => link.classes.split(' ').includes('is-on');
	for (const route of routes) {
		const cand = navOf('candidate', readRoute(candidateDir, route) ?? '');
		const base = navOf('baseline', readRoute(baselineDir, route) ?? '');
		if (!base || !cand) {
			problems.push(`${route}: nav missing on ${!cand ? 'candidate' : 'baseline'}`);
			continue;
		}
		const baseActive = base.filter(
			(link) => link.classes.split(' ').includes('is-active') || link.current !== null,
		);
		// REDESIGN: the candidate marks the current window with `is-on` (was
		// `is-active`); both it and aria-current must sit on the same window.
		const marked = cand.filter((link) => isOn(link) || link.current !== null);
		const split = marked.filter((link) => !isOn(link) || link.current !== 'page');
		if (split.length > 0) {
			problems.push(
				`${route}: ${split.map((link) => link.href).join(', ')} carries only one of is-on / aria-current="page"`,
			);
			continue;
		}
		const { temporary } = windowsOf(cand, base);
		const hrefs = marked.map((link) => link.href).join(', ') || 'nothing';
		if (baseActive.length > 1) {
			problems.push(`${route}: the baseline marks ${baseActive.length} nav items`);
		} else if (baseActive.length === 1) {
			// Where the baseline marks a section, the candidate marks that section.
			const want = baseActive[0].href;
			if (
				marked.length !== 1 ||
				marked[0].href !== want ||
				temporary.includes(marked[0] as StatusWindow)
			) {
				problems.push(`${route}: candidate marks ${hrefs}; baseline marks ${want}`);
			}
		} else {
			// REDESIGN: the baseline had no home link and no off-nav marker. The
			// candidate may mark only the home window on the locale home route, or
			// only a temporary window pointing at the route itself -- and a
			// temporary window, when present, must be the one marked.
			const home = localeHome(route);
			const ok =
				marked.length === 0
					? temporary.length === 0
					: marked.length === 1 &&
						((route === home &&
							marked[0].href === home &&
							!temporary.includes(marked[0] as StatusWindow)) ||
							(temporary.length === 1 &&
								marked[0] === temporary[0] &&
								temporary[0].href === route));
			if (!ok) {
				problems.push(
					`${route}: baseline marks nothing; candidate marks ${hrefs}` +
						(temporary.length > 0
							? ` with temporary window ${temporary.map((w) => w.href).join(', ')}`
							: ''),
				);
			}
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-04 active section', problems.join('; '));
	else
		record(
			'PASS',
			'SH-04 active section',
			`is-on and aria-current mark the baseline's active section, or only the home / temporary window where the baseline marks none, per route`,
		);
}

/**
 * Accessible text of a footer link.
 *
 * REDESIGN: the candidate prefixes each link with an `aria-hidden` `[n]` and
 * moves the external-link arrow into an `aria-hidden` span; the baseline emits
 * `GitHub ↗` as plain text. Both sides drop aria-hidden elements and a trailing
 * `↗`, and nothing else, so a changed or missing label still fails.
 */
function accessibleText(html: string): string {
	return normalizeText(
		html.replace(/<(\w+)\b[^>]*\baria-hidden="true"[^>]*>[\s\S]*?<\/\1>/gi, ''),
	).replace(/\s*↗$/, '');
}

function assertFooter(candidateDir: string, baselineDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const candFooter = region(readRoute(candidateDir, route) ?? '', 'footer', FOOTER.candidate);
		const baseFooter = region(readRoute(baselineDir, route) ?? '', 'footer', FOOTER.baseline);
		if (candFooter === null || baseFooter === null) {
			problems.push(
				`${route}: footer missing on ${candFooter === null ? 'candidate' : 'baseline'}`,
			);
			continue;
		}
		const shape = (html: string): string =>
			Array.from(html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi))
				.map((match) => {
					const tag = /<a\b[^>]*>/i.exec(match[0])?.[0] ?? '';
					return `${attrOf(tag, 'href') ?? ''}=${accessibleText(match[1])}`;
				})
				.join(' | ');
		if (shape(candFooter) !== shape(baseFooter)) {
			problems.push(
				`${route}: footer links are ${shape(candFooter)}, baseline is ${shape(baseFooter)}`,
			);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-05 footer links', problems.join('; '));
	else
		record(
			'PASS',
			'SH-05 footer links',
			`href, accessible label and order match the baseline inside the footer on ${routes.length} route(s)`,
		);
}

/**
 * SH-06 is scoped to the markup BEFORE the header, not to the whole document.
 *
 * `next/src/shell/site-shell.tsx` places the skip link ahead of the title bar,
 * which is the only position where it does its job: a link that FOLLOWS the
 * chrome cannot skip the chrome. An earlier revision searched every link in the
 * document, so relocating the skip link below the header -- the exact
 * regression this row exists to catch -- left the row green as long as some
 * `.skip-link` anchor survived anywhere on the page. SC-16 executes that
 * counterexample.
 */
function assertSkipLink(candidateDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const html = readRoute(candidateDir, route) ?? '';
		// REDESIGN: the header the skip link must precede is `header.term-bar`.
		const headerAt = new RegExp(
			`<header\\b[^>]*class="[^"]*\\b${HEADER.candidate}\\b[^"]*"[^>]*>`,
			'i',
		).exec(html);
		if (!headerAt) {
			problems.push(`${route}: no header to place a skip link before`);
			continue;
		}
		const skip = linksIn(html.slice(0, headerAt.index)).find((link) =>
			link.classes.split(' ').includes('skip-link'),
		);
		if (!skip) problems.push(`${route}: no skip link before the header`);
		else if (skip.href !== '#main-content') problems.push(`${route}: skip link href ${skip.href}`);
		else if (!/<main\b[^>]*id="main-content"/i.test(html))
			problems.push(`${route}: skip target missing`);
	}
	if (problems.length > 0) record('FAIL', 'SH-06 skip link', problems.join('; '));
	else
		record(
			'PASS',
			'SH-06 skip link',
			`skip link precedes the title bar and its target is present on ${routes.length} route(s)`,
		);
}

function report(quiet: boolean): void {
	if (quiet) return;
	for (const row of rows)
		console.log(`  ${row.status.padEnd(6)} ${row.id.padEnd(22)} ${row.detail}`);
	console.log(`\nRESULT: ${rows.filter((r) => r.status === 'PASS').length} pass, ${failures} fail`);
	console.log(
		'Exit 0 means no chrome regression on the routes the candidate builds today, not full coverage.',
	);
}

// Guarded so importing this module does not exit the importer's process --
// `assert-shell-controls.ts` calls `runAssertions` many times in one run.
if (process.argv[1]?.endsWith('assert-shell.ts')) {
	process.exit(runAssertions(process.argv[2] ?? 'next/build', process.argv[3] ?? 'build'));
}
