/**
 * migration:browser:notfound — the F1 regression row.
 *
 * F1 was a hydration error (#418) on every unmatched path: the static export
 * renders `404.html` with pathname `/_not-found`, where `hasLocaleVariant` is
 * false and no `a.language-toggle` is emitted — but the hydrating client sees
 * the real unmatched URL, passes the check, and mounts the toggle. Server and
 * client DOM disagree, React logs #418 twice, and the page self-recovers. The
 * fix is the error-route flag threaded from `global-not-found.tsx` (and
 * `global-error.tsx`) through `SiteShell` (`errorRoute`) → `TerminalTitleBar`
 * → `LanguageToggle`, so both renders agree on the no-toggle output (a plain
 * `span` locale label, never an `a.language-toggle`).
 *
 * Each row loads an error-route URL in a real browser, lets hydration finish,
 * and asserts ZERO captured errors — `console.error` included, because that is
 * the channel React uses for recoverable hydration mismatches — plus zero
 * `a.language-toggle` nodes in the rendered header. The toggle count is
 * asserted separately because a regression that mounts it without an error
 * (or with error reporting stripped) still violates the server/client
 * contract this suite guards.
 *
 * Mutation flags, consumed by assert-browser-notfound-controls.mjs:
 *   node scripts/assert-browser-notfound.mjs --inject-window-error
 *   node scripts/assert-browser-notfound.mjs --render-toggle
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

const flag = (name) => process.argv.includes(name);
const INJECT_WINDOW_ERROR = flag('--inject-window-error');
const RENDER_TOGGLE = flag('--render-toggle');

const ROUTES = [
	// `/404` resolves to the exported `404.html` directly (status 200); the two
	// misses fall through to it with status 404. All three hydrate the same
	// global-not-found tree.
	{ id: 'NF-01', url: '/404', status: 200 },
	{ id: 'NF-02', url: '/does-not-exist-xyz', status: 404 },
	{ id: 'NF-03', url: '/ko/does-not-exist', status: 404 },
];

const COLLECTOR = `
window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || e.type)));
window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
const __origErr = console.error.bind(console);
console.error = (...a) => { window.__errs.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); __origErr(...a); };
`;

const SNAPSHOT = `
(() => ({
	h1: document.querySelector('#main-content h1')?.textContent.trim() ?? null,
	lang: document.documentElement.lang,
	toggles: document.querySelectorAll('a.language-toggle').length,
	errs: window.__errs,
}))()
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
		await page.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECTOR });
		await page.send('Network.enable');
		const statusByUrl = new Map();
		page.on('Network.responseReceived', (params) => {
			if (params?.type === 'Document' && params?.response?.url) {
				statusByUrl.set(params.response.url, params.response.status);
			}
		});
		const status = (url) => statusByUrl.get(`http://127.0.0.1:${server.port}${url}`);

		if (INJECT_WINDOW_ERROR)
			// Defect simulation: a real window error event, the same channel a
			// hydration mismatch reaches the collector through.
			await mutateBehavior(
				page,
				`setTimeout(() => { throw new Error('injected window error'); }, 0);`,
			);
		if (RENDER_TOGGLE)
			// Defect simulation of F1 itself: the client mounts a toggle the
			// server never emitted. The observer re-adds it whenever hydration
			// rewrites the header, so the row fails on the toggle count even if
			// React discards the first injected node.
			await mutateBehavior(
				page,
				`new MutationObserver(() => {
	// REDESIGN: HeaderControls is gone; the toggle now lives in the terminal
	// title bar's tools cluster, so that is where the defect is injected.
	const hc = document.querySelector('.term-bar__tools');
	if (hc && !hc.querySelector('a.language-toggle')) {
		const a = document.createElement('a');
		a.className = 'language-toggle';
		a.href = '/ko';
		a.setAttribute('aria-label', 'injected toggle');
		hc.appendChild(a);
	}
}).observe(document, { childList: true, subtree: true });`,
			);

		for (const route of ROUTES) {
			await page.send('Page.navigate', {
				url: `http://127.0.0.1:${server.port}${route.url}`,
			});
			const isReady = await ready(page, "!!document.querySelector('#not-found-title')");
			if (!isReady) {
				report(route.id, false, `${route.url} — 404 panel never rendered`);
				continue;
			}
			// Hydration runs on load; #418 is emitted while it executes. 800 ms
			// matches the settle the AC7 suite gives entrance animations — long
			// enough for a mismatch error to land in the collector, short enough
			// that a hung renderer is not mistaken for a quiet one.
			await new Promise((r) => setTimeout(r, 800));
			const snap = await evaluate(page, SNAPSHOT);

			const problems = [];
			if (snap.h1 !== 'Page not found') problems.push(`h1=${snap.h1}, want "Page not found"`);
			if (snap.lang !== 'en') problems.push(`lang=${snap.lang}, want en`);
			if (snap.toggles !== 0) problems.push(`${snap.toggles} language-toggle node(s)`);
			if (snap.errs.length > 0)
				problems.push(`${snap.errs.length} error(s): ${snap.errs.join(' | ')}`);
			if (status(route.url) !== route.status)
				problems.push(`HTTP ${status(route.url) ?? 'unobserved'}, want ${route.status}`);

			report(
				route.id,
				problems.length === 0,
				`${route.url} h1="${snap.h1}" toggles=${snap.toggles} errs=${snap.errs.length}` +
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
