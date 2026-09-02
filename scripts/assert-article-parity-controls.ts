/**
 * Negative controls for the article parity assertions.
 *
 *   pnpm migration:article:controls
 *
 * `assert-article-parity.ts` reports a row table. That table is worth nothing
 * until each contract has been observed to go red, which is the argument
 * `migration-verify-controls.ts` makes for the comparator and
 * `assert-c13-shell-controls.ts` makes for the shell.
 *
 *   DEFECT      the assertions MUST exit 1 on a deliberately broken article
 *   INVARIANCE  the assertions MUST exit 0 on a benign change they should ignore
 *
 * Every invariance is paired with a defect over the same surface: entity
 * encoding and whitespace against the two prose defects, the rewritten handler
 * against its deletion, attribute order against the attribute values.
 *
 * Build-mutating controls run against a throwaway copy of the candidate under
 * `tmp/`; AP-16 calls the hero generator directly to prove that unsafe slugs
 * fail at its nested HTML/JavaScript quoting boundary. The real `next/build`
 * is never mutated, and the baseline is read-only throughout.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { heroBlockHtml } from '../next/src/content/hero.ts';
import { ARTICLE_SLUG, runAssertions } from './assert-article-parity.ts';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	target?: 'en' | 'ko' | 'hero' | 'cover' | 'default-cover';
	remove?: boolean;
	apply?: (html: string) => string;
}

function replaceJsonLdField(html: string, field: string, value: string): string {
	return html.replace(
		/(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/i,
		(_, open, body, close) =>
			`${open}${body.replace(new RegExp(`("${field}":")[^"]*(")`), `$1${value}$2`)}${close}`,
	);
}

const CONTROLS: Control[] = [
	{
		id: 'AP-01',
		kind: 'DEFECT',
		what: 'one word of the prose is changed',
		apply: (html) => html.replace(/\bcomments\b/, 'remarks'),
	},
	{
		id: 'AP-02',
		kind: 'DEFECT',
		what: 'an em dash reverts to the ASCII source spelling',
		apply: (html) => html.replace('—', '--'),
	},
	{
		id: 'AP-03',
		kind: 'DEFECT',
		what: 'a curly apostrophe reverts to a straight one',
		apply: (html) => html.replace('’', "'"),
	},
	{
		id: 'AP-04',
		kind: 'INVARIANCE',
		what: 'smart punctuation written as numeric entities — paired with AP-02/03',
		apply: (html) =>
			html
				.replace(/—/g, '&#8212;')
				.replace(/’/g, '&#8217;')
				.replace(/“/g, '&#8220;')
				.replace(/”/g, '&#8221;'),
	},
	{
		id: 'AP-05',
		kind: 'INVARIANCE',
		what: 'the prose is reflowed with extra whitespace — paired with AP-01',
		// Matched on the CLOSING tag alone. The first version reflowed `</p><p`,
		// which the candidate never emits — React already writes a newline there —
		// so the mutation changed nothing and the no-op guard failed the control
		// rather than letting an untested invariance report success.
		apply: (html) => html.replace(/<\/p>/g, '</p>\n\n   '),
	},
	{
		id: 'AP-06',
		kind: 'DEFECT',
		what: 'article:published_time becomes a locale date string',
		apply: (html) =>
			html.replace(
				/(property="article:published_time"[^>]*content=")[^"]*(")/,
				'$1Wed Jan 28 2026 09:00:00 GMT+0900 (Korean Standard Time)$2',
			),
	},
	{
		id: 'AP-07',
		kind: 'DEFECT',
		what: 'one article:tag is removed from a repeated set',
		apply: (html) => html.replace(/<meta property="article:tag"[^>]*\/?>/, ''),
	},
	{
		id: 'AP-08',
		kind: 'DEFECT',
		what: 'the article:* tags are emitted in a different order',
		apply: (html) => {
			const tags = [...html.matchAll(/<meta property="article:[^"]*"[^>]*\/?>/g)].map((m) => m[0]);
			let out = html;
			for (const tag of tags) out = out.replace(tag, '');
			return out.replace('</head>', `${[...tags].reverse().join('')}</head>`);
		},
	},
	{
		id: 'AP-09',
		kind: 'DEFECT',
		what: 'the hero loses its intrinsic size',
		apply: (html) => html.replace(/(<img[^>]*)width="2400" height="1260" /, '$1'),
	},
	{
		id: 'AP-10',
		kind: 'DEFECT',
		what: 'the hero loses its decoding hint',
		apply: (html) => html.replace(/(<img[^>]*) decoding="async"/, '$1'),
	},
	{
		id: 'AP-11',
		kind: 'DEFECT',
		what: 'the hero loses its fallback handler',
		apply: (html) => html.replace(/(<img[^>]*) onerror="[^"]*"/, '$1'),
	},
	{
		id: 'AP-12',
		kind: 'INVARIANCE',
		what: 'the fallback handler is spelled differently but walks the same chain — paired with AP-11',
		apply: (html) =>
			html.replace(
				/(<img[^>]*onerror=")([^"]*)(")/,
				(_, open, body, close) =>
					`${open}/* rewritten */${body.replace(/var i=this/, 'var i=this /* renamed */')}${close}`,
			),
	},
	{
		id: 'AP-14',
		kind: 'DEFECT',
		what: 'the fallback handler is replaced by inert literals naming the same URLs',
		// The reviewer's own mutation. A6 used to check that the handler TEXT
		// contained the two URLs, which this passes while doing nothing at all.
		apply: (html) =>
			html.replace(
				/(<img[^>]*onerror=")[^"]*(")/,
				`$1&quot;/og/${ARTICLE_SLUG}.png&quot;,&quot;/og/default.png&quot;$2`,
			),
	},
	{
		id: 'AP-15',
		kind: 'DEFECT',
		what: 'the fallback chain runs in the wrong order',
		// Both URLs are still present and the handler still works. Only the ORDER
		// is wrong, which no substring check can see: the default cover would be
		// tried before the post's own 1200x630 cover.
		apply: (html) =>
			html.replace(/(<img[^>]*onerror="[^"]*)stage='cover'([^"]*")/, "$1stage='default'$2"),
	},
	{
		id: 'AP-13',
		kind: 'INVARIANCE',
		what: 'the hero attributes are emitted in a different order — paired with AP-09/10',
		apply: (html) =>
			html.replace(
				/<img src="(\/hero\/[^"]*)" alt="" width="2400" height="1260"/,
				'<img width="2400" height="1260" alt="" src="$1"',
			),
	},
	{
		id: 'AP-17',
		kind: 'DEFECT',
		what: 'the Korean representative article is missing',
		target: 'ko',
		remove: true,
	},
	{
		id: 'AP-18',
		kind: 'DEFECT',
		what: 'the Korean document declares the English language',
		target: 'ko',
		apply: (html) => html.replace('<html lang="ko"', '<html lang="en"'),
	},
	{
		id: 'AP-19',
		kind: 'DEFECT',
		what: 'the Korean canonical points at the English article',
		target: 'ko',
		apply: (html) =>
			html.replace(
				/(<link[^>]*rel="canonical"[^>]*href=")[^"]*(")/,
				`$1https://brandonwie.dev/posts/${ARTICLE_SLUG}$2`,
			),
	},
	{
		id: 'AP-20',
		kind: 'DEFECT',
		what: 'the Korean JSON-LD declares English',
		target: 'ko',
		apply: (html) => html.replace('"inLanguage":"ko-KR"', '"inLanguage":"en-US"'),
	},
	{
		id: 'AP-21',
		kind: 'DEFECT',
		what: 'the English locale switch targets the wrong article',
		apply: (html) =>
			html.replace(
				`href="/ko/posts/${ARTICLE_SLUG}" hrefLang="ko"`,
				'href="/ko/posts/missing-translation" hrefLang="ko"',
			),
	},
	{
		id: 'AP-22',
		kind: 'DEFECT',
		what: 'the Korean skip link targets a missing id',
		target: 'ko',
		apply: (html) =>
			html.replace(
				'class="skip-link" href="#main-content"',
				'class="skip-link" href="#missing-main"',
			),
	},
	{
		id: 'AP-23',
		kind: 'DEFECT',
		what: 'the Korean page loses its main landmark',
		target: 'ko',
		apply: (html) =>
			html
				.replace('<main id="main-content"', '<div id="main-content"')
				.replace('</main>', '</div>'),
	},
	{
		id: 'AP-24',
		kind: 'DEFECT',
		what: 'the Korean static table of contents is removed',
		target: 'ko',
		apply: (html) => html.replace('class="article-toc"', 'class="article-outline"'),
	},
	{
		id: 'AP-25',
		kind: 'DEFECT',
		what: 'the Korean tag list is removed',
		target: 'ko',
		apply: (html) => html.replace('class="article-tags"', 'class="article-labels"'),
	},
	{
		id: 'AP-26',
		kind: 'DEFECT',
		what: 'the Korean comments mount marker is removed',
		target: 'ko',
		apply: (html) => html.replace(' data-giscus-mount="true"', ''),
	},
	{
		id: 'AP-27',
		kind: 'DEFECT',
		what: 'the English header links to a route the export does not contain',
		apply: (html) =>
			html.replace(`<a href="/posts/${ARTICLE_SLUG}">`, '<a href="/posts/missing-export">'),
	},
	{
		id: 'AP-28',
		kind: 'DEFECT',
		what: 'the Korean boundary loads the Giscus client runtime',
		target: 'ko',
		apply: (html) =>
			html.replace('</body>', '<script src="https://giscus.app/client.js"></script></body>'),
	},
	{
		id: 'AP-29',
		kind: 'DEFECT',
		what: 'the English page contains a duplicate id',
		apply: (html) => html.replace('id="comments-title"', 'id="article-toc-title"'),
	},
	{
		id: 'AP-30',
		kind: 'DEFECT',
		what: 'the English table of contents targets a missing heading',
		apply: (html) =>
			html.replace('href="#why-giscus-over-the-alternatives"', 'href="#missing-article-heading"'),
	},
	{
		id: 'AP-31',
		kind: 'DEFECT',
		what: 'the Korean article details are removed',
		target: 'ko',
		apply: (html) => html.replace('class="article-meta"', 'class="article-summary"'),
	},
	{
		id: 'AP-32',
		kind: 'DEFECT',
		what: 'the exported hero image is missing',
		target: 'hero',
		remove: true,
	},
	{
		id: 'AP-33',
		kind: 'DEFECT',
		what: 'the article-specific fallback cover is missing',
		target: 'cover',
		remove: true,
	},
	{
		id: 'AP-34',
		kind: 'DEFECT',
		what: 'the default fallback cover is missing',
		target: 'default-cover',
		remove: true,
	},
	{
		id: 'AP-35',
		kind: 'DEFECT',
		what: 'an internal link points at a directory with no exported document',
		apply: (html) => html.replace('<a href="/">', '<a href="/ko">'),
	},
	{
		id: 'AP-36',
		kind: 'DEFECT',
		what: 'an internal link uses dot segments to escape the export root',
		apply: (html) => html.replace('<a href="/">', '<a href="/%2e%2e%2f%2e%2e%2fpackage.json">'),
	},
	{
		id: 'AP-37',
		kind: 'DEFECT',
		what: 'one word of the Korean prose differs from its baseline',
		target: 'ko',
		apply: (html) => {
			const prose = html.indexOf('prose-terminal');
			if (prose === -1) return html;
			const word = html.indexOf('Giscus', prose);
			return word === -1 ? html : `${html.slice(0, word)}Disqus${html.slice(word + 6)}`;
		},
	},
	{
		id: 'AP-38',
		kind: 'INVARIANCE',
		what: 'metadata remains discoverable when the document has no closing head tag',
		apply: (html) => html.replace('</head>', ''),
	},
	{
		id: 'AP-39',
		kind: 'DEFECT',
		what: 'a category paragraph is inserted before the article title',
		apply: (html) =>
			html.replace(
				/(<header\b[^>]*class="[^"]*\barticle-header\b[^"]*"[^>]*>)/,
				'$1<p>frontend</p>',
			),
	},
	{
		id: 'AP-40',
		kind: 'DEFECT',
		what: 'JSON-LD datePublished differs from the baseline',
		apply: (html) => replaceJsonLdField(html, 'datePublished', '2000-01-01T00:00:00.000Z'),
	},
	{
		id: 'AP-41',
		kind: 'DEFECT',
		what: 'JSON-LD dateModified differs from the baseline',
		apply: (html) => replaceJsonLdField(html, 'dateModified', '2000-01-01'),
	},
	{
		id: 'AP-42',
		kind: 'DEFECT',
		what: 'the site header identity is removed while the article header remains',
		apply: (html) => html.replace('class="site-header"', 'class="shell-header"'),
	},
	{
		id: 'AP-43',
		kind: 'DEFECT',
		what: 'the site navigation identity is removed while article navigation remains',
		apply: (html) => html.replace('class="site-nav"', 'class="shell-nav"'),
	},
	{
		id: 'AP-44',
		kind: 'DEFECT',
		what: 'the site footer identity is removed while its landmark remains',
		apply: (html) => html.replace('class="site-footer"', 'class="shell-footer"'),
	},
	{
		id: 'AP-45',
		kind: 'DEFECT',
		what: 'the article shell identity is removed while its landmark remains',
		apply: (html) => html.replace('class="article-shell"', 'class="content-shell"'),
	},
];

/** Fingerprint the selected HTML or asset target so no-op mutations are detectable. */
function fingerprint(file: string): string {
	return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function controlTarget(scratch: string, target: Control['target']): string {
	switch (target) {
		case 'ko':
			return join(scratch, 'ko', 'posts', `${ARTICLE_SLUG}.html`);
		case 'hero':
			return join(scratch, 'hero', `${ARTICLE_SLUG}.png`);
		case 'cover':
			return join(scratch, 'og', `${ARTICLE_SLUG}.png`);
		case 'default-cover':
			return join(scratch, 'og', 'default.png');
		default:
			return join(scratch, 'posts', `${ARTICLE_SLUG}.html`);
	}
}

async function main(): Promise<number> {
	const source = process.argv[2] ?? 'next/build';
	const baseline = process.argv[3] ?? 'build';
	const scratch = 'tmp/article-controls';

	for (const [label, dir] of [
		['candidate', source],
		['baseline', baseline],
	] as const) {
		if (!existsSync(dir)) {
			console.error(`FATAL: ${label} build not found: ${dir}`);
			return 2;
		}
	}

	// A control suite that never sees the unbroken build passing is not a
	// baseline, it is a coincidence.
	const clean = await runAssertions(source, baseline, true);
	console.log(`BASELINE  ${source} unmodified -> exit ${clean} (expected 0)`);
	if (clean !== 0) {
		console.error(
			'FATAL: the unmodified build does not pass; fix that before trusting any control',
		);
		return 1;
	}

	mkdirSync('tmp', { recursive: true });
	const failures: string[] = [];
	const acceptedUnsafeSlugs = ["quote'slug", 'quote"slug'].filter((slug) => {
		try {
			heroBlockHtml(slug);
			return true;
		} catch {
			return false;
		}
	});
	const boundaryOk = acceptedUnsafeSlugs.length === 0;
	if (!boundaryOk) {
		failures.push(`AP-16 unsafe slug accepted: ${acceptedUnsafeSlugs.join(', ')}`);
	}
	console.log(
		`${boundaryOk ? 'PASS' : 'FAIL'}  AP-16  DEFECT     unsafe slugs are rejected before hero HTML generation`,
	);

	for (const control of CONTROLS) {
		rmSync(scratch, { recursive: true, force: true });
		cpSync(source, scratch, { recursive: true });
		const file = controlTarget(scratch, control.target);
		const before = fingerprint(file);
		if (control.remove) rmSync(file);
		else if (control.apply) writeFileSync(file, control.apply(readFileSync(file, 'utf8')));
		// A mutation that silently matched nothing turns an INVARIANCE control
		// into a tautology and a DEFECT control into a coincidence. The shell
		// suite has caught this twice; it is not a hypothetical.
		const changed = control.remove ? !existsSync(file) : before !== fingerprint(file);
		if (!changed) {
			failures.push(`${control.id} ${control.what}: the mutation changed nothing`);
			console.log(
				`FAIL  ${control.id}  ${control.kind.padEnd(10)} NO-OP MUTATION  ${control.what}`,
			);
			continue;
		}
		const code = await runAssertions(scratch, baseline, true);
		const expected = control.kind === 'DEFECT' ? 1 : 0;
		const ok = code === expected;
		if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected ${expected}`);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind.padEnd(10)} exit ${code} (expected ${expected})  ${control.what}`,
		);
	}
	rmSync(scratch, { recursive: true, force: true });

	const totalControls = CONTROLS.length + 1;
	const defects = CONTROLS.filter((c) => c.kind === 'DEFECT').length + 1;
	console.log(
		`\n${totalControls} controls: ${defects} defect (must exit 1), ${totalControls - defects} invariance (must exit 0)`,
	);
	if (failures.length) {
		for (const line of failures) console.error(`CONTROL FAILED ${line}`);
		console.error(
			`RESULT: ${failures.length}/${totalControls} control(s) failed — the article assertions do not fail closed`,
		);
		return 1;
	}
	console.log(`RESULT: ${totalControls}/${totalControls} controls behaved as specified`);
	return 0;
}

main().then((code) => process.exit(code));
