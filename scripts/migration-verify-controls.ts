#!/usr/bin/env tsx
/**
 * Negative controls for the parity harness.
 *
 * WHY. plan.md § Slice 0 step 3: "A harness that has not been shown to fail on
 * a known-bad input is not evidence." This program copies the built site,
 * injects one defect per control, and asserts what the comparator does about
 * it. Results are whatever the run printed, not what was expected.
 *
 * SEVEN CONTROLS. Six must exit 1. One — control 6 — must exit 0 and marks a
 * deliberate blindness rather than a failure:
 *
 *   1 removed page              a built page deleted
 *   2 changed canonical         one canonical href rewritten
 *   3 dropped JSON-LD           an Article JSON-LD block deleted
 *   4 reworded title            one word changed inside <title>
 *   5 stale ledger entry        the ledger approves a difference that is absent
 *   6 Prettier-style reflow     a line break inserted mid-phrase in body text
 *   7 malformed ledger          an entry carrying an extra key
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

interface Control {
	id: number;
	name: string;
	expect: number;
	apply: (dir: string, ledgerPath: string) => void;
}

const EMPTY_LEDGER = '[]\n';

const CONTROLS: Control[] = [
	{
		id: 1,
		name: 'removed page',
		expect: 1,
		apply: (dir) => unlinkSync(join(dir, 'about.html')),
	},
	{
		id: 2,
		name: 'changed canonical',
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
		expect: 1,
		apply: (_dir, ledgerPath) => {
			writeFileSync(
				ledgerPath,
				`${JSON.stringify(
					[
						{
							url: '/about',
							field: 'title',
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
		name: 'Prettier-style reflow (deliberate blindness)',
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
		expect: 1,
		apply: (_dir, ledgerPath) => {
			writeFileSync(
				ledgerPath,
				`${JSON.stringify(
					[
						{
							url: '/about',
							field: 'title',
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
];

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

/** Cheap structural fingerprint: every file path plus its size. */
function treeFingerprint(dir: string): string {
	const parts: string[] = [];
	const walk = (d: string): void => {
		for (const entry of readdirSync(d).sort()) {
			const full = join(d, entry);
			const st = statSync(full);
			if (st.isDirectory()) walk(full);
			else parts.push(`${full}:${st.size}`);
		}
	};
	walk(dir);
	return parts.join('\n');
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
		`control ${control.id} ${control.name}\n  expected exit ${control.expect}, got ${code}  ${ok ? 'PASS' : 'FAIL'}\n  ${first.trim().slice(0, 150)}`,
	);
	rmSync(work, { recursive: true, force: true });
}

console.log(
	`\n${CONTROLS.length - failures}/${CONTROLS.length} controls produced their required exit code.`,
);
console.log('Control 6 asserts exit 0 on purpose: whitespace normalization is a stated blindness.');
process.exit(failures === 0 ? 0 : 1);
