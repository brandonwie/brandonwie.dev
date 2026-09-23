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
 * POSITIVE CONTROLS run first. The rule table is replayed against deliberately
 * broken implementations (a cwd that drops `/ko`, a status map that never
 * appends the temporary window); if the table accepts either, the table cannot
 * catch the regression it exists for and the suite fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
	STATUS_WINDOWS,
	cwdFor,
	statusWindowFor,
	windowHref,
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

// --- export --------------------------------------------------------------
const buildDir = resolve(process.argv[2] ?? 'next/build');

interface ExportCase {
	file: string;
	locale: 'en' | 'ko';
	cwd: string;
	/** Visible text of the marked window, or null for none. */
	marked: string | null;
}

const EXPORTS: readonly ExportCase[] = [
	{ file: 'index.html', locale: 'en', cwd: '~', marked: '0:home' },
	{ file: 'ko.html', locale: 'ko', cwd: '~/ko', marked: '0:home' },
	{ file: 'posts.html', locale: 'en', cwd: '~/posts', marked: '1:posts' },
	{ file: 'ko/posts.html', locale: 'ko', cwd: '~/ko/posts', marked: '1:posts' },
	{ file: 'study/dsa-i.html', locale: 'en', cwd: '~/study/dsa-i', marked: '2:study' },
	{ file: 'system.html', locale: 'en', cwd: '~/system', marked: '3:3b' },
	{ file: 'ko/system/3b.html', locale: 'ko', cwd: '~/ko/system/3b', marked: '3:3b' },
	{ file: 'about.html', locale: 'en', cwd: '~/about', marked: '4:about' },
	{ file: 'ko/projects.html', locale: 'ko', cwd: '~/ko/projects', marked: '5:projects' },
	{ file: 'tags.html', locale: 'en', cwd: '~/tags', marked: '5:tags' },
	{ file: 'talks/my-career.html', locale: 'en', cwd: '~/talks/my-career', marked: '5:talks' },
	{ file: '404.html', locale: 'en', cwd: '~', marked: null },
];

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
		const nav = region(html, /<nav class="term-status"/, '</nav>');
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
