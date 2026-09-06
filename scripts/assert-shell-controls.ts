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
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

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

const CONTROLS: Control[] = [
	{
		id: 'SC-01',
		kind: 'DEFECT',
		what: 'the entire header is removed from a Korean route',
		target: KO,
		apply: (html) =>
			html.replace(/<header\b[^>]*class="[^"]*site-nav[^"]*"[\s\S]*?<\/header>/i, ''),
	},
	{
		id: 'SC-02',
		kind: 'DEFECT',
		what: 'the entire footer is removed from a Korean route',
		target: KO,
		apply: (html) =>
			html.replace(/<footer\b[^>]*class="[^"]*site-footer[^"]*"[\s\S]*?<\/footer>/i, ''),
	},
	{
		id: 'SC-03',
		kind: 'DEFECT',
		what: 'a nav link is relocated out of the header into main, where it must not count',
		target: EN,
		apply: (html) => {
			const link = /<a\b[^>]*class="[^"]*site-nav__link[^"]*"[\s\S]*?<\/a>/i.exec(html);
			if (!link) return html;
			return html
				.replace(link[0], '')
				.replace(/(<main\b[^>]*id="main-content"[^>]*>)/i, `$1${link[0]}`);
		},
	},
	{
		id: 'SC-04',
		kind: 'DEFECT',
		what: 'a nav link keeps its place but loses its label',
		target: EN,
		apply: (html) =>
			html.replace(/(<a\b[^>]*class="[^"]*site-nav__link[^"]*"[^>]*>)[\s\S]*?(<\/a>)/i, '$1$2'),
	},
	{
		id: 'SC-05',
		kind: 'DEFECT',
		what: 'the active nav item moves to a different section',
		target: KO,
		apply: (html) =>
			html
				.replace(
					/ class="site-nav__link is-active" aria-current="page"/i,
					' class="site-nav__link"',
				)
				.replace(
					/(<a\b[^>]*href="\/ko\/posts"[^>]*)class="site-nav__link"/i,
					'$1class="site-nav__link is-active" aria-current="page"',
				),
	},
	{
		id: 'SC-06',
		kind: 'DEFECT',
		what: 'a footer column link points somewhere else',
		target: EN,
		apply: (html) => html.replace('href="/tags"', 'href="/elsewhere"'),
	},
	{
		id: 'SC-07',
		kind: 'DEFECT',
		what: 'the skip link loses its target',
		target: EN,
		apply: (html) => html.replace('href="#main-content"', 'href="#gone"'),
	},
	{
		id: 'SC-08',
		kind: 'INVARIANCE',
		what: 'whitespace inside the header does not move any row — paired with SC-01/03/04',
		target: EN,
		apply: (html) => html.replace('<nav class="site-nav__links"', '<nav  class="site-nav__links"'),
	},
	{
		id: 'SC-09',
		kind: 'INVARIANCE',
		what: 'a Svelte-style scoped class on a nav link is ignored — paired with SC-04/06',
		target: EN,
		apply: (html) =>
			html.replace('class="site-nav__link"', 'class="site-nav__link svelte-deadbeef"'),
	},
	{
		id: 'SC-10',
		kind: 'INVARIANCE',
		what: 'a comment between label text nodes is ignored — paired with SC-04',
		target: EN,
		apply: (html) => html.replace('~/<!-- -->', '~/<!-- --><!-- -->'),
	},
	/**
	 * SC-11..SC-15 are the implementation-review findings, executed. The first
	 * four cover false-green cases the suite genuinely had; the last proves the
	 * fallback recognition is evidence-driven rather than a hole.
	 */
	{
		id: 'SC-11',
		kind: 'DEFECT',
		what: 'the candidate header exists only inside an HTML comment',
		target: EN,
		apply: (html) =>
			html.replace(
				/<header\b[^>]*class="[^"]*site-nav[^"]*"[\s\S]*?<\/header>/i,
				(match) => `<!--${match}-->`,
			),
	},
	{
		id: 'SC-12',
		kind: 'DEFECT',
		what: 'the candidate footer exists only inside an HTML comment',
		target: EN,
		apply: (html) =>
			html.replace(
				/<footer\b[^>]*class="[^"]*site-footer[^"]*"[\s\S]*?<\/footer>/i,
				(match) => `<!--${match}-->`,
			),
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
	{
		id: 'SC-15',
		kind: 'DEFECT',
		what: 'the SPA fallback stops booting, so it is no longer recognized and must be compared strictly',
		target: '404.html',
		side: 'baseline',
		apply: (html) => html.replace(/kit\.start\s*\(/, 'kit.notStart('),
	},
];

function fingerprint(file: string): string {
	if (!existsSync(file)) return 'absent';
	return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main(): Promise<number> {
	const source = resolve('next/build');
	const baseline = resolve('build');
	const scratch = resolve('.migration-shell-controls');
	if (!existsSync(source) || !existsSync(baseline)) {
		console.error('missing export: run pnpm build first');
		return 2;
	}

	const scratchBaseline = resolve('.migration-shell-controls-baseline');
	const exec = (dir: string, baseDir: string): number => {
		const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/assert-shell.ts', dir, baseDir], {
			stdio: 'ignore',
		});
		return result.status ?? 1;
	};

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
