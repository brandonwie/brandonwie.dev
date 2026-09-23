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
 * PC-02: each frame label names the fence language. The Shiki step stamps
 * `data-language` on every highlighted `<pre>` and CodeCopy renders the label
 * as `<language> · <n> lines`. For every `pre.shiki` the label's first token
 * must equal the fence's info string, read from the post's markdown source in
 * document order (mermaid fences never reach Shiki; fences with no language
 * are not highlighted, so both are skipped). The routes cover typescript,
 * bash, and a mixed text/sh/python/js post, so aliases (`sh`, `js`) and the
 * explicit `text` fence are exercised.
 *
 * Positive controls (must FAIL):
 *   node scripts/assert-browser-post-code.mjs --clip
 * removes the spacer before measuring, which restores the PC-01 defect.
 *   node scripts/assert-browser-post-code.mjs --no-lang
 * strips `data-language` from every `<pre>` as the document is parsed, before
 * CodeCopy reads it, so every label falls back to `text` and PC-02 fails.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { readFileSync } from 'node:fs';

import { launch, serve, ready, evaluate, findBrowser, EXIT } from './browser-probe.mjs';

/** Route -> the markdown source its code fences come from. */
const ROUTES = {
	'/posts/sync-token-invalidation-recovery':
		'src/content/posts/en/backend/sync-token-invalidation-recovery.md',
	'/ko/posts/bash-set-e-command-substitution':
		'src/content/posts/ko/devops/bash-set-e-command-substitution.md',
	'/posts/test-L-vs-realpath-symlink-detection':
		'src/content/posts/en/devops/test-L-vs-realpath-symlink-detection.md',
};
const CLIP = process.argv.includes('--clip');
const NO_LANG = process.argv.includes('--no-lang');

/** Fence languages in document order, as Shiki will see them. */
function fenceLanguages(file) {
	const langs = [];
	let open = null;
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const m = line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/);
		if (!m) continue;
		if (open === null) {
			open = m[1];
			if (m[2] && m[2] !== 'mermaid') langs.push(m[2]);
		} else if (m[1][0] === open[0] && m[1].length >= open.length && !m[2]) {
			open = null;
		}
	}
	return langs;
}

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
		if (NO_LANG) {
			await page.send('Page.addScriptToEvaluateOnNewDocument', {
				source: `new MutationObserver(() => {
					for (const pre of document.querySelectorAll('pre[data-language]')) pre.removeAttribute('data-language');
				}).observe(document, { childList: true, subtree: true });`,
			});
		}
		for (const [route, source] of Object.entries(ROUTES)) {
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

			await ready(
				page,
				"[...document.querySelectorAll('.prose-terminal pre.shiki')].every((p) => p.querySelector('.pg-code__label'))",
				{ timeoutMs: 15000 },
			);
			const labels = JSON.parse(
				await evaluate(
					page,
					`JSON.stringify([...document.querySelectorAll('.prose-terminal pre.shiki')].map((p) => p.querySelector(':scope > .pg-code__label')?.textContent ?? null))`,
				),
			);
			const expected = fenceLanguages(source);
			const got = labels.map((l) => (l === null ? null : l.split(' ')[0]));
			const wrong = expected
				.map((lang, i) => [i, lang, got[i]])
				.filter(([, lang, g]) => lang !== g);
			const langOk = expected.length > 0 && got.length === expected.length && wrong.length === 0;
			if (!langOk) failed += 1;
			console.log(
				`${langOk ? 'PASS' : 'FAIL'}  PC-02 ${route}  ${got.length} label(s) for ${expected.length} fence(s) [${got.join(', ')}]${wrong.length ? `; mismatches ${wrong.map(([i, e, g]) => `#${i} want ${e} got ${g}`).join(', ')}` : ''}`,
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
