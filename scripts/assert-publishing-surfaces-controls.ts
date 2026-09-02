/**
 * Negative controls for the publishing-surface assertions.
 *
 *   pnpm migration:publishing:controls
 *
 * `assert-publishing-surfaces.ts` reports a row table. As with the article
 * and shell suites, that table is evidence only once every contract has been
 * observed to go red on a deliberate defect and stay green on the one benign
 * change it must ignore:
 *
 *   DEFECT      the assertions MUST exit 1 on a deliberately broken export
 *   INVARIANCE  the assertions MUST exit 0 on a change they should ignore
 *
 * The single invariance is the feed build clock, `<lastBuildDate>`, paired
 * with defects over the same files. Every control runs against a throwaway
 * copy of the candidate under `tmp/`; the real `next/build` and the Svelte
 * baseline are never mutated. Fragment controls re-encode the mutated JSON
 * behind the `pagefind_dcd` marker so the decoder sees a well-formed file.
 */
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import {
	ARTICLE_FRAGMENTS,
	decodeFragment,
	runAssertions,
	type Fragment,
} from './assert-publishing-surfaces.ts';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	/** Relative to the scratch candidate; fragments are addressed by locale. */
	target:
		| 'sitemap.xml'
		| 'rss.xml'
		| 'ko/rss.xml'
		| 'pagefind/pagefind-entry.json'
		| 'fragment:en'
		| 'fragment:ko'
		| 'fragment:synthetic';
	remove?: boolean;
	apply?: (text: string) => string;
	applyFragment?: (fragment: Fragment) => Fragment;
	/** `fragment:synthetic` only: a new fragment written into the scratch index. */
	writeFragment?: Fragment;
}

const CONTROLS: Control[] = [
	{
		id: 'PS-01',
		kind: 'DEFECT',
		what: 'one <url> entry is dropped from the sitemap',
		target: 'sitemap.xml',
		apply: (xml) => xml.replace(/\n {2}<url>[\s\S]*?<\/url>/, ''),
	},
	{
		id: 'PS-02',
		kind: 'DEFECT',
		what: 'two sitemap <loc> values swap order (same set, different sequence)',
		target: 'sitemap.xml',
		apply: (xml) => {
			const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
			const [a, b] = locs.slice(-2);
			return xml
				.replace(`<loc>${a}</loc>`, '<loc>__swap__</loc>')
				.replace(`<loc>${b}</loc>`, `<loc>${a}</loc>`)
				.replace('<loc>__swap__</loc>', `<loc>${b}</loc>`);
		},
	},
	{
		id: 'PS-03',
		kind: 'DEFECT',
		what: 'a post <lastmod> changes -- invisible to the semantic shape, caught by the byte row',
		target: 'sitemap.xml',
		apply: (xml) => xml.replace(/<lastmod>[^<]+<\/lastmod>/, '<lastmod>1970-01-01</lastmod>'),
	},
	{
		id: 'PS-04',
		kind: 'INVARIANCE',
		what: 'the English feed <lastBuildDate> moves -- the build clock is not content',
		target: 'rss.xml',
		apply: (xml) =>
			xml.replace(
				/<lastBuildDate>[^<]*<\/lastBuildDate>/,
				'<lastBuildDate>Thu, 01 Jan 1970 00:00:00 GMT</lastBuildDate>',
			),
	},
	{
		id: 'PS-05',
		kind: 'DEFECT',
		what: 'one English item <link> points at the wrong slug',
		target: 'rss.xml',
		apply: (xml) =>
			xml.replace(
				/<link>(https:\/\/brandonwie\.dev\/posts\/)[^<]+<\/link>/,
				'<link>$1not-a-post</link>',
			),
	},
	{
		id: 'PS-06',
		kind: 'DEFECT',
		what: 'one Korean item is removed',
		target: 'ko/rss.xml',
		apply: (xml) => xml.replace(/\n {4}<item>[\s\S]*?<\/item>/, ''),
	},
	{
		id: 'PS-07',
		kind: 'DEFECT',
		what: 'the Korean feed file is missing from the export',
		target: 'ko/rss.xml',
		remove: true,
	},
	{
		id: 'PS-08',
		kind: 'DEFECT',
		what: 'the Pagefind entry manifest is missing (bundle not generated)',
		target: 'pagefind/pagefind-entry.json',
		remove: true,
	},
	{
		id: 'PS-09',
		kind: 'DEFECT',
		what: 'the Korean fragment carries lang=en (a KO route indexed under the wrong facet)',
		target: 'fragment:ko',
		applyFragment: (f) => ({ ...f, filters: { ...f.filters, lang: ['en'] } }),
	},
	{
		id: 'PS-10',
		kind: 'DEFECT',
		what: "the English fragment title is Pagefind's fallback rather than the article title",
		target: 'fragment:en',
		applyFragment: (f) => ({ ...f, meta: { ...f.meta, title: 'Untitled' } }),
	},
	{
		id: 'PS-11',
		kind: 'DEFECT',
		what: 'comments-shell text leaks into the English index (an ignore region dropped)',
		target: 'fragment:en',
		applyFragment: (f) => ({ ...f, content: `${f.content} ${ARTICLE_FRAGMENTS.en.ignored[0]}` }),
	},
	{
		id: 'PS-12',
		kind: 'DEFECT',
		what: 'the English fragment is missing (article not indexed)',
		target: 'fragment:en',
		remove: true,
	},
	{
		id: 'PS-13',
		kind: 'DEFECT',
		what: 'the English fragment carries category=wrong (the category filter dropped or misplaced)',
		target: 'fragment:en',
		applyFragment: (f) => ({ ...f, filters: { ...f.filters, category: ['wrong'] } }),
	},
	{
		id: 'PS-14',
		kind: 'DEFECT',
		what: 'the English fragment body is empty (prose not indexed)',
		target: 'fragment:en',
		applyFragment: (f) => ({ ...f, content: '' }),
	},
	{
		id: 'PS-15',
		kind: 'INVARIANCE',
		what: 'the Korean feed <lastBuildDate> moves -- the build clock is not content',
		target: 'ko/rss.xml',
		apply: (xml) =>
			xml.replace(
				/<lastBuildDate>[^<]*<\/lastBuildDate>/,
				'<lastBuildDate>Thu, 01 Jan 1970 00:00:00 GMT</lastBuildDate>',
			),
	},
	{
		id: 'PS-16',
		kind: 'DEFECT',
		what: 'the sitemap file is missing from the export',
		target: 'sitemap.xml',
		remove: true,
	},
	{
		id: 'PS-17',
		kind: 'DEFECT',
		what: 'the English RSS file is missing from the export',
		target: 'rss.xml',
		remove: true,
	},
	{
		id: 'PS-18',
		kind: 'DEFECT',
		what: 'the Korean fragment title is the Pagefind fallback rather than the article title',
		target: 'fragment:ko',
		applyFragment: (f) => ({ ...f, meta: { ...f.meta, title: 'Untitled' } }),
	},
	{
		id: 'PS-19',
		kind: 'DEFECT',
		what: 'the Korean fragment carries category=wrong (the category filter dropped or misplaced)',
		target: 'fragment:ko',
		applyFragment: (f) => ({ ...f, filters: { ...f.filters, category: ['wrong'] } }),
	},
	{
		id: 'PS-20',
		kind: 'DEFECT',
		what: 'the Korean fragment body is empty (prose not indexed)',
		target: 'fragment:ko',
		applyFragment: (f) => ({ ...f, content: '' }),
	},
	{
		id: 'PS-21',
		kind: 'DEFECT',
		what: 'comments-shell text leaks into the Korean index (an ignore region dropped)',
		target: 'fragment:ko',
		applyFragment: (f) => ({ ...f, content: `${f.content} ${ARTICLE_FRAGMENTS.ko.ignored[0]}` }),
	},
	{
		id: 'PS-22',
		kind: 'DEFECT',
		what: 'the Korean fragment is missing (article not indexed)',
		target: 'fragment:ko',
		remove: true,
	},
	{
		id: 'PS-23',
		kind: 'DEFECT',
		what: 'a non-post page is indexed (the body marker leaked onto site chrome)',
		target: 'fragment:synthetic',
		writeFragment: {
			url: '/about.html',
			content: 'About Brandon Wie',
			word_count: 3,
			filters: { lang: ['en'] },
			meta: { title: 'About' },
		},
	},
	{
		id: 'PS-24',
		kind: 'DEFECT',
		what: 'the English article is indexed twice (duplicate fragment for one url)',
		target: 'fragment:synthetic',
		writeFragment: {
			url: ARTICLE_FRAGMENTS.en.url,
			content: `en ${ARTICLE_FRAGMENTS.en.prose}`,
			word_count: 6,
			filters: { lang: ['en'], category: [ARTICLE_FRAGMENTS.en.category] },
			meta: { title: ARTICLE_FRAGMENTS.en.title },
		},
	},
];

function fingerprint(file: string): string {
	return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function fragmentFile(scratch: string, locale: 'en' | 'ko'): string {
	const dir = join(scratch, 'pagefind', 'fragment');
	const want = ARTICLE_FRAGMENTS[locale].url;
	for (const name of readdirSync(dir)) {
		const file = join(dir, name);
		if (decodeFragment(file).url === want) return file;
	}
	throw new Error(`no ${locale} fragment for ${want} in ${dir}`);
}

function encodeFragment(fragment: Fragment): Buffer {
	return gzipSync(
		Buffer.concat([
			Buffer.from('pagefind_dcd', 'latin1'),
			Buffer.from(JSON.stringify(fragment), 'utf8'),
		]),
	);
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
	console.log('PASS  PS-00  BASELINE   exit 0 (expected 0)  untouched candidate is green');

	const failures: string[] = [];
	for (const control of CONTROLS) {
		const scratch = join('tmp', `publishing-control-${control.id}`);
		rmSync(scratch, { recursive: true, force: true });
		mkdirSync(scratch, { recursive: true });
		// dereference: a symlink inside the candidate would otherwise be copied as a
		// link and a later mutation could write through it to a path outside tmp/.
		cpSync(candidate, scratch, { recursive: true, dereference: true });

		const file =
			control.target === 'fragment:synthetic'
				? join(scratch, 'pagefind', 'fragment', `synthetic_${control.id}.pf_fragment`)
				: control.target.startsWith('fragment:')
					? fragmentFile(scratch, control.target.slice('fragment:'.length) as 'en' | 'ko')
					: join(scratch, control.target);
		const before = existsSync(file) ? fingerprint(file) : null;
		if (control.remove) rmSync(file);
		else if (control.writeFragment) writeFileSync(file, encodeFragment(control.writeFragment));
		else if (control.applyFragment)
			writeFileSync(file, encodeFragment(control.applyFragment(decodeFragment(file))));
		else if (control.apply) writeFileSync(file, control.apply(readFileSync(file, 'utf8')));
		// A mutation that matched nothing turns an INVARIANCE into a tautology
		// and a DEFECT into a coincidence; the sibling suites caught this twice.
		const changed = control.remove
			? !existsSync(file)
			: control.writeFragment
				? before === null && existsSync(file)
				: before !== fingerprint(file);
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
			`RESULT: ${failures.length}/${total} control(s) failed -- the publishing assertions do not fail closed`,
		);
		return 1;
	}
	console.log(`RESULT: ${total}/${total} controls behaved as specified`);
	return 0;
}

main().then((code) => process.exit(code));
