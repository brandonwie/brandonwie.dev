/**
 * migration:browser:post-blockquote — the B2 regression row.
 *
 * B2: post blockquotes showed doubled quotation marks. The source text already
 * carries its quotes (“…”), and Tailwind Typography's `prose` utility adds its
 * own through `blockquote p:first-of-type::before { content: open-quote }` and
 * `blockquote p:last-of-type::after { content: close-quote }`. The fix drops
 * the generated pair for post prose, so the reader sees the source quotes once.
 *
 * Each row loads a post that has a blockquote in a real browser and reads the
 * COMPUTED `content` of `::before` and `::after` on every `blockquote p` inside
 * the post prose. A row passes when no paragraph generates a quote: the value
 * is `none` / `normal`, or a string with no quotation mark in it. It also
 * requires at least one blockquote paragraph, so a page that lost its
 * blockquote cannot pass vacuously.
 *
 * Positive control (must FAIL):
 *   node scripts/assert-browser-post-blockquote.mjs --reenable-quotes
 * injects the Typography plugin's own open/close-quote rules back at the
 * highest priority, which is the defect the row exists to catch.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import {
	launch,
	serve,
	ready,
	evaluate,
	mutateBehavior,
	findBrowser,
	EXIT,
} from './browser-probe.mjs';

const REENABLE_QUOTES = process.argv.includes('--reenable-quotes');

// `sync-token-invalidation-recovery` is the PostDetailPage design sample; its
// blockquote quotes Google's documentation with the quotes in the source.
const ROUTES = [
	{ id: 'PB-01', url: '/posts/sync-token-invalidation-recovery' },
	{ id: 'PB-02', url: '/ko/posts/sync-token-invalidation-recovery' },
];

const SNAPSHOT = `
(() => {
	const quoteChar = /["'\\u2018\\u2019\\u201C\\u201D\\u00AB\\u00BB\\u300C\\u300D]|open-quote|close-quote/;
	const generates = (value) => value !== 'none' && value !== 'normal' && quoteChar.test(value);
	const paragraphs = [...document.querySelectorAll('.prose-terminal blockquote p')];
	return {
		count: paragraphs.length,
		offenders: paragraphs.flatMap((p, index) =>
			['::before', '::after']
				.map((pseudo) => ({ pseudo, content: getComputedStyle(p, pseudo).content }))
				.filter(({ content }) => generates(content))
				.map(({ pseudo, content }) => 'p[' + index + ']' + pseudo + ' content=' + content),
		),
	};
})()
`;

// The Typography plugin's own rules, re-applied above everything else.
const REENABLE_SCRIPT = `
document.addEventListener('DOMContentLoaded', () => {
	const style = document.createElement('style');
	style.textContent =
		'.prose-terminal blockquote p:first-of-type::before { content: open-quote !important; }' +
		'.prose-terminal blockquote p:last-of-type::after { content: close-quote !important; }';
	document.head.appendChild(style);
});
`;

const results = [];
const report = (id, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

async function main() {
	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; set CHROME_BINARY to point at one');
		return EXIT.SKIPPED;
	}

	let server = null;
	let page = null;
	try {
		server = await serve('next/build');
		page = await launch();
		if (!page) {
			console.log('SKIP  browser could not launch');
			return EXIT.SKIPPED;
		}
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		if (REENABLE_QUOTES) await mutateBehavior(page, REENABLE_SCRIPT);

		for (const route of ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route.url}` });
			const isReady = await ready(page, "!!document.querySelector('.prose-terminal blockquote')");
			if (!isReady) {
				report(route.id, false, `${route.url} — no blockquote in the post prose`);
				continue;
			}
			const snap = await evaluate(page, SNAPSHOT);
			const problems = [];
			if (snap.count === 0) problems.push('no blockquote paragraph to check');
			if (snap.offenders.length > 0)
				problems.push(`generated quotes: ${snap.offenders.join('; ')}`);
			report(
				route.id,
				problems.length === 0,
				`${route.url} paragraphs=${snap.count}` +
					(problems.length ? ` — ${problems.join('; ')}` : ''),
			);
		}

		const passed = results.filter(Boolean).length;
		console.log(`\n${results.length} rows: ${passed} passed`);
		return passed === results.length ? EXIT.PASS : EXIT.FAIL;
	} finally {
		try {
			await page?.close();
		} catch (error) {
			console.warn(`WARN  browser teardown: ${error.message}`);
		}
		try {
			await server?.close();
		} catch (error) {
			console.warn(`WARN  server teardown: ${error.message}`);
		}
	}
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(`ERROR ${error.message}`);
		process.exit(EXIT.ERROR);
	});
