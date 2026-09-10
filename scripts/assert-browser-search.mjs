/**
 * migration:browser:search — Pagefind runtime search in a real browser.
 *
 * Asserts the C10 search runtime contract and scenarios S3, S4, S5 in Next.js:
 *   - BS-00: Readiness gate on /search and /ko/search
 *   - BS-01: EN search returns exact URL, title, category, excerpt with <mark>,
 *            and excludes ignored regions
 *   - BS-02: KO search returns exact URL, title, category, excerpt with <mark>,
 *            and excludes ignored regions
 *   - BS-03: Locale facet isolation: EN search never returns KO post; KO search
 *            never returns EN post
 *   - BS-04: Legitimate no-results renders search_no_results, NOT query error
 *   - BS-05: S3 — broken Pagefind runtime load reports load error and is NOT
 *            disguised as dev mode
 *   - BS-06: S4 — malformed index row (missing title/URL or 'Untitled') is reported
 *            as a defect rather than rendered as a normal result
 *   - BS-07: S5 — query execution failure is distinguishable from empty results
 *
 * Negative control flags:
 *   node scripts/assert-browser-search.mjs --broken-runtime  # S3 control
 *   node scripts/assert-browser-search.mjs --malformed-row   # S4 control
 *   node scripts/assert-browser-search.mjs --throw-query     # S5 control
 */
import {
	launch,
	serve,
	ready,
	evaluate,
	mutateBehavior,
	findBrowser,
	until,
	EXIT,
} from './browser-probe.mjs';

const EN_ROUTE = '/search';
const KO_ROUTE = '/ko/search';
const READY = "document.body.dataset.searchReady === 'true'";

const flag = (name) => process.argv.includes(name);
const BROKEN_RUNTIME = flag('--broken-runtime');
const MALFORMED_ROW = flag('--malformed-row');
const THROW_QUERY = flag('--throw-query');
const SUPPRESS_READY = flag('--suppress-ready');
const SUPPRESS_SEARCH = flag('--suppress-search');
const MASK_DEV_MODE = flag('--mask-dev-mode');
const MASK_MALFORMED = flag('--mask-malformed');
const MASK_QUERY_ERROR = flag('--mask-query-error');

const MALFORMED_ROW_OVERRIDE = `
	window.__pagefindOverride = {
		init: async () => {},
		debouncedSearch: async () => ({
			results: [{
				data: async () => ({
					url: '',
					meta: { title: 'Untitled' },
					excerpt: 'Malformed test excerpt',
					filters: { category: ['frontend'] },
				}),
			}],
		}),
	};
`;

const THROW_QUERY_OVERRIDE = `
	window.__pagefindOverride = {
		init: async () => {},
		debouncedSearch: async () => {
			throw new Error('Forced query execution failure for S5 control');
		},
	};
`;

const SUPPRESS_READY_BEHAVIOR = `
	setInterval(() => {
		document.body?.removeAttribute('data-search-ready');
	}, 5);
`;

const SUPPRESS_SEARCH_BEHAVIOR = `
	window.addEventListener('input', (e) => {
		e.stopImmediatePropagation();
	}, true);
`;

const MASK_DEV_MODE_BEHAVIOR = `
	window.__maskDevMode = true;
`;

const MASK_MALFORMED_BEHAVIOR = `
	window.__maskMalformed = true;
`;

const MASK_QUERY_ERROR_BEHAVIOR = `
	window.__maskQueryError = true;
`;

const results = [];
const report = (id, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

async function visit(page, server, route) {
	try {
		await evaluate(page, "document.body.removeAttribute('data-search-ready');");
	} catch {
		// page may not have an active document yet on first launch
	}
	await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route}` });
	return ready(page, READY);
}

async function typeQuery(page, text) {
	await evaluate(
		page,
		`
		(() => {
			const input = document.getElementById('site-search');
			if (input) {
				input.focus();
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
				if (setter) {
					setter.call(input, '');
				} else {
					input.value = '';
				}
				input.dispatchEvent(new Event('input', { bubbles: true }));
			}
		})()
	`,
	);
	await page.send('Input.insertText', { text });
}

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

		if (BROKEN_RUNTIME) {
			await page.send('Network.enable');
			await page.send('Network.setBlockedURLs', { urls: ['*/pagefind/pagefind.js*'] });
		}
		if (MALFORMED_ROW) {
			await mutateBehavior(page, MALFORMED_ROW_OVERRIDE);
		}
		if (THROW_QUERY) {
			await mutateBehavior(page, THROW_QUERY_OVERRIDE);
		}
		if (SUPPRESS_READY) {
			await mutateBehavior(page, SUPPRESS_READY_BEHAVIOR);
		}
		if (SUPPRESS_SEARCH) {
			await mutateBehavior(page, SUPPRESS_SEARCH_BEHAVIOR);
		}
		if (MASK_DEV_MODE) {
			await mutateBehavior(page, MASK_DEV_MODE_BEHAVIOR);
		}
		if (MASK_MALFORMED) {
			await mutateBehavior(page, MASK_MALFORMED_BEHAVIOR);
		}
		if (MASK_QUERY_ERROR) {
			await mutateBehavior(page, MASK_QUERY_ERROR_BEHAVIOR);
		}

		// --- Scenario S3 Control Run: Broken Runtime Load ---
		if (BROKEN_RUNTIME) {
			const isReady = await visit(page, server, EN_ROUTE);
			if (!isReady) {
				report('BS-05', false, 'the search page never initialized under broken runtime');
				return EXIT.FAIL;
			}
			const hasLoadError = Boolean(
				await evaluate(page, "!!document.querySelector('[data-search-load-error]')"),
			);
			const hasDevNotice = Boolean(
				await evaluate(page, "!!document.querySelector('[data-search-dev-notice]')"),
			);
			report(
				'BS-05',
				hasLoadError && !hasDevNotice,
				hasLoadError && !hasDevNotice
					? 'broken Pagefind runtime reported load error and was NOT disguised as dev mode'
					: `failed S3: loadError=${hasLoadError}, devNotice=${hasDevNotice}`,
			);
			return hasLoadError && !hasDevNotice ? EXIT.PASS : EXIT.FAIL;
		}

		// --- Scenario S4 Control Run: Malformed Index Row ---
		if (MALFORMED_ROW) {
			const isReady = await visit(page, server, EN_ROUTE);
			if (!isReady) {
				report('BS-06', false, 'the search page never initialized under malformed row test');
				return EXIT.FAIL;
			}
			await typeQuery(page, 'giscus');
			const sawDefect = await until(
				async () =>
					Boolean(await evaluate(page, "!!document.querySelector('[data-search-row-defect]')")),
				{ timeoutMs: 4000 },
			);
			const normalItems = await evaluate(
				page,
				"document.querySelectorAll('.search-result-item').length",
			);
			report(
				'BS-06',
				sawDefect && normalItems === 0,
				sawDefect && normalItems === 0
					? 'malformed index row reported as defect and NOT rendered as normal result item'
					: `failed S4: sawDefect=${sawDefect}, normalItems=${normalItems}`,
			);
			return sawDefect && normalItems === 0 ? EXIT.PASS : EXIT.FAIL;
		}

		// --- Scenario S5 Control Run: Thrown Query ---
		if (THROW_QUERY) {
			const isReady = await visit(page, server, EN_ROUTE);
			if (!isReady) {
				report('BS-07', false, 'the search page never initialized under throw query test');
				return EXIT.FAIL;
			}
			await typeQuery(page, 'giscus');
			const sawQueryError = await until(
				async () =>
					Boolean(await evaluate(page, "!!document.querySelector('[data-search-query-error]')")),
				{ timeoutMs: 4000 },
			);
			const sawNoResults = Boolean(
				await evaluate(page, "!!document.querySelector('[data-search-no-results]')"),
			);
			report(
				'BS-07',
				sawQueryError && !sawNoResults,
				sawQueryError && !sawNoResults
					? 'query execution failure rendered query error and was NOT disguised as no-results'
					: `failed S5: sawQueryError=${sawQueryError}, sawNoResults=${sawNoResults}`,
			);
			return sawQueryError && !sawNoResults ? EXIT.PASS : EXIT.FAIL;
		}

		// --- Standard Positive Run ---

		// BS-00: Readiness gate on EN and KO search routes
		for (const [id, route, expectedHeading] of [
			['BS-00a', EN_ROUTE, 'Search'],
			['BS-00b', KO_ROUTE, '검색'],
		]) {
			const live = await visit(page, server, route);
			if (!live) {
				report(id, false, `${route} never reported search ready`);
				return EXIT.FAIL;
			}
			const h1 = await evaluate(page, "document.querySelector('h1')?.textContent?.trim()");
			const hasInput = Boolean(await evaluate(page, "!!document.getElementById('site-search')"));
			const hasDevNotice = Boolean(
				await evaluate(page, "!!document.querySelector('[data-search-dev-notice]')"),
			);
			const hasLoadError = Boolean(
				await evaluate(page, "!!document.querySelector('[data-search-load-error]')"),
			);
			report(
				id,
				h1 === expectedHeading && hasInput && !hasDevNotice && !hasLoadError,
				`${route} ready with h1="${h1}", input ready, dev notice absent, load error absent`,
			);
		}

		// BS-01: EN Search query returns exact article hit
		await visit(page, server, EN_ROUTE);
		await typeQuery(page, 'giscus');
		const enResultsFound = await until(
			async () =>
				(await evaluate(page, "document.querySelectorAll('.search-result-item').length")) > 0,
			{ timeoutMs: 6000 },
		);
		if (!enResultsFound) {
			report('BS-01', false, 'no search results rendered for query "giscus" on /search');
		} else {
			const hit = await evaluate(
				page,
				`
				(() => {
					const el = document.querySelector('.search-result-item');
					if (!el) return null;
					return {
						href: el.getAttribute('href'),
						title: el.querySelector('h2')?.textContent?.trim(),
						category: el.querySelector('span')?.textContent?.trim(),
						excerptHtml: el.querySelector('.search-excerpt')?.innerHTML,
						excerptText: el.querySelector('.search-excerpt')?.textContent,
					};
				})()
			`,
			);

			const urlOk = hit?.href === '/posts/giscus-sveltekit-integration';
			const titleOk = hit?.title === 'Giscus SvelteKit Integration';
			const catOk = hit?.category === 'frontend';
			const markOk = Boolean(hit?.excerptHtml?.includes('<mark>'));
			const ignoredAbsent =
				!hit?.excerptText?.includes('Comments will load here') &&
				!hit?.excerptText?.includes('On this page') &&
				!hit?.excerptText?.includes('Home');

			const ok = urlOk && titleOk && catOk && markOk && ignoredAbsent;
			report(
				'BS-01',
				ok,
				ok
					? `EN search returned exact URL ${hit.href}, exact title "${hit.title}", mark highlighted, ignored regions absent`
					: `EN search mismatch: urlOk=${urlOk}, titleOk=${titleOk}, catOk=${catOk}, markOk=${markOk}, ignoredAbsent=${ignoredAbsent}`,
			);
		}

		// BS-02: KO Search query returns exact article hit
		await visit(page, server, KO_ROUTE);
		await typeQuery(page, 'giscus');
		const koResultsFound = await until(
			async () =>
				(await evaluate(page, "document.querySelectorAll('.search-result-item').length")) > 0,
			{ timeoutMs: 6000 },
		);
		if (!koResultsFound) {
			report('BS-02', false, 'no search results rendered for query "giscus" on /ko/search');
		} else {
			const hit = await evaluate(
				page,
				`
				(() => {
					const el = document.querySelector('.search-result-item');
					if (!el) return null;
					return {
						href: el.getAttribute('href'),
						title: el.querySelector('h2')?.textContent?.trim(),
						category: el.querySelector('span')?.textContent?.trim(),
						excerptHtml: el.querySelector('.search-excerpt')?.innerHTML,
						excerptText: el.querySelector('.search-excerpt')?.textContent,
					};
				})()
			`,
			);

			const urlOk = hit?.href === '/ko/posts/giscus-sveltekit-integration';
			const titleOk = hit?.title === 'Giscus SvelteKit 통합하기';
			const catOk = hit?.category === 'frontend';
			const markOk = Boolean(hit?.excerptHtml?.includes('<mark>'));
			const ignoredAbsent =
				!hit?.excerptText?.includes('Giscus 런타임을 마이그레이션하면') &&
				!hit?.excerptText?.includes('이 글의 목차') &&
				!hit?.excerptText?.includes('홈');

			const ok = urlOk && titleOk && catOk && markOk && ignoredAbsent;
			report(
				'BS-02',
				ok,
				ok
					? `KO search returned exact URL ${hit.href}, exact title "${hit.title}", mark highlighted, ignored regions absent`
					: `KO search mismatch: urlOk=${urlOk}, titleOk=${titleOk}, catOk=${catOk}, markOk=${markOk}, ignoredAbsent=${ignoredAbsent}`,
			);
		}

		// BS-03: Locale facet isolation
		// Check that EN search returned ONLY EN posts (/posts/), not /ko/posts/
		await visit(page, server, EN_ROUTE);
		await typeQuery(page, 'giscus');
		await until(
			async () =>
				(await evaluate(page, "document.querySelectorAll('.search-result-item').length")) > 0,
			{ timeoutMs: 6000 },
		);
		const enHrefs = await evaluate(
			page,
			`
			Array.from(document.querySelectorAll('.search-result-item')).map(el => el.getAttribute('href'))
		`,
		);
		const enIsolated =
			enHrefs.length > 0 &&
			enHrefs.every((h) => h.startsWith('/posts/') && !h.startsWith('/ko/posts/'));

		await visit(page, server, KO_ROUTE);
		await typeQuery(page, 'giscus');
		await until(
			async () =>
				(await evaluate(page, "document.querySelectorAll('.search-result-item').length")) > 0,
			{ timeoutMs: 6000 },
		);
		const koHrefs = await evaluate(
			page,
			`
			Array.from(document.querySelectorAll('.search-result-item')).map(el => el.getAttribute('href'))
		`,
		);
		const koIsolated = koHrefs.length > 0 && koHrefs.every((h) => h.startsWith('/ko/posts/'));

		const facetOk = enIsolated && koIsolated;
		report(
			'BS-03',
			facetOk,
			facetOk
				? 'locale facet isolation preserved: EN query returned only /posts/, KO query returned only /ko/posts/'
				: `facet leak: enIsolated=${enIsolated} (${enHrefs}), koIsolated=${koIsolated} (${koHrefs})`,
		);

		// BS-04: Legitimate no-results state
		await visit(page, server, EN_ROUTE);
		// Quoted phrase prevents Pagefind prefix-matching single-letter 'z' tokens (e.g. bash -z, ISO Z) across the full 334-post corpus
		await typeQuery(page, '"zzzzzzzzzzzzzz"');
		const noResultsSeen = await until(
			async () =>
				Boolean(await evaluate(page, "!!document.querySelector('[data-search-no-results]')")),
			{ timeoutMs: 4000 },
		);
		const resultItemsCount = await evaluate(
			page,
			"document.querySelectorAll('.search-result-item').length",
		);
		const hasQueryError = Boolean(
			await evaluate(page, "!!document.querySelector('[data-search-query-error]')"),
		);

		const noResultsOk = noResultsSeen && resultItemsCount === 0 && !hasQueryError;
		report(
			'BS-04',
			noResultsOk,
			noResultsOk
				? 'nonexistent query rendered [data-search-no-results] and 0 items; query error absent'
				: `noResults failed: seen=${noResultsSeen}, items=${resultItemsCount}, queryError=${hasQueryError}`,
		);

		// BS-05/06/07 Positive states, measured on a query that DOES return rows.
		await visit(page, server, EN_ROUTE);
		await typeQuery(page, 'giscus');
		await until(
			async () =>
				(await evaluate(page, "document.querySelectorAll('.search-result-item').length")) > 0,
			{ timeoutMs: 6000 },
		);
		const positiveState = await evaluate(
			page,
			`
			(() => ({
				loadError: !!document.querySelector('[data-search-load-error]'),
				devNotice: !!document.querySelector('[data-search-dev-notice]'),
				defects: !!document.querySelector('[data-search-row-defect]'),
				queryError: !!document.querySelector('[data-search-query-error]'),
				items: document.querySelectorAll('.search-result-item').length,
			}))()
		`,
		);
		report(
			'BS-05',
			!positiveState.loadError && !positiveState.devNotice,
			`production runtime initialized: loadError=${positiveState.loadError}, devNotice=${positiveState.devNotice}`,
		);
		report(
			'BS-06',
			!positiveState.defects && positiveState.items > 0,
			`well-formed index rows rendered: items=${positiveState.items}, defects=${positiveState.defects}`,
		);
		report(
			'BS-07',
			!positiveState.queryError && positiveState.items > 0,
			`legitimate query succeeded: items=${positiveState.items}, queryError=${positiveState.queryError}`,
		);

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
