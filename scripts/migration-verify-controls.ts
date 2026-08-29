#!/usr/bin/env tsx
/**
 * Negative controls for the parity harness.
 *
 * WHY. plan.md § Slice 0 step 3: "A harness that has not been shown to fail on
 * a known-bad input is not evidence." This program copies the built site,
 * injects one defect per control, and asserts what the comparator does about
 * it. Results are whatever the run printed, not what was expected.
 *
 * TWO KINDS OF CONTROL, per plan.md § Slice 0 step 3 as amended 2026-08-25.
 * DEFECT controls must exit 1: the harness rejects a known-bad input. INVARIANCE
 * controls must exit 0: it ignores a benign change on purpose. Each invariance
 * control is paired with a defect control over the same surface, so a blindness
 * is never the only thing proven about a field. The plan and this file agree;
 * an earlier revision called every control a negative control and recorded the
 * mismatch as an open disagreement, which was the wrong diagnosis.
 *
 *   defect      1 removed page              2 changed canonical
 *               3 dropped JSON-LD           4 reworded title
 *               5 stale ledger entry        7 malformed ledger
 *               9 feed item removed        10 404 page removed
 *              11 html lang changed        12 internal link target changed
 *              13 content image src        14 ledger approves a DIFFERENT
 *              16 image alt removed        17 one repeated-link occurrence broken
 *              18 color-scheme flipped
 *              20 ledger approval reused across a shared printed prefix
 *              21 favicon href points elsewhere
 *              23 favicon link deleted     25 font URL weight dropped
 *              27 bundle stylesheets gone  29 preconnect deleted
 *              30 query appended to a href 31 fragment appended to a href
 *              32 og tag removed           33 twitter tag value changed
 *   invariance  6 Prettier reflow ignored   8 feed timestamp ignored
 *              15 ledger approves the EXACT difference
 *              19 directory-index file shape is equivalent
 *              22 route-relative vs absolute href
 *              24 &amp; vs a raw & in a href
 *              26 bundle stylesheet filenames rehashed
 *              28 two head links swapped in document order
 *              34 og and twitter tags reordered in the document
 *
 * Controls 21-31 pin `normalizeShell()`. Each of its three loosenings -- href
 * resolution against the page URL, bundle assets collapsed to one presence key,
 * and sorted keys -- is an invariance claim, so each is bounded by defect
 * controls over the same surface. 30 and 31 exist because the first resolution
 * kept only `URL.pathname` and silently discarded `?query` and `#fragment`.
 *
 * USAGE  tsx scripts/migration-verify-controls.ts <build-dir> <baseline.json>
 * EXIT   0 = every control produced the exit code it must; 1 = one did not
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [buildDir, baselineFile] = process.argv.slice(2);
if (!buildDir || !baselineFile) {
	console.error('usage: migration-verify-controls <build-dir> <baseline.json>');
	process.exit(2);
}

const HARNESS = 'scripts/migration-verify.ts';

function runCompare(candidate: string, ledger: string): { code: number; out: string } {
	try {
		const out = execFileSync(
			'npx',
			['tsx', HARNESS, 'compare', baselineFile, candidate, '--ledger', ledger],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
		);
		return { code: 0, out };
	} catch (error) {
		const e = error as { status?: number; stdout?: string; stderr?: string };
		return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
	}
}

/**
 * Round 26 split the taxonomy. Calling an exit-0 assertion a "negative control"
 * was the defect: a negative control demonstrates the harness REJECTS a defect,
 * and an assertion that a benign change is ignored is an INVARIANCE control.
 * Both are needed and they prove opposite things, so they are named apart here
 * and in plan.md, AC1 and the verification record.
 */
type ControlKind = 'defect' | 'invariance';

interface Control {
	id: number;
	name: string;
	kind: ControlKind;
	expect: number;
	apply: (dir: string, ledgerPath: string) => void;
}

const EMPTY_LEDGER = '[]\n';

const CONTROLS: Control[] = [
	{
		id: 1,
		name: 'removed page',
		kind: 'defect',
		expect: 1,
		apply: (dir) => unlinkSync(join(dir, 'about.html')),
	},
	{
		id: 2,
		name: 'changed canonical',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(
					/rel="canonical" href="[^"]*"/,
					'rel="canonical" href="https://example.invalid/about"',
				),
			);
		},
	},
	{
		id: 3,
		name: 'dropped JSON-LD',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = jsonLdPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/i, ''),
			);
		},
	},
	{
		id: 4,
		name: 'reworded title',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(/<title>([\s\S]*?)<\/title>/i, (_m, t) => `<title>${t} Revised</title>`),
			);
		},
	},
	{
		id: 5,
		name: 'stale ledger entry',
		kind: 'defect',
		expect: 1,
		apply: (_dir, ledgerPath) => {
			writeFileSync(
				ledgerPath,
				`${JSON.stringify(
					[
						{
							url: '/about',
							field: 'title',
							fingerprint: '0'.repeat(32),
							reason: 'approves a difference that does not exist',
							approved_by: 'control-5',
							approved_on: '2026-08-25',
						},
					],
					null,
					2,
				)}\n`,
			);
		},
	},
	{
		id: 6,
		name: 'Prettier-style reflow is ignored',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			const body = html.indexOf('<body');
			const target = html.indexOf(' ', html.indexOf('>', body) + 400);
			writeFileSync(file, `${html.slice(0, target)}\n      ${html.slice(target + 1)}`);
		},
	},
	{
		id: 7,
		name: 'malformed ledger (extra key)',
		kind: 'defect',
		expect: 1,
		apply: (_dir, ledgerPath) => {
			writeFileSync(
				ledgerPath,
				`${JSON.stringify(
					[
						{
							url: '/about',
							field: 'title',
							fingerprint: '0'.repeat(32),
							reason: 'carries a key the closed format does not allow',
							approved_by: 'control-7',
							approved_on: '2026-08-25',
							severity: 'minor',
						},
					],
					null,
					2,
				)}\n`,
			);
		},
	},
	{
		id: 8,
		name: 'feed lastBuildDate move is ignored',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			const file = join(dir, 'rss.xml');
			const xml = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				xml.replace(
					/<lastBuildDate>[^<]*<\/lastBuildDate>/,
					'<lastBuildDate>Thu, 01 Jan 2099 00:00:00 GMT</lastBuildDate>',
				),
			);
		},
	},
	{
		id: 10,
		name: '404 page removed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => unlinkSync(join(dir, '404.html')),
	},
	{
		id: 11,
		name: 'html lang changed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			writeFileSync(file, html.replace(/<html([^>]*)lang="[^"]*"/i, '<html$1lang="fr"'));
		},
	},
	{
		id: 12,
		name: 'internal link target changed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			const body = html.indexOf('<body');
			const head = html.slice(0, body);
			const rest = html.slice(body).replace(/href="\/posts"/i, 'href="/posts-moved"');
			writeFileSync(file, head + rest);
		},
	},
	{
		id: 13,
		name: 'content image src changed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = imagePage(dir);
			const html = readFileSync(file, 'utf8');
			const body = html.indexOf('<body');
			writeFileSync(
				file,
				html.slice(0, body) +
					html.slice(body).replace(/(<img\b[^>]*src=")([^"]+)(")/i, '$1/moved/elsewhere.png$3'),
			);
		},
	},
	{
		id: 14,
		name: 'ledger approves a DIFFERENT difference in the same url+field',
		kind: 'defect',
		expect: 1,
		apply: (dir, ledgerPath) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(/<title>([\s\S]*?)<\/title>/i, '<title>Something Else Entirely</title>'),
			);
			writeFileSync(
				ledgerPath,
				`${JSON.stringify(
					[
						{
							url: '/about',
							field: 'title',
							fingerprint: approvedRenameFingerprint(),
							reason: 'approves one specific title change, not the title field',
							approved_by: 'control-14',
							approved_on: '2026-08-25',
						},
					],
					null,
					2,
				)}\n`,
			);
		},
	},
	{
		id: 15,
		name: 'ledger approves the EXACT difference',
		kind: 'invariance',
		expect: 0,
		apply: (dir, ledgerPath) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(/<title>([\s\S]*?)<\/title>/i, '<title>An Approved Rename</title>'),
			);
			writeFileSync(
				ledgerPath,
				`${JSON.stringify(
					[
						{
							url: '/about',
							field: 'title',
							fingerprint: approvedRenameFingerprint(),
							reason: 'the one difference this entry exists to approve',
							approved_by: 'control-15',
							approved_on: '2026-08-25',
						},
					],
					null,
					2,
				)}\n`,
			);
		},
	},
	{
		id: 16,
		name: 'image alt text removed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = imagePage(dir);
			const html = readFileSync(file, 'utf8');
			const body = html.indexOf('<body');
			writeFileSync(
				file,
				html.slice(0, body) + html.slice(body).replace(/(<img\b[^>]*)\salt="[^"]*"/i, '$1'),
			);
		},
	},
	{
		id: 17,
		name: 'one occurrence of a repeated link target broken, text unchanged',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			// The first version appended a new <a>dup</a>, which also changed the
			// page text -- it exited 1 on [text] and proved nothing about occurrence
			// lists. This rewrites the href of the SECOND occurrence of a target that
			// already appears twice, so the visible text is byte-identical and only
			// the occurrence list moves.
			const file = repeatedLinkPage(dir);
			const html = readFileSync(file, 'utf8');
			const body = html.indexOf('<body');
			const head = html.slice(0, body);
			const rest = html.slice(body);
			const counts = new Map<string, number>();
			for (const m of rest.matchAll(/href="(\/[^"]*)"/g)) {
				counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
			}
			const repeated = [...counts.entries()].find(([, n]) => n >= 2)?.[0];
			if (!repeated) {
				console.error('FATAL: control 17 found no link target that appears twice');
				process.exit(2);
			}
			let seen = 0;
			const mutated = rest.replace(new RegExp(`href="${repeated}"`, 'g'), (match) => {
				seen += 1;
				return seen === 2 ? `href="${repeated}-broken"` : match;
			});
			writeFileSync(file, head + mutated);
		},
	},
	{
		id: 18,
		name: 'color-scheme meta flipped dark to light',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			if (!/name="color-scheme"/i.test(html)) {
				console.error('FATAL: control 18 found no color-scheme meta to flip');
				process.exit(2);
			}
			writeFileSync(
				file,
				html.replace(/(name="color-scheme"[^>]*content=")[^"]*(")/i, '$1light$2'),
			);
		},
	},
	{
		id: 19,
		name: 'directory-index file shape serves the same URL and status',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			// Next's export can write `about/index.html` where SvelteKit writes
			// `about.html`. Both must serve /about at 200 and compare identical.
			//
			// This replaced a control that created `this-page-does-not-exist.html`
			// and claimed to test statuses: it exited 1 on [page], because in a
			// static tree a status difference is ENTAILED by a manifest difference.
			// The status map's real value is proving the served shape, which is what
			// this asserts.
			const from = join(dir, 'about.html');
			const to = join(dir, 'about', 'index.html');
			mkdirSync(join(dir, 'about'), { recursive: true });
			writeFileSync(to, readFileSync(from));
			unlinkSync(from);
		},
	},
	{
		id: 20,
		name: 'ledger approval reused on a different difference with the same 120-char prefix',
		kind: 'defect',
		expect: 1,
		apply: (dir, ledgerPath) => {
			// Two long internalLinks differences whose printed detail is identical
			// after truncation. Approving by the printed string covered both; the
			// fingerprint is computed over the untruncated values.
			const file = join(dir, 'about.html');
			const html = readFileSync(file, 'utf8');
			const filler = Array.from({ length: 40 }, (_, i) => `<a href="/pad-${i}">p</a>`).join('');
			writeFileSync(file, html.replace('</body>', `${filler}<a href="/tail-b">t</a></body>`));
			writeFileSync(
				ledgerPath,
				`${JSON.stringify(
					[
						{
							url: '/about',
							field: 'internalLinks',
							fingerprint: 'f'.repeat(32),
							reason: 'approves a different long difference sharing the printed prefix',
							approved_by: 'control-20',
							approved_on: '2026-08-25',
						},
					],
					null,
					2,
				)}\n`,
			);
		},
	},
	{
		id: 9,
		name: 'feed item removed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = join(dir, 'rss.xml');
			const xml = readFileSync(file, 'utf8');
			writeFileSync(file, xml.replace(/<item>[\s\S]*?<\/item>/, ''));
		},
	},

	// --- shell normalization (controls 21-29) --------------------------------
	//
	// `normalizeShell()` resolves link hrefs against the page URL, collapses
	// framework bundle assets to one presence key, and sorts keys. Each of those
	// three loosenings is an INVARIANCE claim, so each is paired here with a
	// DEFECT control over the same surface. Without the pairs, the normalization
	// would be indistinguishable from switching the shell comparison off.
	{
		id: 21,
		name: 'favicon href points at a DIFFERENT file',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = relativeIconPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(file, html.replace('../favicon.svg', '../favicon.ico'));
		},
	},
	{
		id: 22,
		name: 'favicon href written absolute instead of route-relative',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			// `../favicon.svg` at /posts/<slug> and `/favicon.svg` denote the same
			// file. 365 of 366 baseline pages spell it relatively; no candidate can
			// reproduce that spelling, and it never meant anything different.
			const file = relativeIconPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(file, html.replace('../favicon.svg', '/favicon.svg'));
		},
	},
	{
		id: 23,
		name: 'favicon link deleted',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = relativeIconPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(file, html.replace(/<link rel="icon"[^>]*>/, ''));
		},
	},
	{
		id: 24,
		name: 'font href serialized with &amp; instead of a raw &',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			const file = fontLinkPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(
					/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)"/,
					(_m, href) => `href="${href.replace(/&/g, '&amp;')}"`,
				),
			);
		},
	},
	{
		id: 25,
		name: 'font href semantically changed (a weight dropped)',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = fontLinkPage(dir);
			const html = readFileSync(file, 'utf8');
			if (!html.includes('JetBrains+Mono:wght@400;500;600;700')) {
				console.error('FATAL: control 25 found no JetBrains Mono weight list to change');
				process.exit(2);
			}
			writeFileSync(
				file,
				html.replace('JetBrains+Mono:wght@400;500;600;700', 'JetBrains+Mono:wght@400;500;600'),
			);
		},
	},
	{
		id: 26,
		name: 'bundle stylesheet filenames rehashed',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			const file = bundleStylesheetPage(dir);
			const html = readFileSync(file, 'utf8');
			let n = 0;
			writeFileSync(
				file,
				html.replace(
					/(_app\/immutable\/assets\/)[^"']+\.css/g,
					(_m, prefix) => `${prefix}rehashed${n++}.css`,
				),
			);
		},
	},
	{
		id: 27,
		name: 'every bundle stylesheet link removed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			// The presence key exists so this stays visible. Collapsing 1087
			// content-hashed entries to one marker is only safe if losing the CSS
			// entirely still fails.
			const file = bundleStylesheetPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(/<link[^>]*_app\/immutable\/assets\/[^>]*\.css"[^>]*>/g, ''),
			);
		},
	},
	{
		id: 28,
		name: 'two head links swapped in document order',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			const file = fontLinkPage(dir);
			const html = readFileSync(file, 'utf8');
			const a = '<link rel="preconnect" href="https://fonts.googleapis.com" />';
			const b = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />';
			if (!html.includes(a) || !html.includes(b)) {
				console.error('FATAL: control 28 found no preconnect pair to swap');
				process.exit(2);
			}
			writeFileSync(file, html.replace(a, '__SWAP__').replace(b, a).replace('__SWAP__', b));
		},
	},
	{
		id: 29,
		name: 'a preconnect hint deleted',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = fontLinkPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />', ''),
			);
		},
	},

	{
		id: 30,
		name: 'a query string appended to a shell href',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			// Resolution keeps pathname, search AND hash. The first version kept
			// only URL.pathname, so `../favicon.svg` and `../favicon.svg?v=2`
			// normalized to the same key and a cache-busting query on any shell
			// link compared equal. Paired with control 22, which is the invariance
			// this defect bounds.
			const file = relativeIconPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(file, html.replace('../favicon.svg', '../favicon.svg?v=2'));
		},
	},
	{
		id: 31,
		name: 'a fragment appended to a shell href',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = relativeIconPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(file, html.replace('../favicon.svg', '../favicon.svg#icon'));
		},
	},

	{
		id: 32,
		name: 'an og tag removed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = ogPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(file, html.replace(/<meta property="og:type"[^>]*\/?>/, ''));
		},
	},
	{
		id: 33,
		name: 'a twitter tag value changed',
		kind: 'defect',
		expect: 1,
		apply: (dir) => {
			const file = ogPage(dir);
			const html = readFileSync(file, 'utf8');
			writeFileSync(
				file,
				html.replace(/(name="twitter:card"[^>]*content=")[^"]*(")/, '$1summary$2'),
			);
		},
	},
	{
		id: 34,
		name: 'og and twitter tags reordered in the document',
		kind: 'invariance',
		expect: 0,
		apply: (dir) => {
			// The candidate does not choose this order: SvelteKit emits template
			// order, Next's Metadata API emits its own, and both describe the same
			// page. Paired with 32 and 33, which still catch a missing tag and a
			// changed value.
			const file = ogPage(dir);
			const html = readFileSync(file, 'utf8');
			const tags = [...html.matchAll(/<meta property="og:[^"]*"[^>]*\/?>/g)].map((m) => m[0]);
			if (tags.length < 3) {
				console.error('FATAL: control 34 needs at least three og tags to reorder');
				process.exit(2);
			}
			let out = html;
			for (const tag of tags) out = out.replace(tag, '');
			const reversed = [...tags].reverse().join('');
			writeFileSync(
				out.includes('</head>') ? file : file,
				out.replace('</head>', `${reversed}</head>`),
			);
		},
	},
];

/** A built page whose favicon href is ROUTE-RELATIVE with a `../` segment.
 *
 * Controls 21-23 are about resolving that spelling, so a page that already
 * spells it `./favicon.svg` would make all three vacuous. No such page is a
 * hard error, the same way `jsonLdPage` refuses to fall back. */
function relativeIconPage(dir: string): string {
	for (const base of [join(dir, 'posts'), join(dir, 'ko', 'posts')]) {
		if (!existsSync(base)) continue;
		for (const entry of readdirSync(base)) {
			if (!entry.endsWith('.html')) continue;
			const full = join(base, entry);
			if (readFileSync(full, 'utf8').includes('href="../favicon.svg"')) return full;
		}
	}
	console.error('FATAL: no built page links ../favicon.svg; controls 21-23 cannot run');
	process.exit(2);
}

/** A built page carrying a full Open Graph and Twitter card set. */
function ogPage(dir: string): string {
	for (const base of [join(dir, 'posts'), dir]) {
		if (!existsSync(base)) continue;
		for (const entry of readdirSync(base)) {
			if (!entry.endsWith('.html')) continue;
			const full = join(base, entry);
			const head = readFileSync(full, 'utf8').split('</head>')[0];
			const og = [...head.matchAll(/<meta property="og:[^"]*"/g)].length;
			if (og >= 3 && /name="twitter:card"/.test(head)) return full;
		}
	}
	console.error('FATAL: no built page carries og and twitter tags; controls 32-34 cannot run');
	process.exit(2);
}

/** A built page carrying the Google Fonts stylesheet and both preconnect hints. */
function fontLinkPage(dir: string): string {
	for (const candidate of ['about.html', 'index.html']) {
		const full = join(dir, candidate);
		if (!existsSync(full)) continue;
		const html = readFileSync(full, 'utf8');
		if (html.includes('fonts.googleapis.com/css2') && html.includes('fonts.gstatic.com'))
			return full;
	}
	console.error(
		'FATAL: no built page carries the font stylesheet and preconnects; controls 24-25 and 28-29 cannot run',
	);
	process.exit(2);
}

/** A built page carrying at least two ROUTE-RELATIVE bundle stylesheets.
 *
 * The relative spelling is required, and finding that out cost control 27 a
 * run: the first version accepted any page and picked `404.html`, whose
 * stylesheets are absolute `/_app/...`. `extractFields()` has always skipped
 * that exact spelling, so the entries were never recorded, deleting them
 * changed nothing the comparator could see, and the control reported exit 0 on
 * a build with its CSS torn out. A control that cannot observe its own mutation
 * proves nothing, so the selector now demands a page where the entries exist. */
function bundleStylesheetPage(dir: string): string {
	for (const base of [dir, join(dir, 'posts')]) {
		if (!existsSync(base)) continue;
		for (const entry of readdirSync(base)) {
			if (!entry.endsWith('.html')) continue;
			const full = join(base, entry);
			const head = readFileSync(full, 'utf8').split('</head>')[0];
			if (
				[...head.matchAll(/"\.{1,2}\/(?:\.\.\/)*_app\/immutable\/assets\/[^"']+\.css"/g)].length >=
				2
			) {
				return full;
			}
		}
	}
	console.error(
		'FATAL: no built page carries two route-relative bundle stylesheets; controls 26-27 cannot run',
	);
	process.exit(2);
}

/** The fingerprint the comparator prints for the /about title change that
 * controls 14 and 15 use. Computed the same way the comparator does, so the
 * pair tests the binding rather than a string I typed. */
function approvedRenameFingerprint(): string {
	const baselineTitle = JSON.parse(readFileSync(baselineFile, 'utf8')).pages['/about'].title;
	return createHash('sha256')
		.update(
			`/about\u0000title\u0000${JSON.stringify(baselineTitle)}\u0000${JSON.stringify('An Approved Rename')}`,
		)
		.digest('hex')
		.slice(0, 32);
}

/** A built page whose body links to the same internal target at least twice. */
function repeatedLinkPage(dir: string): string {
	for (const base of [dir, join(dir, 'posts')]) {
		if (!existsSync(base)) continue;
		for (const entry of readdirSync(base)) {
			if (!entry.endsWith('.html')) continue;
			const full = join(base, entry);
			const body = readFileSync(full, 'utf8').slice(readFileSync(full, 'utf8').indexOf('<body'));
			const counts = new Map<string, number>();
			for (const m of body.matchAll(/href="(\/[^"]*)"/g)) {
				counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
			}
			if ([...counts.values()].some((n) => n >= 2)) return full;
		}
	}
	console.error('FATAL: no built page repeats an internal link target; control 17 cannot run');
	process.exit(2);
}

/** A built page carrying a content image that is not a framework asset. */
function imagePage(dir: string): string {
	for (const base of [join(dir, 'posts'), dir]) {
		if (!existsSync(base)) continue;
		for (const entry of readdirSync(base)) {
			if (!entry.endsWith('.html')) continue;
			const full = join(base, entry);
			const html = readFileSync(full, 'utf8');
			const body = html.slice(html.indexOf('<body'));
			const img = body.match(/<img\b[^>]*src="([^"]+)"/i);
			if (img && !img[1].startsWith('/_app/')) return full;
		}
	}
	console.error('FATAL: no built page carries a content image; control 13 cannot run');
	process.exit(2);
}

/** A built page that actually carries an Article JSON-LD block.
 *
 * The first version of this control pointed at `posts/index.html`, which the
 * static export does not produce, fell back to `about.html`, which carries no
 * JSON-LD, and so deleted nothing -- the control reported a clean run and would
 * have been recorded as proof that the harness sees JSON-LD. It does not
 * silently fall back any more: no such page is a hard error. */
function jsonLdPage(dir: string): string {
	const dirs = [join(dir, 'posts'), dir];
	for (const base of dirs) {
		if (!existsSync(base)) continue;
		for (const entry of readdirSync(base)) {
			if (!entry.endsWith('.html')) continue;
			const full = join(base, entry);
			if (readFileSync(full, 'utf8').includes('application/ld+json')) return full;
		}
	}
	console.error('FATAL: no built page carries an application/ld+json block; control 3 cannot run');
	process.exit(2);
}

/**
 * Fingerprint of the candidate tree: every file path plus a hash of its bytes.
 *
 * The first version hashed path plus SIZE, and control 8 -- which swaps one
 * timestamp for another of the same length -- was reported as "changed
 * nothing". A guard that only notices edits which change a file's length is
 * not a guard against no-op injections, which is the whole point of it.
 */
function treeFingerprint(dir: string): string {
	const parts: string[] = [];
	const walk = (d: string): void => {
		for (const entry of readdirSync(d).sort()) {
			const full = join(d, entry);
			if (statSync(full).isDirectory()) walk(full);
			else parts.push(`${full}:${createHash('sha256').update(readFileSync(full)).digest('hex')}`);
		}
	};
	walk(dir);
	return createHash('sha256').update(parts.join('\n')).digest('hex');
}

let failures = 0;
console.log(`negative controls against ${buildDir}, baseline ${baselineFile}\n`);
for (const control of CONTROLS) {
	const work = mkdtempSync(join(tmpdir(), `migration-verify-c${control.id}-`));
	const candidate = join(work, 'build');
	const ledger = join(work, 'ledger.json');
	cpSync(buildDir, candidate, { recursive: true });
	writeFileSync(ledger, EMPTY_LEDGER);
	const before = treeFingerprint(candidate) + readFileSync(ledger, 'utf8');
	control.apply(candidate, ledger);
	const after = treeFingerprint(candidate) + readFileSync(ledger, 'utf8');
	if (before === after) {
		// A control whose injection changed nothing tests nothing, and would be
		// recorded as evidence anyway. Control 3 did exactly that once.
		console.error(
			`FATAL: control ${control.id} (${control.name}) changed neither the tree nor the ledger`,
		);
		process.exit(2);
	}

	const { code, out } = runCompare(candidate, ledger);
	const ok = code === control.expect;
	if (!ok) failures += 1;
	const first =
		out
			.split('\n')
			.find(
				(l) =>
					l.startsWith('DIFF') ||
					l.startsWith('STALE') ||
					l.startsWith('FATAL') ||
					l.startsWith('PARITY'),
			) ?? '';
	console.log(
		`control ${control.id} [${control.kind}] ${control.name}\n  expected exit ${control.expect}, got ${code}  ${ok ? 'PASS' : 'FAIL'}\n  ${first.trim().slice(0, 150)}`,
	);
	rmSync(work, { recursive: true, force: true });
}

const defects = CONTROLS.filter((c) => c.kind === 'defect').length;
const invariants = CONTROLS.length - defects;
console.log(
	`\n${CONTROLS.length - failures}/${CONTROLS.length} controls produced their required exit code ` +
		`(${defects} defect controls must exit 1; ${invariants} invariance controls must exit 0).`,
);
console.log('Invariance controls are not weaker defect controls: they assert that a benign change');
console.log('is ignored, which is why each is paired with a defect control over the same surface.');
process.exit(failures === 0 ? 0 : 1);
