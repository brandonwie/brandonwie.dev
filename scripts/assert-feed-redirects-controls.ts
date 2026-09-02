/**
 * Negative controls for the /feed, /ko/feed and `_redirects` assertions.
 *
 *   pnpm migration:feed:controls
 *
 * `assert-feed-redirects.ts` reports a row table. As with the sibling suites,
 * that table is evidence only once every contract has been observed to go red
 * on a deliberate defect and stay green on the changes it must ignore:
 *
 *   DEFECT      the assertions MUST exit 1 on a deliberately broken export
 *   INVARIANCE  the assertions MUST exit 0 on a change they should ignore
 *
 * The lattice: every page-owned predicate has a DEFECT on BOTH locales (title,
 * description, canonical, h1, crumb, lede, campaign count, chip order, date,
 * cluster id, topic, chip label, chip href, blog chip locale prefix, `rel`,
 * `target`, the canonical-chip class, the empty state, `<html lang>`, the page
 * file itself); `_redirects` has a missing-file, dropped-rule, swapped-order,
 * status-code and whitespace-only DEFECT; and the INVARIANCES are shell-owned
 * changes on both locales -- the footer text and an extra nav link -- which
 * the page-owned assertions must not see.
 *
 * Two predicates cannot be exercised on the current snapshot and are stated
 * rather than faked: with ONE campaign, campaign-level reordering is
 * indistinguishable from a count change (the same sequence comparison covers
 * it; chip order within the campaign is exercised instead), and with no
 * `blog_slug` the blog chip is injected rather than mutated.
 *
 * Every control runs against a throwaway copy of the candidate under `tmp/`;
 * the real `next/build` and the Svelte baseline are never mutated.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FEED_PAGES, REDIRECTS, runAssertions } from './assert-feed-redirects.ts';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	/** Relative to the scratch candidate. */
	target: string;
	remove?: boolean;
	apply?: (text: string) => string;
}

/** A page mutation, expanded once per locale below. */
interface PageMutation {
	kind: Kind;
	what: (path: string) => string;
	remove?: boolean;
	apply?: (html: string, locale: 'en' | 'ko') => string;
}

const REDIRECT_CONTROLS: Omit<Control, 'id'>[] = [
	{
		kind: 'DEFECT',
		what: '_redirects is missing from the export',
		target: REDIRECTS,
		remove: true,
	},
	{
		kind: 'DEFECT',
		what: 'the second _redirects rule (/ko/stats) is dropped',
		target: REDIRECTS,
		apply: (text) => text.replace(/\n[^\n]*\n$/, '\n'),
	},
	{
		kind: 'DEFECT',
		what: 'the two _redirects rules swap order (same set, different sequence)',
		target: REDIRECTS,
		apply: (text) => `${text.trimEnd().split('\n').reverse().join('\n')}\n`,
	},
	{
		kind: 'DEFECT',
		what: 'a _redirects status code changes 302 -> 301',
		target: REDIRECTS,
		apply: (text) => text.replace(' 302\n', ' 301\n'),
	},
	{
		kind: 'DEFECT',
		what: "a whitespace-only change to _redirects -- invisible to the comparator's collapsed hash, caught by the byte row",
		target: REDIRECTS,
		apply: (text) => text.replace(/ (\d{3})\n/, '  $1\n'),
	},
];

const PAGE_MUTATIONS: PageMutation[] = [
	{
		kind: 'DEFECT',
		what: (p) => `the ${p} page file is missing from the export`,
		remove: true,
	},
	{
		kind: 'DEFECT',
		what: (p) => `the ${p} <title> is wrong`,
		apply: (html) =>
			html.replace(/<title>[^<]*<\/title>/, '<title>Wrong title | Brandon Wie</title>'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `the ${p} meta description is wrong`,
		apply: (html) =>
			html.replace(/(<meta name="description" content=")[^"]*(")/, '$1Wrong description.$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `the ${p} canonical points at another origin`,
		apply: (html) =>
			html.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1https://example.com/feed$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `the ${p} <h1> is wrong`,
		apply: (html) => html.replace(/(<h1\b[^>]*>)[^<]*(<\/h1>)/, '$1Wrong heading$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `the ${p} crumb does not spell the path`,
		apply: (html) => html.replace(/(<div class="crumb">)[^<]*(<\/div>)/, '$1~/wrong$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `the ${p} lede is wrong`,
		apply: (html) => html.replace(/(<p class="feed__lede">)[^<]*(<\/p>)/, '$1Wrong lede.$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `a campaign is dropped from ${p} (count)`,
		apply: (html) => html.replace(/<li class="campaign">[\s\S]*?<\/ul><\/li>/, ''),
	},
	{
		kind: 'DEFECT',
		what: (p) => `two chips in ${p} swap order (same set, different sequence)`,
		apply: (html) => {
			const items = [...html.matchAll(/<li><a class="chip[^"]*"[\s\S]*?<\/a><\/li>/g)].map(
				(m) => m[0],
			);
			const [a, b] = items;
			return html.replace(a, '__swap__').replace(b, a).replace('__swap__', b);
		},
	},
	{
		kind: 'DEFECT',
		what: (p) => `a campaign <time datetime> in ${p} changes while its text does not`,
		apply: (html) => html.replace(/<time dateTime="[^"]*">/i, '<time dateTime="1970-01-01">'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `a campaign cluster id in ${p} is wrong`,
		apply: (html) =>
			html.replace(/(<span class="campaign__id">)[^<]*(<\/span>)/, '$1wrong-cluster$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `a campaign topic in ${p} is wrong`,
		apply: (html) => html.replace(/(<h2 class="campaign__topic">)[^<]*(<\/h2>)/, '$1Wrong topic$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `a chip label in ${p} is wrong`,
		apply: (html) => html.replace(/(<a class="chip"[^>]*>)LinkedIn(<\/a>)/, '$1Facebook$2'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `a chip href in ${p} points at the wrong post`,
		apply: (html) =>
			html.replace(
				/(<a class="chip[^"]*" href=")https:\/\/x\.com\/[^"]*(")/,
				'$1https://x.com/BrandonWie/status/0$2',
			),
	},
	{
		kind: 'DEFECT',
		what: (p) => `a blog chip in ${p} carries the other locale's prefix`,
		apply: (html, locale) =>
			html.replace(
				'<ul class="campaign__links">',
				`<ul class="campaign__links"><li><a class="chip chip--blog" href="${locale === 'ko' ? '' : '/ko'}/posts/some-post">Blog post</a></li>`,
			),
	},
	{
		kind: 'DEFECT',
		what: (p) => `an external chip in ${p} loses rel="noopener noreferrer"`,
		apply: (html) => html.replace(' rel="noopener noreferrer">', '>'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `an external chip in ${p} loses target="_blank"`,
		apply: (html) => html.replace(' target="_blank"', ''),
	},
	{
		kind: 'DEFECT',
		what: (p) => `the canonical chip in ${p} loses its chip--canonical class`,
		apply: (html) => html.replace('class="chip chip--canonical"', 'class="chip"'),
	},
	{
		kind: 'DEFECT',
		what: (p) => `${p} renders the empty-state paragraph alongside the campaign list`,
		apply: (html) =>
			html.replace(
				/(<header class="feed__head">[\s\S]*?<\/header>)/,
				'$1<p class="feed__empty">Nothing published yet.</p>',
			),
	},
	{
		kind: 'DEFECT',
		what: (p) => `${p} ships <html lang> of the other locale`,
		apply: (html, locale) =>
			html.replace(/<html lang="[^"]*"/, `<html lang="${locale === 'ko' ? 'en' : 'ko'}"`),
	},
	{
		kind: 'INVARIANCE',
		what: (p) => `the site footer text on ${p} changes -- shell-owned, not page-owned`,
		apply: (html) =>
			html.replace(/(<div class="site-footer-inner">)[^<]*(<\/div>)/, '$1Different footer.$2'),
	},
	{
		kind: 'INVARIANCE',
		what: (p) => `a nav link is added to the site shell on ${p} -- shell-owned, not page-owned`,
		apply: (html) =>
			html.replace(
				'<ul class="site-links">',
				'<ul class="site-links"><li><a href="/posts">Posts</a></li>',
			),
	},
];

function expand(): Control[] {
	const controls: Control[] = [];
	let n = 1;
	const id = (): string => `FR-${String(n++).padStart(2, '0')}`;
	for (const control of REDIRECT_CONTROLS) controls.push({ id: id(), ...control });
	for (const mutation of PAGE_MUTATIONS)
		for (const locale of ['en', 'ko'] as const) {
			const page = FEED_PAGES[locale];
			const apply = mutation.apply;
			controls.push({
				id: id(),
				kind: mutation.kind,
				what: mutation.what(page.path),
				target: page.file,
				remove: mutation.remove,
				apply: apply ? (html) => apply(html, locale) : undefined,
			});
		}
	return controls;
}

const CONTROLS: Control[] = expand();

function fingerprint(file: string): string {
	return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main(): Promise<number> {
	const candidate = process.argv[2] ?? 'next/build';
	const baseline = process.argv[3] ?? 'build';
	if (!existsSync(candidate) || !existsSync(baseline)) {
		console.error(`FATAL: need both ${candidate} and ${baseline}; build first`);
		return 2;
	}
	const clean = await runAssertions(candidate, baseline, true);
	if (clean !== 0) {
		console.error(
			`FATAL: the untouched candidate exits ${clean}; controls need a green starting point`,
		);
		return 2;
	}
	console.log('PASS  FR-00  BASELINE   exit 0 (expected 0)  untouched candidate is green');

	const failures: string[] = [];
	for (const control of CONTROLS) {
		const scratch = join('tmp', `feed-control-${control.id}`);
		rmSync(scratch, { recursive: true, force: true });
		mkdirSync(scratch, { recursive: true });
		// dereference: a symlink inside the candidate would otherwise be copied as a
		// link and a later mutation could write through it to a path outside tmp/.
		cpSync(candidate, scratch, { recursive: true, dereference: true });

		const file = join(scratch, control.target);
		const before = existsSync(file) ? fingerprint(file) : null;
		if (control.remove) rmSync(file);
		else if (control.apply) writeFileSync(file, control.apply(readFileSync(file, 'utf8')));
		// A mutation that matched nothing turns an INVARIANCE into a tautology
		// and a DEFECT into a coincidence; the sibling suites caught this twice.
		const changed = control.remove ? !existsSync(file) : before !== fingerprint(file);
		if (!changed) {
			failures.push(`${control.id} ${control.what}: the mutation changed nothing`);
			console.log(
				`FAIL  ${control.id}  ${control.kind.padEnd(10)} NO-OP MUTATION  ${control.what}`,
			);
			rmSync(scratch, { recursive: true, force: true });
			continue;
		}
		const code = await runAssertions(scratch, baseline, true);
		const expected = control.kind === 'DEFECT' ? 1 : 0;
		const ok = code === expected;
		if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected ${expected}`);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind.padEnd(10)} exit ${code} (expected ${expected})  ${control.what}`,
		);
		rmSync(scratch, { recursive: true, force: true });
	}

	const total = CONTROLS.length + 1;
	const defects = CONTROLS.filter((c) => c.kind === 'DEFECT').length;
	console.log(
		`\n${total} controls: ${defects} defect (must exit 1), ${total - defects} invariance/baseline (must exit 0)`,
	);
	if (failures.length) {
		for (const line of failures) console.error(`CONTROL FAILED ${line}`);
		console.error(
			`RESULT: ${failures.length}/${total} control(s) failed -- the feed assertions do not fail closed`,
		);
		return 1;
	}
	console.log(`RESULT: ${total}/${total} controls behaved as specified`);
	return 0;
}

main().then((code) => process.exit(code));
