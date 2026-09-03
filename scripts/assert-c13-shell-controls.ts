/**
 * Negative controls for the C13 shell assertions.
 *
 *   pnpm migration:c13:controls
 *
 * `assert-c13-shell.ts` currently reports 13 passing rows. That number is worth
 * nothing until the checks behind it have been observed to go red, which is the
 * same argument `migration-verify-controls.ts` makes for the parity comparator
 * and the same one plan.md AC1 makes for the harness as a whole.
 *
 * Two kinds of control, proving opposite things:
 *
 *   DEFECT      the assertion MUST exit 1 on a deliberately broken build
 *   INVARIANCE  the assertion MUST exit 0 on a benign change it should ignore
 *
 * Every invariance control is paired with a defect control over the same
 * surface, so a blindness can never be the only thing proven about a field —
 * `verification/README.md` states that rule for the comparator's twenty
 * controls and it applies here unchanged.
 *
 * Each control runs against a throwaway copy of the candidate build under
 * `tmp/`. The real `next/build` is never mutated.
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	unlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { runAssertions } from './assert-c13-shell.ts';
import type { Exception } from './migration-verify.ts';

const LEDGER = 'verification/exception-ledger.json';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	/** Mutate the copied build tree in place. */
	apply: (dir: string) => void;
	/** Mutate a copy of the exception ledger; the build tree may stay untouched. */
	ledger?: (entries: Exception[]) => Exception[];
}

/** Rewrite every built page through `edit`. */
const onEveryPage =
	(edit: (html: string) => string) =>
	(dir: string): void => {
		for (const name of ['index.html', '404.html', '_not-found.html']) {
			const file = join(dir, name);
			if (!existsSync(file)) continue;
			writeFileSync(file, edit(readFileSync(file, 'utf8')));
		}
	};

const CONTROLS: Control[] = [
	{
		id: 'C13-01',
		kind: 'DEFECT',
		what: 'html lang contradicts the URL locale',
		apply: onEveryPage((html) => html.replace('<html lang="en">', '<html lang="ko">')),
	},
	{
		id: 'C13-02',
		kind: 'DEFECT',
		what: 'theme-color meta deleted',
		apply: onEveryPage((html) => html.replace(/<meta name="theme-color"[^>]*\/?>/, '')),
	},
	{
		id: 'C13-03',
		kind: 'DEFECT',
		what: 'theme-color meta present but wrong value',
		apply: onEveryPage((html) => html.replace('content="#13111c"', 'content="#000000"')),
	},
	{
		id: 'C13-04',
		kind: 'DEFECT',
		what: 'color-scheme meta flipped dark -> light',
		apply: onEveryPage((html) =>
			html.replace(
				'<meta name="color-scheme" content="dark"/>',
				'<meta name="color-scheme" content="light"/>',
			),
		),
	},
	{
		id: 'C13-05',
		kind: 'DEFECT',
		what: 'viewport meta content changed',
		apply: onEveryPage((html) =>
			html.replace('content="width=device-width, initial-scale=1"', 'content="width=device-width"'),
		),
	},
	{
		id: 'C13-06',
		kind: 'DEFECT',
		what: 'charset meta deleted',
		apply: onEveryPage((html) => html.replace(/<meta charSet="utf-8"\/?>/i, '')),
	},
	{
		id: 'C13-07',
		kind: 'DEFECT',
		what: 'favicon link deleted',
		apply: onEveryPage((html) => html.replace(/<link rel="icon"[^>]*\/?>/, '')),
	},
	{
		id: 'C13-08',
		kind: 'DEFECT',
		what: 'manifest link deleted',
		apply: onEveryPage((html) => html.replace(/<link rel="manifest"[^>]*\/?>/, '')),
	},
	{
		id: 'C13-09',
		kind: 'DEFECT',
		what: 'a preconnect hint deleted while the Google Fonts link stays',
		apply: onEveryPage((html) =>
			html.replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*\/?>/, ''),
		),
	},
	{
		id: 'C13-10',
		kind: 'DEFECT',
		what: 'Google Fonts stylesheet link deleted',
		apply: onEveryPage((html) =>
			html.replace(
				/<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*rel="stylesheet"\/?>/,
				'',
			),
		),
	},
	{
		id: 'C13-11',
		kind: 'DEFECT',
		what: 'a SvelteKit-only body attribute leaks back in',
		apply: onEveryPage((html) =>
			html.replace('<body>', '<body data-sveltekit-preload-data="hover">'),
		),
	},
	{
		id: 'C13-12',
		kind: 'DEFECT',
		what: 'favicon LINK is intact but the FILE is gone — a 404 behind a correct tag',
		apply: (dir) => unlinkSync(join(dir, 'favicon.svg')),
	},
	{
		id: 'C13-13',
		kind: 'DEFECT',
		what: 'manifest LINK is intact but the FILE is gone',
		apply: (dir) => unlinkSync(join(dir, 'site.webmanifest')),
	},
	{
		id: 'C13-14',
		kind: 'INVARIANCE',
		what: 'whitespace reflow between head elements — paired with C13-02/03',
		apply: onEveryPage((html) => html.replace(/><meta/g, '>\n  <meta')),
	},
	{
		id: 'C13-15',
		kind: 'INVARIANCE',
		what: 'the /_next bundle stylesheet href changes hash — paired with C13-10',
		apply: onEveryPage((html) =>
			html.replace(
				/\/_next\/static\/chunks\/[a-z0-9_-]+\.css/g,
				'/_next/static/chunks/rehashed0000.css',
			),
		),
	},
	{
		id: 'C13-16',
		kind: 'INVARIANCE',
		what: 'font href written with a raw & instead of &amp; — paired with C13-10',
		apply: onEveryPage((html) =>
			html.replace(/(href="https:\/\/fonts\.googleapis\.com\/css2[^"]*")/g, (match) =>
				match.replace(/&amp;/g, '&'),
			),
		),
	},
	// Round 9 (PR #34): the preload-data row must READ the ledger, not assert coverage.
	{
		id: 'C13-17',
		kind: 'DEFECT',
		what: "the approved shell entry for '/' removed from the ledger — its prefetch difference is no longer approved",
		apply: () => {},
		ledger: (entries) => entries.filter((e) => !(e.url === '/' && e.field === 'shell')),
	},
	{
		id: 'C13-18',
		kind: 'DEFECT',
		what: "the '/' shell entry's fingerprint altered — a stale approval must not cover the route",
		apply: () => {},
		ledger: (entries) =>
			entries.map((e) =>
				e.url === '/' && e.field === 'shell' ? { ...e, fingerprint: '0'.repeat(32) } : e,
			),
	},
	{
		id: 'C13-19',
		kind: 'INVARIANCE',
		what: 'an approval for a route the candidate does not build appended — coverage is judged per built route',
		apply: () => {},
		ledger: (entries) => [
			...entries,
			{
				url: '/nowhere',
				field: 'shell',
				fingerprint: 'f'.repeat(32),
				reason: 'control fixture: a route the candidate does not build',
				approved_by: 'control',
				approved_on: '2000-01-01',
			},
		],
	},
];

/** Content hash of every file the controls can touch (build tree + scratch ledger), so a no-op mutation is detectable. */
function treeFingerprint(dir: string, ledgerFile: string): string {
	const hash = createHash('sha256');
	hash
		.update('ledger')
		.update(existsSync(ledgerFile) ? readFileSync(ledgerFile) : Buffer.from('ABSENT'));
	for (const name of [
		'index.html',
		'404.html',
		'_not-found.html',
		'favicon.svg',
		'site.webmanifest',
	]) {
		const file = join(dir, name);
		hash.update(name).update(existsSync(file) ? readFileSync(file) : Buffer.from('ABSENT'));
	}
	return hash.digest('hex');
}

async function main(): Promise<number> {
	const source = process.argv[2] ?? 'next/build';
	const baseline = process.argv[3] ?? 'verification/baseline/svelte-e23e808.json';
	const scratch = 'tmp/c13-controls';
	const scratchLedger = 'tmp/c13-controls-ledger.json';

	if (!existsSync(source)) {
		console.error(`FATAL: candidate build not found: ${source} — run \`pnpm build:next\` first`);
		return 2;
	}

	// A control suite that never sees the unbroken build passing is not a
	// baseline, it is a coincidence.
	const clean = await runAssertions(source, baseline, true);
	console.log(`BASELINE  ${source} unmodified -> exit ${clean} (expected 0)`);
	if (clean !== 0) {
		console.error(
			'FATAL: the unmodified build does not pass; fix that before trusting any control below',
		);
		return 1;
	}

	mkdirSync('tmp', { recursive: true });
	const failures: string[] = [];

	for (const control of CONTROLS) {
		rmSync(scratch, { recursive: true, force: true });
		cpSync(source, scratch, { recursive: true });
		const entries = JSON.parse(readFileSync(LEDGER, 'utf8')) as Exception[];
		writeFileSync(scratchLedger, JSON.stringify(entries, null, '\t'));
		const before = treeFingerprint(scratch, scratchLedger);
		control.apply(scratch);
		if (control.ledger)
			writeFileSync(scratchLedger, JSON.stringify(control.ledger(entries), null, '\t'));
		const after = treeFingerprint(scratch, scratchLedger);
		// A mutation that silently matched nothing turns an INVARIANCE control
		// into a tautology and a DEFECT control into a coincidence. Neither is
		// allowed to be the reason a control "passed".
		if (before === after) {
			failures.push(
				`${control.id} ${control.what}: the mutation changed nothing, so the control proves nothing`,
			);
			console.log(
				`FAIL  ${control.id}  ${control.kind.padEnd(10)} NO-OP MUTATION                  ${control.what}`,
			);
			continue;
		}
		const code = await runAssertions(scratch, baseline, true, scratchLedger);
		const expected = control.kind === 'DEFECT' ? 1 : 0;
		const ok = code === expected;
		if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected ${expected}`);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind.padEnd(10)} exit ${code} (expected ${expected})  ${control.what}`,
		);
	}
	rmSync(scratch, { recursive: true, force: true });
	rmSync(scratchLedger, { force: true });

	const defects = CONTROLS.filter((c) => c.kind === 'DEFECT').length;
	const invariance = CONTROLS.length - defects;
	console.log(
		`\n${CONTROLS.length} controls: ${defects} defect (must exit 1), ${invariance} invariance (must exit 0)`,
	);
	if (failures.length) {
		for (const line of failures) console.error(`CONTROL FAILED ${line}`);
		console.error(
			`RESULT: ${failures.length}/${CONTROLS.length} control(s) failed — the C13 assertions do not fail closed`,
		);
		return 1;
	}
	console.log(`RESULT: ${CONTROLS.length}/${CONTROLS.length} controls behaved as specified`);
	return 0;
}

main().then((code) => process.exit(code));
