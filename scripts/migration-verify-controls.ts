#!/usr/bin/env tsx
/**
 * Negative controls for the parity harness.
 *
 * WHY. plan.md § Slice 0 step 3: "A harness that has not been shown to fail on
 * a known-bad input is not evidence." This program copies the built site,
 * injects one defect per control, and asserts what the comparator does about
 * it. Results are whatever the run printed, not what was expected.
 *
 * TEN CONTROLS. Eight must exit 1. Two — controls 6 and 8 — must exit 0 and
 * mark deliberate blindnesses rather than failures:
 *
 *   1 removed page              a built page deleted
 *   2 changed canonical         one canonical href rewritten
 *   3 dropped JSON-LD           an Article JSON-LD block deleted
 *   4 reworded title            one word changed inside <title>
 *   5 stale ledger entry        the ledger approves a difference that is absent
 *   6 Prettier-style reflow     a line break inserted mid-phrase in body text
 *   7 malformed ledger          an entry carrying an extra key
 *   8 feed timestamp moved      only <lastBuildDate> changed
 *   9 feed item removed         one <item> deleted from rss.xml
 *  10 404 page removed         build/404.html deleted, caught as a page
 *
 * CONTROL 6 IS THE BOUNDARY, AND IT DEVIATES FROM plan.md. The plan lists a
 * reflow among the injected defects and says each control must exit nonzero.
 * The harness normalizes whitespace before hashing text, so a reflow is
 * invisible to it by design -- flagging it would report every Prettier run as a
 * content change and make the harness useless. Control 6 therefore asserts
 * exit 0 and exists to mark exactly where the harness stops seeing. The plan's
 * wording and this implementation disagree; the disagreement is recorded rather
 * than resolved unilaterally.
 *
 * USAGE  tsx scripts/migration-verify-controls.ts <build-dir> <baseline.json>
 * EXIT   0 = every control produced the exit code it must; 1 = one did not
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
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
							expected: 'baseline "x" != candidate "y"',
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
							expected: 'baseline "x" != candidate "y"',
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
							expected:
								'baseline "About Brandon Wie | Brandon Wie" != candidate "An Approved Rename"',
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
							expected:
								'baseline "About Brandon Wie | Brandon Wie" != candidate "An Approved Rename"',
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
];

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
