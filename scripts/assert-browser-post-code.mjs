/**
 * migration:browser:post-code — post code frames show every line.
 *
 * Found in the redesign's cross-page pass: each Shiki `<code>` in a post is an
 * overflow container (`overflow-x: auto`, so `overflow-y` clips), and its last
 * line box overflowed the content box by ~11px, cutting the final line in
 * half. The fix is a spacer block after the code (`code::after`). This probe
 * loads posts with code in a real browser and requires, for every
 * `pre.shiki > code`, `scrollHeight <= clientHeight` (nothing hidden
 * vertically) and at least one block per route, so it cannot pass vacuously.
 *
 * Positive control (must FAIL):
 *   node scripts/assert-browser-post-code.mjs --clip
 * removes the spacer before measuring, which restores the defect.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { launch, serve, ready, evaluate, findBrowser, EXIT } from './browser-probe.mjs';

const ROUTES = [
	'/posts/sync-token-invalidation-recovery',
	'/ko/posts/bash-set-e-command-substitution',
];
const CLIP = process.argv.includes('--clip');

async function main() {
	if (!findBrowser()) {
		console.log('SKIPPED  no browser available');
		return EXIT.SKIPPED;
	}
	const server = await serve('next/build');
	let page;
	let failed = 0;
	try {
		page = await launch();
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		await page.send('Emulation.setDeviceMetricsOverride', {
			width: 1280,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		for (const route of ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route}` });
			await ready(page, "document.querySelectorAll('pre.shiki > code').length > 0", {
				timeoutMs: 15000,
			});
			const raw = await evaluate(
				page,
				`(() => {
					${CLIP ? `const s = document.createElement('style'); s.textContent = '.pg-post .prose-terminal pre.shiki > code::after { content: none !important; }'; document.head.appendChild(s);` : ''}
					return JSON.stringify([...document.querySelectorAll('pre.shiki > code')].map((c) => [c.clientHeight, c.scrollHeight]));
				})()`,
			);
			const blocks = JSON.parse(raw);
			const clipped = blocks.filter(([client, scroll]) => scroll > client);
			const ok = blocks.length > 0 && clipped.length === 0;
			if (!ok) failed += 1;
			console.log(
				`${ok ? 'PASS' : 'FAIL'}  PC-01 ${route}  ${blocks.length} code block(s), ${clipped.length} clipped${clipped.length ? ` (client/scroll ${clipped.map((b) => b.join('/')).join(' ')})` : ''}`,
			);
		}
		return failed === 0 ? EXIT.PASS : EXIT.FAIL;
	} finally {
		await page?.close();
		await server.close();
	}
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(`ERROR ${error.message}`);
		process.exit(EXIT.ERROR);
	});
