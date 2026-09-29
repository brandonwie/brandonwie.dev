/**
 * migration:shell — the global chrome's assertion table, executed.
 *
 *   pnpm migration:shell               # reads next/build
 *   pnpm migration:shell <candidate>
 *
 * WHY THIS IS NOT PART OF migration:c13. C13 reads both sides through
 * `migration-verify.ts`'s `capture()`, whose `shell` map holds only
 * `meta:<name>` (migration-verify.ts:273), `link:<rel>:<href>` (:280) and
 * `body:preload-data` (:284). No header, footer, nav or landmark structure can
 * enter that map, so C13 physically cannot see the chrome: removing a page's
 * entire header leaves its `shell` byte-identical. This suite therefore reads
 * the exported HTML directly, and C13 keeps its document-level rows unchanged.
 *
 * SVELTE RETIREMENT (2026-09-29). This suite used to extract the header and
 * footer from the live SvelteKit export (`build/`) and hold the Next chrome to
 * it route by route. That export no longer exists. Every expectation the
 * baseline supplied was a content-independent constant of the Svelte chrome --
 * the nav destinations, the active-section rule, the footer's links, labels and
 * order, and "the root layout dresses every route" -- so those constants are
 * frozen below as literals, each citing its origin file:line at commit 770bc30.
 * They pin the chrome production serves today; no rendered Svelte HTML is kept.
 *
 * Structural, not byte-identical:
 *   - Svelte-style scoped-class tokens (`svelte-a8kxe2`) are stripped before
 *     class lists are read, so a stray scoped token cannot move a row (SC-09).
 *   - React separates adjacent text nodes with `<!-- -->`, so `~/글` is emitted
 *     as `~/<!-- -->글`. Comments are stripped and whitespace collapsed before
 *     text is compared. This is exactly why a page-wide string match for a nav
 *     label would fail, and why every assertion below is scoped to its own
 *     container.
 *
 * The chrome is the Phosphor Fade terminal shell: `header.term-bar`, the tmux
 * status line `div.term-status` and `footer.term-plan`. Destinations, the
 * current-page marker, footer links with their accessible labels and order,
 * and the skip link are asserted; nav labels and nav order are not, because D3
 * renames them to tmux windows by design.
 *
 * Exit 0 = no chrome regression on the routes the candidate builds today.
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

/** Strip Svelte-style scoped tokens so a stray one cannot change a class list (SC-09). */
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

// The Phosphor Fade terminal shell's containers (next/src/shell/*.tsx).
const HEADER = 'term-bar';
const FOOTER = 'term-plan';

/**
 * FROZEN SVELTE CHROME CONSTANTS (origin: commit 770bc30).
 *
 * These were read from the live `build/` on every run until the Svelte app was
 * retired. None depends on post content, so freezing them keeps the exact pin
 * the baseline provided without keeping any rendered Svelte HTML.
 */

/**
 * Primary nav destinations, locale prefix excluded, in bar order.
 * Origin: src/lib/data/nav.ts:29-34 (`NAV_ITEMS`), rendered by
 * src/lib/components/SiteHeader.svelte:43-52 via `hrefFor` (nav.ts:77-79).
 */
const NAV_PATHS = ['/about', '/posts', '/study', '/system/3b'] as const;

/** Origin: nav.ts:37 (`KO_PREFIX`) and nav.ts:45-47 (`base`). */
function localePrefix(route: string): '' | '/ko' {
	return /^\/ko(?:\/|$)/.test(route) ? '/ko' : '';
}

/** The nav hrefs the Svelte header emitted on `route`. */
function expectedNav(route: string): string[] {
	return NAV_PATHS.map((path) => `${localePrefix(route)}${path}`);
}

/**
 * The nav href the Svelte header marked current on `route`, or null.
 * Origin: nav.ts:102-109 (`activeKey`, locale-stripped via `stripLocale`
 * nav.ts:50-52), marked by SiteHeader.svelte:47-48.
 */
function expectedActive(route: string): string | null {
	const path = route.replace(/^\/ko(?:\/|$)/, '/') || '/';
	const prefix = localePrefix(route);
	if (/^\/posts(?:\/|$)/.test(path)) return `${prefix}/posts`;
	if (/^\/study(?:\/|$)/.test(path)) return `${prefix}/study`;
	if (/^\/system(?:\/|$)/.test(path)) return `${prefix}/system/3b`;
	if (/^\/about(?:\/|$)/.test(path)) return `${prefix}/about`;
	return null;
}

/**
 * Footer links as `href=accessible label`, in document order, per locale.
 * Origin: src/lib/components/Footer.svelte:44-63 (hrefs from nav.ts and
 * `base(locale)`; labels from messages/{en,ko}.json `nav_*` keys; GitHub and
 * LinkedIn literal, their trailing `↗` dropped by `accessibleText`).
 */
const FOOTER_SHAPE: Record<'en' | 'ko', string> = {
	en: [
		'/about=About',
		'/posts=Posts',
		'/study=Study',
		'/system/3b=3B',
		'/projects=Projects',
		'/tags=Tags',
		'/contact=Contact',
		'https://github.com/brandonwie=GitHub',
		'https://linkedin.com/in/brandonwie=LinkedIn',
	].join(' | '),
	ko: [
		'/ko/about=소개',
		'/ko/posts=글',
		'/ko/study=스터디',
		'/ko/system/3b=3B',
		'/ko/projects=프로젝트',
		'/ko/tags=태그',
		'/ko/contact=연락',
		'https://github.com/brandonwie=GitHub',
		'https://linkedin.com/in/brandonwie=LinkedIn',
	].join(' | '),
};

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
 * Reads the candidate export directory without modifying it. Returns 0 on
 * success, 1 for failed assertions, or 2 for a missing export. `quiet`
 * suppresses row reports. The CLI takes the candidate path in argv[2],
 * defaulting to `next/build`.
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
export function runAssertions(candidateDir: string, quiet = false): number {
	rows.length = 0;
	failures = 0;

	if (!existsSync(candidateDir)) {
		console.error(`missing candidate export: ${candidateDir}`);
		return 2;
	}

	const routes = routesOf(candidateDir).filter(
		(route) => !route.startsWith('/migration-fixture') && route !== '/_not-found',
	);

	// Guard 1: an empty route set would let every row below pass over zero
	// pages. Assert the set BEFORE iterating it — a suite that can pass
	// vacuously is not a suite.
	if (routes.length === 0) {
		record('FAIL', 'SH-00 route set', 'the candidate exported no routes');
		report(quiet);
		return 1;
	}
	record('PASS', 'SH-00 route set', `${routes.length} exported route(s)`);

	// Guard 2: the chrome must exist on every route before any row inspects its
	// contents. Without this, a missing header would surface as "0 nav links"
	// rather than as the regression it is. Missing chrome is a failure, never a
	// skip.
	//
	// Frozen oracle: the Svelte root layout dressed every prerendered route
	// (src/routes/+layout.svelte:198,200 at 770bc30 renders SiteHeader and Footer
	// around every page); the only undressed baseline document was the SPA
	// bootstrap fallback (`svelte.config.js:73`, `fallback: '404.html'`), which
	// showed the same chrome after client start. The candidate prerenders every
	// route, its 404 included, so every route must carry the chrome.
	const hasChrome = (html: string): boolean =>
		region(html, 'header', HEADER) !== null && navOf(html) !== null;
	const undressed = routes.filter((route) => !hasChrome(readRoute(candidateDir, route) ?? ''));
	if (undressed.length > 0) {
		record('FAIL', 'SH-01 chrome routes', `no title bar or status line on ${undressed.join(', ')}`);
		report(quiet);
		return 1;
	}
	record(
		'PASS',
		'SH-01 chrome routes',
		`title bar and status line present on all ${routes.length} route(s)`,
	);

	const missing = routes.filter(
		(route) => region(readRoute(candidateDir, route) ?? '', 'footer', FOOTER) === null,
	);
	if (missing.length > 0) {
		record('FAIL', 'SH-02 containers', `footer missing on ${missing.join(', ')}`);
		report(quiet);
		return 1;
	}
	record('PASS', 'SH-02 containers', `footer present on ${routes.length} route(s)`);

	assertNav(candidateDir, routes);
	assertActive(candidateDir, routes);
	assertFooter(candidateDir, routes);
	assertSkipLink(candidateDir, routes);

	report(quiet);
	return failures > 0 ? 1 : 0;
}

/**
 * The primary nav: the tmux status line `div.term-status`, which sits at the
 * bottom of the enclosure, outside the title bar -- so it is read from the
 * document, not from inside the header. Every anchor in it is a window; the
 * session and clock spans carry no links.
 */
function navOf(html: string): Link[] | null {
	// Reviewer round 3: the status-line scroller must not be a navigation
	// landmark, so it is a <div> (was <nav role="none">).
	const nav = region(html, 'div', 'term-status');
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
 * temporary off-nav window. The fixed set is the frozen Svelte nav plus the
 * home window, so the temporary window's index is `NAV_PATHS.length + 1`. A
 * window whose name has no `n:` index, or whose index fits neither slot, is
 * reported, never silently classified.
 */
function windowsOf(cand: Link[]): {
	fixed: StatusWindow[];
	temporary: StatusWindow[];
	problems: string[];
} {
	const fixedCount = NAV_PATHS.length + 1;
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

function assertNav(candidateDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const cand = navOf(readRoute(candidateDir, route) ?? '');
		if (!cand) {
			problems.push(`${route}: status line missing`);
			continue;
		}
		// Labels and order are not compared -- D3 replaces `~/Label` with fixed
		// tmux window names in tmux order. What must survive is the set of
		// destinations: the frozen Svelte nav plus the locale home.
		const { fixed, temporary, problems: shape } = windowsOf(cand);
		problems.push(...shape.map((problem) => `${route}: ${problem}`));
		const indices = fixed.map((win) => win.index).join(',');
		const expectedIndices = Array.from({ length: NAV_PATHS.length + 1 }, (_, i) => i).join(',');
		if (indices !== expectedIndices) {
			problems.push(`${route}: fixed window indices are ${indices}, expected ${expectedIndices}`);
		}
		if (temporary.length > 1) problems.push(`${route}: ${temporary.length} temporary windows`);
		if (temporary.length === 1 && cand[cand.length - 1] !== temporary[0]) {
			problems.push(`${route}: the temporary window is not the last window`);
		}
		const got = fixed.map((win) => win.href).sort();
		const want = [...expectedNav(route), localeHome(route)].sort();
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
			`fixed status-line windows link to exactly the frozen nav hrefs plus the locale home on ${routes.length} route(s)`,
		);
}

function assertActive(candidateDir: string, routes: string[]): void {
	const problems: string[] = [];
	const isOn = (link: Link): boolean => link.classes.split(' ').includes('is-on');
	for (const route of routes) {
		const cand = navOf(readRoute(candidateDir, route) ?? '');
		if (!cand) {
			problems.push(`${route}: status line missing`);
			continue;
		}
		// The candidate marks the current window with `is-on`; both it and
		// aria-current must sit on the same window.
		const marked = cand.filter((link) => isOn(link) || link.current !== null);
		const split = marked.filter((link) => !isOn(link) || link.current !== 'page');
		if (split.length > 0) {
			problems.push(
				`${route}: ${split.map((link) => link.href).join(', ')} carries only one of is-on / aria-current="page"`,
			);
			continue;
		}
		const { temporary } = windowsOf(cand);
		const hrefs = marked.map((link) => link.href).join(', ') || 'nothing';
		const want = expectedActive(route);
		if (want !== null) {
			// Where the frozen Svelte rule marks a section, the candidate marks that section.
			if (
				marked.length !== 1 ||
				marked[0].href !== want ||
				temporary.includes(marked[0] as StatusWindow)
			) {
				problems.push(`${route}: candidate marks ${hrefs}; expected ${want}`);
			}
		} else {
			// The Svelte nav had no home link and no off-nav marker. The candidate
			// may mark only the home window on the locale home route, or only a
			// temporary window pointing at the route itself -- and a temporary
			// window, when present, must be the one marked.
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
					`${route}: no section is active; candidate marks ${hrefs}` +
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
			`is-on and aria-current mark the frozen active section, or only the home / temporary window where none is active, per route`,
		);
}

/**
 * Accessible text of a footer link.
 *
 * The candidate prefixes each link with an `aria-hidden` `[n]` and moves the
 * external-link arrow into an `aria-hidden` span. aria-hidden elements and a
 * trailing `↗` are dropped, and nothing else, so a changed or missing label
 * still fails.
 */
function accessibleText(html: string): string {
	return normalizeText(
		html.replace(/<(\w+)\b[^>]*\baria-hidden="true"[^>]*>[\s\S]*?<\/\1>/gi, ''),
	).replace(/\s*↗$/, '');
}

function assertFooter(candidateDir: string, routes: string[]): void {
	const problems: string[] = [];
	for (const route of routes) {
		const candFooter = region(readRoute(candidateDir, route) ?? '', 'footer', FOOTER);
		if (candFooter === null) {
			problems.push(`${route}: footer missing`);
			continue;
		}
		const shape = Array.from(candFooter.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi))
			.map((match) => {
				const tag = /<a\b[^>]*>/i.exec(match[0])?.[0] ?? '';
				return `${attrOf(tag, 'href') ?? ''}=${accessibleText(match[1])}`;
			})
			.join(' | ');
		const want = FOOTER_SHAPE[localePrefix(route) === '/ko' ? 'ko' : 'en'];
		if (shape !== want) {
			problems.push(`${route}: footer links are ${shape}, expected ${want}`);
		}
	}
	if (problems.length > 0) record('FAIL', 'SH-05 footer links', problems.join('; '));
	else
		record(
			'PASS',
			'SH-05 footer links',
			`href, accessible label and order match the frozen footer inside the footer on ${routes.length} route(s)`,
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
		const headerAt = new RegExp(`<header\\b[^>]*class="[^"]*\\b${HEADER}\\b[^"]*"[^>]*>`, 'i').exec(
			html,
		);
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
	process.exit(runAssertions(process.argv[2] ?? 'next/build'));
}
