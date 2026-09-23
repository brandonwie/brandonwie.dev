/**
 * migration:terminal — the Phosphor Fade shell's navigation contract.
 *
 *   pnpm migration:terminal              # pure rules + next/build
 *   pnpm migration:terminal <buildDir>
 *
 * Two layers, because each catches what the other cannot:
 *
 *  1. RULES. `cwdFor` (D2: the cwd is the real URL path) and `statusWindowFor`
 *     (D3: fixed windows 0-4, off-nav routes append `5:<name>*`) run against a
 *     table of routes, with no DOM and no build.
 *  2. EXPORT. The built HTML for a sample of routes in both locales: the title
 *     bar shows that cwd, the status line marks exactly that window with
 *     `aria-current="page"`, every fixed window links to its locale's route,
 *     and the error route marks nothing. A rule can be right while the shell
 *     that should call it is wired wrong; only the export shows that.
 *
 * HEADER NAV (user instruction 2026-09-23: all nav links in the header). The
 * title bar carries the primary navigation: all eight internal destinations in
 * `HEADER_LINKS` order with locale-aware hrefs, exactly one link marked
 * `is-on` + `aria-current="page"` on section routes and none on search, feed
 * and the 404, and it is the ONLY nav landmark named `primary_navigation` —
 * the status line is a plain element, not a `<nav>`, with no role and no
 * aria-label (REDESIGN: reviewer round 3: the status-line scroller must not be
 * a navigation landmark; `<nav role="none">` was exposed as an unnamed nav once
 * it overflowed at phone widths).
 *
 * POSITIVE CONTROLS run first. The rule table is replayed against deliberately
 * broken implementations (a cwd that drops `/ko`, a status map that never
 * appends the temporary window, a header map that forgets projects/tags/
 * contact); if the table accepts any, the table cannot catch the regression it
 * exists for and the suite fails. The header export check is replayed against
 * mutated copies of real exports (unmarked link, un-prefixed Korean hrefs, a
 * dropped link, a marked search page, the status line back as a `<nav>`, named,
 * or given a landmark role), each of which must fail.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { activeKey, stripLocale } from '../next/src/data/nav.ts';
import {
	HEADER_LINKS,
	STATUS_WINDOWS,
	cwdFor,
	headerHref,
	headerLinkFor,
	normalizePathname,
	statusWindowFor,
	windowHref,
	type HeaderLinkKey,
	type StatusState,
} from '../next/src/shell/terminal-path.ts';

type Status = 'PASS' | 'FAIL';
const rows: { status: Status; id: string; detail: string }[] = [];
function record(ok: boolean, id: string, detail: string): void {
	rows.push({ status: ok ? 'PASS' : 'FAIL', id, detail });
}

interface RouteCase {
	path: string;
	cwd: string;
	active: StatusState['active'];
	extra: string | null;
}

const CASES: readonly RouteCase[] = [
	{ path: '/', cwd: '~', active: 'home', extra: null },
	{ path: '/ko', cwd: '~/ko', active: 'home', extra: null },
	{ path: '/ko/', cwd: '~/ko', active: 'home', extra: null },
	{ path: '/posts', cwd: '~/posts', active: 'posts', extra: null },
	{ path: '/posts/some-slug', cwd: '~/posts/some-slug', active: 'posts', extra: null },
	{ path: '/ko/posts/some-slug', cwd: '~/ko/posts/some-slug', active: 'posts', extra: null },
	{ path: '/study/dsa-ii', cwd: '~/study/dsa-ii', active: 'study', extra: null },
	{ path: '/system', cwd: '~/system', active: 'system', extra: null },
	{ path: '/ko/system/3b', cwd: '~/ko/system/3b', active: 'system', extra: null },
	{ path: '/about', cwd: '~/about', active: 'about', extra: null },
	{ path: '/ko/projects', cwd: '~/ko/projects', active: null, extra: 'projects' },
	{ path: '/tags', cwd: '~/tags', active: null, extra: 'tags' },
	{ path: '/talks/my-career', cwd: '~/talks/my-career', active: null, extra: 'talks' },
	{ path: '/postscript', cwd: '~/postscript', active: null, extra: 'postscript' },
	{ path: '/koala', cwd: '~/koala', active: null, extra: 'koala' },
	{ path: '/%ED%83%9C%EA%B7%B8', cwd: '~/태그', active: null, extra: '태그' },
	{ path: '/%E0%A4%A', cwd: '~/%E0%A4%A', active: null, extra: '%E0%A4%A' },
];

/** Failures of the rule table against one implementation pair. */
function ruleFailures(
	cwd: (path: string) => string,
	status: (path: string) => StatusState,
): string[] {
	const failures: string[] = [];
	for (const c of CASES) {
		const gotCwd = cwd(c.path);
		if (gotCwd !== c.cwd) failures.push(`cwd ${c.path}: ${gotCwd} != ${c.cwd}`);
		const got = status(c.path);
		if (got.active !== c.active || got.extra !== c.extra) {
			failures.push(`status ${c.path}: ${JSON.stringify(got)}`);
		}
	}
	return failures;
}

// --- positive controls ---------------------------------------------------
const brokenCwd = (path: string) => cwdFor(path.replace(/^\/ko(?=\/|$)/, '') || '/');
const brokenStatus = (path: string): StatusState => ({ ...statusWindowFor(path), extra: null });
record(
	ruleFailures(brokenCwd, statusWindowFor).length > 0,
	'control:cwd-drops-ko',
	'rule table rejects a cwd that hides the /ko prefix',
);
record(
	ruleFailures(cwdFor, brokenStatus).length > 0,
	'control:no-temporary-window',
	'rule table rejects a status map without the 5:<name>* window',
);

// --- rules ---------------------------------------------------------------
const ruleErrors = ruleFailures(cwdFor, statusWindowFor);
record(ruleErrors.length === 0, 'rules:table', ruleErrors.join('; ') || `${CASES.length} routes`);
record(
	STATUS_WINDOWS.map((w) => `${w.index}:${w.label}`).join(' ') ===
		'0:home 1:posts 2:study 3:3b 4:about',
	'rules:window-order',
	'fixed windows are 0:home 1:posts 2:study 3:3b 4:about',
);
record(
	windowHref('home', 'ko') === '/ko' &&
		windowHref('system', 'en') === '/system/3b' &&
		windowHref('posts', 'ko') === '/ko/posts',
	'rules:window-hrefs',
	'window hrefs are locale-aware and 3:3b targets /system/3b',
);

// --- header nav rules ----------------------------------------------------
const HEADER_CASES: readonly { path: string; key: HeaderLinkKey | null }[] = [
	{ path: '/', key: 'home' },
	{ path: '/ko', key: 'home' },
	{ path: '/ko/', key: 'home' },
	{ path: '/posts/some-slug', key: 'posts' },
	{ path: '/ko/study/dsa-ii', key: 'study' },
	{ path: '/system', key: 'system' },
	{ path: '/ko/system/3b', key: 'system' },
	{ path: '/about', key: 'about' },
	{ path: '/projects', key: 'projects' },
	{ path: '/ko/tags/react', key: 'tags' },
	{ path: '/contact', key: 'contact' },
	{ path: '/search', key: null },
	{ path: '/ko/feed', key: null },
	{ path: '/talks/my-career', key: null },
	{ path: '/projectsx', key: null },
	{ path: '/koala', key: null },
];

function headerRuleFailures(mark: (path: string) => HeaderLinkKey | null): string[] {
	return HEADER_CASES.filter((c) => mark(c.path) !== c.key).map(
		(c) => `header ${c.path}: ${mark(c.path)} != ${c.key}`,
	);
}

// Positive control: a header map that only knows the status-line sections.
const brokenHeader = (path: string): HeaderLinkKey | null => {
	const p = stripLocale(normalizePathname(path));
	return p === '/' ? 'home' : activeKey(p);
};
record(
	headerRuleFailures(brokenHeader).length > 0,
	'control:header-no-extras',
	'header table rejects a map that never marks projects/tags/contact',
);
const headerErrors = headerRuleFailures(headerLinkFor);
record(
	headerErrors.length === 0,
	'rules:header-table',
	headerErrors.join('; ') || `${HEADER_CASES.length} routes`,
);
record(
	HEADER_LINKS.join(' ') === 'home posts study system about projects tags contact',
	'rules:header-order',
	'header links are home posts study 3b about projects tags contact',
);
record(
	HEADER_LINKS.map((k) => headerHref(k, 'ko')).join(' ') ===
		'/ko /ko/posts /ko/study /ko/system/3b /ko/about /ko/projects /ko/tags /ko/contact' &&
		HEADER_LINKS.map((k) => headerHref(k, 'en')).join(' ') ===
			'/ /posts /study /system/3b /about /projects /tags /contact',
	'rules:header-hrefs',
	'header hrefs are locale-aware',
);

// --- export --------------------------------------------------------------
const buildDir = resolve(process.argv[2] ?? 'next/build');

interface ExportCase {
	file: string;
	locale: 'en' | 'ko';
	cwd: string;
	/** Visible text of the marked window, or null for none. */
	marked: string | null;
	/** Header nav link marked current, or null for none. */
	header: HeaderLinkKey | null;
}

const EXPORTS: readonly ExportCase[] = [
	{ file: 'index.html', locale: 'en', cwd: '~', marked: '0:home', header: 'home' },
	{ file: 'ko.html', locale: 'ko', cwd: '~/ko', marked: '0:home', header: 'home' },
	{ file: 'posts.html', locale: 'en', cwd: '~/posts', marked: '1:posts', header: 'posts' },
	{ file: 'ko/posts.html', locale: 'ko', cwd: '~/ko/posts', marked: '1:posts', header: 'posts' },
	{
		file: 'study/dsa-i.html',
		locale: 'en',
		cwd: '~/study/dsa-i',
		marked: '2:study',
		header: 'study',
	},
	{ file: 'system.html', locale: 'en', cwd: '~/system', marked: '3:3b', header: 'system' },
	{
		file: 'ko/system/3b.html',
		locale: 'ko',
		cwd: '~/ko/system/3b',
		marked: '3:3b',
		header: 'system',
	},
	{ file: 'about.html', locale: 'en', cwd: '~/about', marked: '4:about', header: 'about' },
	{
		file: 'ko/projects.html',
		locale: 'ko',
		cwd: '~/ko/projects',
		marked: '5:projects',
		header: 'projects',
	},
	{ file: 'tags.html', locale: 'en', cwd: '~/tags', marked: '5:tags', header: 'tags' },
	{ file: 'ko/tags.html', locale: 'ko', cwd: '~/ko/tags', marked: '5:tags', header: 'tags' },
	{ file: 'contact.html', locale: 'en', cwd: '~/contact', marked: '5:contact', header: 'contact' },
	{ file: 'search.html', locale: 'en', cwd: '~/search', marked: '5:search', header: null },
	{ file: 'feed.html', locale: 'en', cwd: '~/feed', marked: '5:feed', header: null },
	{
		file: 'talks/my-career.html',
		locale: 'en',
		cwd: '~/talks/my-career',
		marked: '5:talks',
		header: null,
	},
	{ file: '404.html', locale: 'en', cwd: '~', marked: null, header: null },
];

/** `primary_navigation` per locale, read from the message catalogues. */
const PRIMARY: Record<'en' | 'ko', string> = {
	en: JSON.parse(readFileSync('messages/en.json', 'utf8')).primary_navigation,
	ko: JSON.parse(readFileSync('messages/ko.json', 'utf8')).primary_navigation,
};

/**
 * Header-nav failures for one exported page: order and locale of the eight
 * hrefs, the current-section mark (is-on and aria-current together, on the
 * expected link only), and the landmark rule (exactly one nav named
 * primary_navigation, inside the title bar; the status line is not a <nav>
 * and carries no role, aria-label or aria-labelledby).
 */
function headerFailures(html: string, c: ExportCase): string[] {
	const out: string[] = [];
	const bar = region(html, /<header class="term-bar"/, '</header>');
	const nav = bar ? region(bar, /<nav class="term-bar__nav"/, '</nav>') : null;
	if (!nav) return ['header nav missing'];

	const links = [...nav.matchAll(/<a\b([^>]*)>/g)].map((m) => ({
		href: /\bhref="([^"]*)"/.exec(m[1])?.[1] ?? '',
		on: /\bclass="[^"]*\bis-on\b/.test(m[1]),
		current: /\baria-current="page"/.test(m[1]),
	}));
	const want = HEADER_LINKS.map((k) => headerHref(k, c.locale));
	const got = links.map((l) => l.href);
	if (got.join(' ') !== want.join(' ')) out.push(`hrefs ${got.join(' ')}`);

	const split = links.filter((l) => l.on !== l.current);
	if (split.length) out.push(`is-on/aria-current split on ${split.map((l) => l.href).join(' ')}`);
	const marked = links.filter((l) => l.on || l.current).map((l) => l.href);
	const wantMarked = c.header ? [headerHref(c.header, c.locale)] : [];
	if (marked.join(' ') !== wantMarked.join(' '))
		out.push(`marked [${marked.join(' ')}], want [${wantMarked.join(' ')}]`);

	const named = [...html.matchAll(/<nav\b[^>]*>/g)].filter(
		(m) => /\baria-label="([^"]*)"/.exec(m[0])?.[1] === PRIMARY[c.locale],
	);
	const barAt = html.search(/<header class="term-bar"/);
	const barEnd = html.indexOf('</header>', barAt);
	if (named.length !== 1) out.push(`${named.length} nav landmarks named ${PRIMARY[c.locale]}`);
	else if (!(named[0].index! > barAt && named[0].index! < barEnd))
		out.push('the primary nav landmark is not inside the title bar');
	// REDESIGN: reviewer round 3: the status-line scroller must not be a
	// navigation landmark. It was `<nav role="none">`, which Chrome exposes as an
	// unnamed nav once it overflows, so the line is now not a <nav> at all and
	// carries no role or aria-label (migration:browser:landmarks checks the tree).
	const status = /<(\w+) class="term-status"[^>]*>/.exec(html);
	if (!status) out.push('status line missing');
	else if (status[1] === 'nav' || /\b(role|aria-label|aria-labelledby)=/.test(status[0]))
		out.push(`status line is a landmark candidate: ${status[0]}`);
	return out;
}

function text(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

function region(html: string, open: RegExp, close: string): string | null {
	const start = html.search(open);
	if (start < 0) return null;
	const end = html.indexOf(close, start);
	return end < 0 ? null : html.slice(start, end + close.length);
}

if (!existsSync(buildDir)) {
	record(false, 'export:build-dir', `${buildDir} missing — run pnpm build first`);
} else {
	for (const c of EXPORTS) {
		const path = join(buildDir, c.file);
		if (!existsSync(path)) {
			record(false, `export:${c.file}`, 'file missing');
			continue;
		}
		const html = readFileSync(path, 'utf8');
		const bar = region(html, /<header class="term-bar"/, '</header>');
		// REDESIGN: reviewer round 3: the status line is a <div>, not a <nav>.
		const nav = region(html, /<div class="term-status"/, '</div>');
		if (!bar || !nav) {
			record(false, `export:${c.file}`, 'title bar or status line missing');
			continue;
		}
		const pathStart = bar.indexOf('<span class="term-bar__path"');
		const toolsStart = bar.indexOf('<span class="term-bar__tools"');
		const cwd =
			pathStart >= 0 && toolsStart > pathStart
				? text(bar.slice(pathStart, toolsStart)).replace(/^brandon@seoul:/, '')
				: '(none)';
		record(cwd === c.cwd, `export:${c.file}:cwd`, `title bar cwd ${cwd}`);

		const current = [...nav.matchAll(/<a[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
			text(m[1]).replace(/\*$/, ''),
		);
		const expected = c.marked ? [c.marked] : [];
		record(
			JSON.stringify(current) === JSON.stringify(expected),
			`export:${c.file}:window`,
			`marked ${JSON.stringify(current)}`,
		);

		const hrefs = [...nav.matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1]).slice(0, 5);
		const wanted = STATUS_WINDOWS.map((w) => windowHref(w.key, c.locale));
		record(
			JSON.stringify(hrefs) === JSON.stringify(wanted),
			`export:${c.file}:hrefs`,
			hrefs.join(' '),
		);

		const header = headerFailures(html, c);
		record(
			header.length === 0,
			`export:${c.file}:header-nav`,
			header.join('; ') || `8 links, marked ${c.header ?? 'nothing'}, one primary landmark`,
		);
	}

	// Positive controls for the header check: each mutation of a real export
	// must be rejected, or the rows above cannot see the regression.
	const byFile = (file: string) => EXPORTS.find((c) => c.file === file)!;
	const page = (file: string) => readFileSync(join(buildDir, file), 'utf8');
	const HEADER_CONTROLS: {
		id: string;
		/** A failure message must contain this, so a control cannot pass on an unrelated check. */
		expect: string;
		file: string;
		what: string;
		mutate: (h: string) => string;
	}[] = [
		{
			id: 'control:header-unmarked',
			expect: 'marked [',
			file: 'posts.html',
			what: 'the current section loses its mark',
			mutate: (h) =>
				h.replace(' class="is-on" aria-current="page" href="/posts"', ' href="/posts"'),
		},
		{
			id: 'control:header-drops-ko',
			expect: 'hrefs ',
			file: 'ko/posts.html',
			what: 'Korean header hrefs lose /ko',
			mutate: (h) =>
				h.replace(/(<nav class="term-bar__nav"[\s\S]*?<\/nav>)/, (nav) =>
					nav.replace(/href="\/ko\//g, 'href="/'),
				),
		},
		{
			id: 'control:header-drops-link',
			expect: 'hrefs ',
			file: 'index.html',
			what: 'a destination disappears',
			mutate: (h) =>
				h.replace(/<a href="\/contact">[^<]*<\/a><\/nav><\/header>/, '</nav></header>'),
		},
		{
			id: 'control:header-marks-search',
			expect: 'marked [',
			file: 'search.html',
			what: 'an off-nav route marks a section',
			mutate: (h) =>
				h.replace(
					/(<nav class="term-bar__nav"[^>]*>(?:<a[^>]*>[^<]*<\/a>)?)<a href="\/posts"/,
					'$1<a class="is-on" aria-current="page" href="/posts"',
				),
		},
		// REDESIGN: reviewer round 3: the status-line scroller must not be a
		// navigation landmark; each way back to one must be rejected.
		{
			id: 'control:status-nav-none',
			expect: 'status line is a landmark candidate',
			file: 'about.html',
			what: 'the status line is <nav role="none"> again',
			mutate: (h) => h.replace('<div class="term-status"', '<nav class="term-status" role="none"'),
		},
		{
			id: 'control:status-landmark',
			expect: 'status line is a landmark candidate',
			file: 'about.html',
			what: 'the status line is a second primary nav landmark',
			mutate: (h) =>
				h.replace(
					'<div class="term-status"',
					`<nav class="term-status" aria-label="${PRIMARY.en}"`,
				),
		},
		{
			id: 'control:status-labelled',
			expect: 'status line is a landmark candidate',
			file: 'about.html',
			what: 'the status line carries an aria-label',
			mutate: (h) =>
				h.replace(
					'<div class="term-status"',
					`<div class="term-status" aria-label="${PRIMARY.en}"`,
				),
		},
		{
			id: 'control:status-role',
			expect: 'status line is a landmark candidate',
			file: 'about.html',
			what: 'the status line carries role="navigation"',
			mutate: (h) =>
				h.replace('<div class="term-status"', '<div class="term-status" role="navigation"'),
		},
	];
	for (const ctl of HEADER_CONTROLS) {
		const original = page(ctl.file);
		const mutated = ctl.mutate(original);
		const failures = mutated === original ? [] : headerFailures(mutated, byFile(ctl.file));
		record(
			failures.some((f) => f.includes(ctl.expect)),
			ctl.id,
			`header check rejects: ${ctl.what}${mutated === original ? ' (MUTATION DID NOT APPLY)' : ''}`,
		);
	}
	const en = readFileSync(join(buildDir, 'index.html'), 'utf8');
	const plan = region(en, /<footer class="term-frame term-plan"/, '</footer>');
	record(
		Boolean(plan) && [...(plan ?? '').matchAll(/class="term-lnk"/g)].length === 9,
		'export:plan-links',
		'~/.plan carries nine links',
	);
	record(
		Boolean(plan?.includes('theme: phosphor-fade')),
		'export:plan-theme',
		'footer copy reads theme: phosphor-fade (D9)',
	);
}

for (const row of rows) console.log(`${row.status}  ${row.id}  ${row.detail}`);
const failed = rows.filter((row) => row.status === 'FAIL').length;
console.log(`\n${rows.length - failed}/${rows.length} rows passed`);
process.exit(failed === 0 ? 0 : 1);
