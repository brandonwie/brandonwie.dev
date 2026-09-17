/**
 * migration:browser:study — focused functional probe over the 12 Slice 4
 * study routes (`/study`, `/study/dsa-i`..`iv`, `/study/aws-ai-practitioner`
 * and their `/ko/` twins).
 *
 * One row per route (S-01..S-12). Each row asserts the route serves 200 and
 * hydrates, ships zero console errors, carries the URL locale on
 * `<html lang>`, renders its `h1`, and — on the eight stepper pages —
 * advances its first Stepper 1/N to 2/N end to end in the browser.
 *
 * This is a functional smoke, not an AC7 capture: no viewports, keyboard
 * flows, or graded a11y — see `verification/behavior-matrix.md` for why
 * those keep their own methodology. Screenshots are opt-in
 * (`--screenshots`, archived under
 * `verification/screenshots/slice4-study/`, branch-lifetime per
 * `verification/README.md`); the gate itself is DOM observations only.
 *
 * Negative control flags (consumed by `assert-browser-study-controls.mjs`):
 *   node scripts/assert-browser-study.mjs --inject-console-error
 *   node scripts/assert-browser-study.mjs --skip-step-click
 *   node scripts/assert-browser-study.mjs --drop-status-responses
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
	launch,
	serve,
	ready,
	evaluate,
	mutateBehavior,
	findBrowser,
	EXIT,
} from './browser-probe.mjs';

const ROUTES = [
	{ id: 'S-01', url: '/study', locale: 'en', stepper: false },
	{ id: 'S-02', url: '/study/dsa-i', locale: 'en', stepper: true },
	{ id: 'S-03', url: '/study/dsa-ii', locale: 'en', stepper: true },
	{ id: 'S-04', url: '/study/dsa-iii', locale: 'en', stepper: true },
	{ id: 'S-05', url: '/study/dsa-iv', locale: 'en', stepper: true },
	{ id: 'S-06', url: '/study/aws-ai-practitioner', locale: 'en', stepper: false },
	{ id: 'S-07', url: '/ko/study', locale: 'ko', stepper: false },
	{ id: 'S-08', url: '/ko/study/dsa-i', locale: 'ko', stepper: true },
	{ id: 'S-09', url: '/ko/study/dsa-ii', locale: 'ko', stepper: true },
	{ id: 'S-10', url: '/ko/study/dsa-iii', locale: 'ko', stepper: true },
	{ id: 'S-11', url: '/ko/study/dsa-iv', locale: 'ko', stepper: true },
	{ id: 'S-12', url: '/ko/study/aws-ai-practitioner', locale: 'ko', stepper: false },
];

const flag = (name) => process.argv.includes(name);
const SCREENSHOTS = flag('--screenshots');
const INJECT_CONSOLE_ERROR = flag('--inject-console-error');
const SKIP_STEP_CLICK = flag('--skip-step-click');
const DROP_STATUS = flag('--drop-status-responses');

const COLLECTOR = `
window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || e.type)));
window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
const __origErr = console.error.bind(console);
console.error = (...a) => { window.__errs.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); __origErr(...a); };
`;

// Reads everything one row asserts. The stepper click retries past hydration:
// an early click lands before React attaches the listener, so up to five
// click-wait cycles run until the counter moves (probe-bug lesson, S50).
const SNAPSHOT = `
(async () => {
	const main = document.querySelector('#main-content');
	const h1 = main ? main.querySelector('h1') : null;
	const btns = [...document.querySelectorAll('#main-content button')];
	const nextBtn = btns.find((b) => (b.textContent || '').includes('\\u2192'));
	let stepped = null;
	if (nextBtn && window.__skipStepClick) {
		// Defect simulation for BSC-02: the click is issued but modeled as a
		// no-op, which is exactly what a broken stepper looks like downstream.
		const counter = nextBtn.closest('article')?.querySelector('span.font-mono');
		const counterText = counter ? counter.textContent.trim() : null;
		stepped = { before: counterText, after: counterText };
	} else if (nextBtn) {
		const counter = nextBtn.closest('article')?.querySelector('span.font-mono');
		const before = counter ? counter.textContent.trim() : null;
		let after = before;
		let attempts = 0;
		while (after === before && attempts < 5) {
			nextBtn.click();
			await new Promise((r) => setTimeout(r, 250));
			after = counter ? counter.textContent.trim() : null;
			attempts += 1;
		}
		stepped = { before, after };
	}
	return {
		lang: document.documentElement.lang,
		h1: h1 ? h1.textContent.trim().slice(0, 80) : null,
		errs: window.__errs,
		buttons: btns.length,
		stepped,
	};
})()
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
		// N5: Page.navigate's return is discarded, so HTTP status is observed
		// out-of-band. Document-type responses keyed by URL; each row asserts
		// its own 200 below.
		await page.send('Network.enable');
		const statusByUrl = new Map();
		page.on('Network.responseReceived', (params) => {
			if (params?.type === 'Document' && params?.response?.url) {
				statusByUrl.set(params.response.url, params.response.status);
			}
		});
		if (SKIP_STEP_CLICK) await mutateBehavior(page, 'window.__skipStepClick = true;');
		if (SCREENSHOTS) mkdirSync('verification/screenshots/slice4-study', { recursive: true });

		let first = true;
		for (const route of ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route.url}` });
			const isReady = await ready(page, "!!document.querySelector('#main-content h1')");
			if (!isReady) {
				report(route.id, false, `${route.url} never rendered its h1`);
				continue;
			}
			if (INJECT_CONSOLE_ERROR && first) {
				await evaluate(page, `console.error('synthetic defect for BSC-01')`);
			}
			first = false;
			const snap = await evaluate(page, SNAPSHOT);
			if (SCREENSHOTS) {
				const shot = await page.send('Page.captureScreenshot', { format: 'png' });
				const name = route.url.replace(/^\//, '').replaceAll('/', '_');
				writeFileSync(
					`verification/screenshots/slice4-study/${name}.png`,
					Buffer.from(shot.data, 'base64'),
				);
			}

			const problems = [];
			if (!snap.h1) problems.push('no h1');
			// Defect simulation for BSC-04: drop the observed statuses so the
			// HTTP gate must fire on every row.
			if (DROP_STATUS) statusByUrl.clear();
			const status = statusByUrl.get(`http://127.0.0.1:${server.port}${route.url}`);
			if (status !== 200) problems.push(`HTTP status ${status ?? 'unobserved'}, want 200`);
			if (snap.lang !== route.locale) problems.push(`lang=${snap.lang}, want ${route.locale}`);
			if (snap.errs.length > 0) problems.push(`${snap.errs.length} console error(s)`);
			if (route.stepper) {
				if (!snap.stepped) problems.push('no stepper next-button found');
				else if (snap.stepped.before === snap.stepped.after)
					problems.push(`stepper stuck at ${snap.stepped.before}`);
			}
			report(
				route.id,
				problems.length === 0,
				`${route.url} lang=${snap.lang} errs=${snap.errs.length} btn=${snap.buttons}` +
					(snap.stepped ? ` step ${snap.stepped.before}->${snap.stepped.after}` : '') +
					(problems.length ? ` — ${problems.join('; ')}` : ` h1="${snap.h1}"`),
			);
			if (snap.errs.length > 0)
				console.log(`      errs: ${JSON.stringify(snap.errs).slice(0, 300)}`);
		}

		const passed = results.filter(Boolean).length;
		console.log(`\n${ROUTES.length} study routes: ${passed} passed`);
		return passed === ROUTES.length ? EXIT.PASS : EXIT.FAIL;
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

process.exit(await main());
