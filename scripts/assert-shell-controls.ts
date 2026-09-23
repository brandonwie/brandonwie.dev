/**
 * Negative controls for `migration:shell`.
 *
 * Every defect row must make the suite exit 1, and every invariance row must
 * leave it at 0 while still CHANGING the file — a mutation that matches nothing
 * turns an invariance row into a tautology and a defect row into a coincidence.
 * That no-op guard is not hypothetical: it is what caught six placeholder-era
 * rows in the feed and article suites when Slice 3 PR 2a replaced the shell.
 *
 * Every invariance row is paired with a defect row over the SAME surface, per
 * plan.md § Slice 0's invariance rule.
 */
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import { runAssertions } from './assert-shell.ts';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	/** Route file, relative to the export root. */
	target: string;
	apply?: (html: string) => string;
	remove?: boolean;
	/** Mutates the BASELINE copy instead of the candidate. */
	side?: 'candidate' | 'baseline';
}

const EN = 'posts/giscus-sveltekit-integration.html';
const KO = 'ko/system/3b.html';
/** An off-nav route: its status line carries the temporary `5:tags*` window. */
const OFF_NAV = 'tags.html';

const HEADER = /<header\b[^>]*class="[^"]*\bterm-bar\b[^"]*"[\s\S]*?<\/header>/i;
const STATUS = /<nav\b[^>]*class="[^"]*\bterm-status\b[^"]*"[\s\S]*?<\/nav>/i;
const FOOTER = /<footer\b[^>]*class="[^"]*\bterm-plan\b[^"]*"[\s\S]*?<\/footer>/i;

/**
 * Applies `edit` inside the first match of `container` only, so a mutation
 * aimed at the chrome can never land on an identical string in the article.
 */
function within(container: RegExp, edit: (region: string) => string): (html: string) => string {
	return (html) => html.replace(container, (region) => edit(region));
}

// REDESIGN: every candidate-side mutation now targets the Phosphor Fade shell
// (`header.term-bar`, `nav.term-status`, `footer.term-plan`); baseline-side
// controls (SC-13/14/15) still target the Svelte chrome, which is unchanged.
const CONTROLS: Control[] = [
	{
		id: 'SC-01',
		kind: 'DEFECT',
		what: 'the entire title bar is removed from a Korean route (SH-01)',
		target: KO,
		apply: (html) => html.replace(HEADER, ''),
	},
	{
		id: 'SC-02',
		kind: 'DEFECT',
		what: 'the entire footer is removed from a Korean route (SH-02)',
		target: KO,
		apply: (html) => html.replace(FOOTER, ''),
	},
	{
		id: 'SC-03',
		kind: 'DEFECT',
		what: 'a status-line window is relocated into main, where it must not count (SH-03)',
		target: EN,
		apply: (html) => {
			const link = /<a\b[^>]*href="\/study"[^>]*>2:study<\/a>/i.exec(html);
			if (!link) return html;
			return html
				.replace(link[0], '')
				.replace(/(<main\b[^>]*id="main-content"[^>]*>)/i, `$1${link[0]}`);
		},
	},
	{
		id: 'SC-04',
		kind: 'DEFECT',
		// REDESIGN: was "a nav link loses its label"; labels are no longer compared, destinations are.
		what: 'a fixed status-line window keeps its name but points somewhere else (SH-03)',
		target: EN,
		apply: within(STATUS, (nav) => nav.replace('href="/study"', 'href="/elsewhere"')),
	},
	{
		id: 'SC-05',
		kind: 'DEFECT',
		what: 'the current window moves to a different section (SH-04)',
		target: KO,
		apply: within(STATUS, (nav) =>
			nav
				.replace(
					/<a class="is-on" aria-current="page" href="\/ko\/system\/3b">3:3b<span aria-hidden="true">\*<\/span><\/a>/,
					'<a href="/ko/system/3b">3:3b</a>',
				)
				.replace(
					'<a href="/ko/posts">1:posts</a>',
					'<a class="is-on" aria-current="page" href="/ko/posts">1:posts<span aria-hidden="true">*</span></a>',
				),
		),
	},
	{
		id: 'SC-06',
		kind: 'DEFECT',
		what: 'a footer column link points somewhere else (SH-05)',
		target: EN,
		apply: within(FOOTER, (footer) => footer.replace('href="/tags"', 'href="/elsewhere"')),
	},
	{
		id: 'SC-07',
		kind: 'DEFECT',
		what: 'the skip link loses its target (SH-06)',
		target: EN,
		apply: (html) => html.replace('href="#main-content"', 'href="#gone"'),
	},
	{
		id: 'SC-08',
		kind: 'INVARIANCE',
		what: 'whitespace inside the status line does not move any row — paired with SC-03/04/20',
		target: EN,
		apply: (html) => html.replace('<nav class="term-status"', '<nav  class="term-status"'),
	},
	{
		id: 'SC-09',
		kind: 'INVARIANCE',
		what: 'a Svelte-style scoped class on the current window is ignored — paired with SC-05/17/18',
		target: EN,
		apply: within(STATUS, (nav) => nav.replace('class="is-on"', 'class="is-on svelte-deadbeef"')),
	},
	{
		id: 'SC-10',
		kind: 'INVARIANCE',
		what: 'a comment between window-name text nodes is ignored — paired with SC-04',
		target: EN,
		apply: within(STATUS, (nav) => nav.replace('>2:study<', '>2:<!-- -->study<')),
	},
	/**
	 * SC-11..SC-15 are the implementation-review findings, executed. The first
	 * four cover false-green cases the suite genuinely had; the last proves the
	 * fallback recognition is evidence-driven rather than a hole.
	 */
	{
		id: 'SC-11',
		kind: 'DEFECT',
		what: 'the candidate title bar exists only inside an HTML comment (SH-01)',
		target: EN,
		apply: (html) => html.replace(HEADER, (match) => `<!--${match}-->`),
	},
	{
		id: 'SC-12',
		kind: 'DEFECT',
		what: 'the candidate footer exists only inside an HTML comment (SH-02)',
		target: EN,
		apply: (html) => html.replace(FOOTER, (match) => `<!--${match}-->`),
	},
	{
		id: 'SC-13',
		kind: 'DEFECT',
		what: 'the baseline header is missing, so there is nothing to compare against',
		target: EN,
		side: 'baseline',
		apply: (html) =>
			html.replace(/<header\b[^>]*class="[^"]*site-nav[^"]*"[\s\S]*?<\/header>/i, ''),
	},
	{
		id: 'SC-14',
		kind: 'DEFECT',
		what: 'the baseline footer is missing, so there is nothing to compare against',
		target: EN,
		side: 'baseline',
		apply: (html) =>
			html.replace(/<footer\b[^>]*class="[^"]*site-footer[^"]*"[\s\S]*?<\/footer>/i, ''),
	},
	/**
	 * SC-16 is a review finding, executed. SH-06 searched every link in the
	 * document, so a skip link MOVED below the header still satisfied it -- and
	 * a skip link that follows the chrome cannot skip the chrome. The mutation
	 * relocates the link rather than deleting it, which is the whole point:
	 * deletion was already caught, relocation was not.
	 */
	{
		id: 'SC-16',
		kind: 'DEFECT',
		what: 'the skip link is relocated below the title bar, where it can no longer skip the chrome (SH-06)',
		target: EN,
		apply: (html) => {
			const link = /<a\b[^>]*class="[^"]*\bskip-link\b[^"]*"[\s\S]*?<\/a>/i.exec(html);
			if (!link) return html;
			return html.replace(link[0], '').replace(HEADER, (header) => `${header}${link[0]}`);
		},
	},
	{
		id: 'SC-15',
		kind: 'DEFECT',
		what: 'the SPA fallback stops booting, so it is no longer recognized and must be compared strictly',
		target: '404.html',
		side: 'baseline',
		apply: (html) => html.replace(/kit\.start\s*\(/, 'kit.notStart('),
	},
	/**
	 * SC-17..SC-25 cover the functions the terminal shell re-expresses: the
	 * status line's marking rules (SH-04), the locale home and the temporary
	 * window (SH-03/04), and the footer's accessible labels (SH-05).
	 */
	{
		id: 'SC-17',
		kind: 'DEFECT',
		what: 'the current window keeps is-on but drops aria-current (SH-04)',
		target: EN,
		apply: within(STATUS, (nav) => nav.replace(' aria-current="page"', '')),
	},
	{
		id: 'SC-18',
		kind: 'DEFECT',
		what: 'a second window is also marked current (SH-04)',
		target: EN,
		apply: within(STATUS, (nav) =>
			nav.replace('<a href="/study">', '<a class="is-on" aria-current="page" href="/study">'),
		),
	},
	{
		id: 'SC-19',
		kind: 'DEFECT',
		what: 'the temporary window on an off-nav route points away from the route itself (SH-04)',
		target: OFF_NAV,
		apply: within(STATUS, (nav) => nav.replace('href="/tags"', 'href="/elsewhere"')),
	},
	{
		id: 'SC-20',
		kind: 'DEFECT',
		what: 'the status line exists only inside an HTML comment (SH-01)',
		target: EN,
		apply: (html) => html.replace(STATUS, (match) => `<!--${match}-->`),
	},
	{
		id: 'SC-21',
		kind: 'DEFECT',
		what: 'two footer links swap places (SH-05 order)',
		target: EN,
		apply: within(FOOTER, (footer) => {
			const about = /<a\b[^>]*href="\/about"[^>]*>[\s\S]*?<\/a>/i.exec(footer)?.[0];
			const posts = /<a\b[^>]*href="\/posts"[^>]*>[\s\S]*?<\/a>/i.exec(footer)?.[0];
			if (!about || !posts) return footer;
			return footer.replace(about, '\u0000').replace(posts, about).replace('\u0000', posts);
		}),
	},
	{
		id: 'SC-22',
		kind: 'DEFECT',
		what: 'a footer link keeps only its aria-hidden [n] and loses its accessible label (SH-05)',
		target: EN,
		apply: within(FOOTER, (footer) =>
			footer.replace(
				// React emits `[<!-- -->6<!-- -->]`; the optional comment groups absorb it.
				/(href="\/tags"><span class="n" aria-hidden="true">\[(?:<!-- -->)?\d+(?:<!-- -->)?\]<\/span>)Tags/,
				'$1',
			),
		),
	},
	{
		id: 'SC-23',
		kind: 'INVARIANCE',
		what: 'the aria-hidden [n] decoration on a footer link is not part of its label — paired with SC-22',
		target: EN,
		apply: within(FOOTER, (footer) =>
			footer.replace(
				/(href="\/tags"><span class="n" aria-hidden="true">\[(?:<!-- -->)?)(\d+)/,
				(_, open: string, n: string) => `${open}0${n}`,
			),
		),
	},
	{
		id: 'SC-24',
		kind: 'DEFECT',
		what: 'the home window on an English route points at the Korean home (SH-03)',
		target: EN,
		apply: within(STATUS, (nav) =>
			nav.replace('<a href="/">0:home</a>', '<a href="/ko">0:home</a>'),
		),
	},
	{
		id: 'SC-25',
		kind: 'DEFECT',
		what: 'the temporary window on an off-nav route is present but no longer marked current (SH-04)',
		target: OFF_NAV,
		apply: within(STATUS, (nav) =>
			nav.replace(' class="is-on" aria-current="page" href="/tags"', ' href="/tags"'),
		),
	},
];

function fingerprint(file: string): string {
	if (!existsSync(file)) return 'absent';
	return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * Run controls against `next/build` and `build`; no CLI parameters are read.
 * Creates and removes scratch copies, leaving the original exports untouched.
 * Returns 0 when all outcomes match, 1 for failures, or 2 for missing exports.
 */
async function main(): Promise<number> {
	const source = resolve('next/build');
	const baseline = resolve('build');
	const scratch = resolve('.migration-shell-controls');
	if (!existsSync(source) || !existsSync(baseline)) {
		console.error('missing export: run pnpm build first');
		return 2;
	}

	const scratchBaseline = resolve('.migration-shell-controls-baseline');
	// Imported, not spawned. `migration-route.ts` derives a suite's input set
	// from its entry's transitive imports, and a spawn edge is invisible to that
	// closure -- so while this ran the suite as a subprocess, editing
	// `assert-shell.ts` selected `migration:shell` but NOT these controls, and
	// the negative controls skipped the very change they exist to police. Every
	// sibling controls suite imports its `runAssertions` for the same reason.
	const exec = (dir: string, baseDir: string): number => runAssertions(dir, baseDir, true);

	rmSync(scratch, { recursive: true, force: true });
	cpSync(source, scratch, { recursive: true });
	const baselineCode = exec(scratch, baseline);
	console.log(
		`${baselineCode === 0 ? 'PASS' : 'FAIL'}  SC-00  BASELINE   exit ${baselineCode} (expected 0)  an untouched candidate is green`,
	);
	const failures: string[] = baselineCode === 0 ? [] : ['SC-00 baseline is not green'];

	for (const control of CONTROLS) {
		rmSync(scratch, { recursive: true, force: true });
		rmSync(scratchBaseline, { recursive: true, force: true });
		cpSync(source, scratch, { recursive: true });
		const onBaseline = control.side === 'baseline';
		if (onBaseline) cpSync(baseline, scratchBaseline, { recursive: true });
		const file = join(onBaseline ? scratchBaseline : scratch, control.target);
		if (!existsSync(file) || !statSync(file).isFile()) {
			failures.push(`${control.id}: target ${control.target} is missing`);
			console.log(
				`FAIL  ${control.id}  ${control.kind.padEnd(10)} MISSING TARGET  ${control.what}`,
			);
			continue;
		}
		const before = fingerprint(file);
		if (control.remove) rmSync(file);
		else if (control.apply) writeFileSync(file, control.apply(readFileSync(file, 'utf8')));
		const changed = control.remove ? !existsSync(file) : before !== fingerprint(file);
		if (!changed) {
			failures.push(`${control.id} ${control.what}: the mutation changed nothing`);
			console.log(
				`FAIL  ${control.id}  ${control.kind.padEnd(10)} NO-OP MUTATION  ${control.what}`,
			);
			continue;
		}
		const code = exec(scratch, onBaseline ? scratchBaseline : baseline);
		const expected = control.kind === 'DEFECT' ? 1 : 0;
		const ok = code === expected;
		if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected ${expected}`);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind.padEnd(10)} exit ${code} (expected ${expected})  ${control.what}`,
		);
	}
	rmSync(scratch, { recursive: true, force: true });
	rmSync(scratchBaseline, { recursive: true, force: true });

	const defects = CONTROLS.filter((c) => c.kind === 'DEFECT').length;
	console.log(
		`\n${CONTROLS.length + 1} controls: ${defects} defect (must exit 1), ${CONTROLS.length - defects + 1} invariance/baseline (must exit 0)`,
	);
	if (failures.length > 0) {
		for (const failure of failures) console.log(`CONTROL FAILED ${failure}`);
		console.log(`RESULT: ${failures.length}/${CONTROLS.length + 1} control(s) failed`);
		return 1;
	}
	console.log(
		`RESULT: ${CONTROLS.length + 1}/${CONTROLS.length + 1} controls behaved as specified`,
	);
	return 0;
}

main().then((code) => process.exit(code));
