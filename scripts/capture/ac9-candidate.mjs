/**
 * ac9-candidate — Slice 5 AC9 capture driver for the Next.js candidate.
 *
 * Runs the Slice 0 representative route set through the SAME probes and the
 * SAME fixed capture profile the Svelte baseline was measured with
 * (verification/thresholds.md § Browser evidence): structural/a11y rows via
 * scripts/capture/frame-probe.js inside the server's /__viewport iframe at
 * 390x844 / 820x1180 / 1440x900, and LCP/CLS/interaction lab proxies via
 * scripts/capture/perf-probe.js top-level at 1680x1072, 5 warm runs per route
 * after one discarded priming load.
 *
 * ENVIRONMENT DELTA, stated not hidden: the baseline ran through a headed
 * Chrome driven by MCP, which required a foreground unoccluded window because
 * an occluded tab reports visibilityState "hidden" and never paints. This
 * driver runs --headless=new, where the page paints and rAF fires by
 * construction. The metric contract is preserved: every perf run still asserts
 * visibilityState === "visible", a firing rAF, and a credible paint entry
 * before a sample is recorded. Browser/OS/node are recorded in the output.
 *
 * Usage: node scripts/capture/ac9-candidate.mjs [buildDir] [outJson]
 *   defaults: next/build  /tmp/ac9-candidate.json
 *
 * Exit: 0 captured; 2 harness error; 3 no browser.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT, chord, evaluate, launch, serve, until } from '../browser-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const buildDir = process.argv[2] ?? 'next/build';
const outPath = process.argv[3] ?? '/tmp/ac9-candidate.json';

const PERF_ROUTES = [
	'/',
	'/posts',
	'/posts/giscus-sveltekit-integration',
	'/ko/posts/giscus-sveltekit-integration',
	'/ko',
	'/tags',
	'/search',
	'/study/dsa-ii',
	'/system/3b',
	'/talks/my-career',
];
const VIEWPORTS = [
	[390, 844],
	[820, 1180],
	[1440, 900],
];

const perfProbeSrc = readFileSync(join(HERE, 'perf-probe.js'), 'utf8');
const frameProbeSrc = readFileSync(join(HERE, 'frame-probe.js'), 'utf8');

/** A real CDP key event for a named (non-printable) key — same form as
 * assert-browser-ac7.mjs's pressArrow: chord() only covers printable chars. */
const KEYCODES = {
	Escape: 27,
	Backspace: 8,
	ArrowDown: 40,
	ArrowRight: 39,
	ArrowLeft: 37,
};
async function press(page, key) {
	const code = KEYCODES[key];
	const base = {
		key,
		code: key,
		windowsVirtualKeyCode: code,
		nativeVirtualKeyCode: code,
	};
	await page.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' });
	await page.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

const main = async () => {
	const browser = await launch({ headless: true });
	if (!browser) return EXIT.SKIPPED;
	let server;
	try {
		server = await serve(buildDir);
		const base = `http://127.0.0.1:${server.port}`;
		const page = browser;
		const nav = async (url) => {
			await page.send('Page.enable');
			await page.send('Page.navigate', { url });
			const ok = await until(
				async () => (await evaluate(page, 'document.readyState')) === 'complete',
				{ timeoutMs: 15000 },
			);
			if (!ok) throw new Error(`${url} never reached readyState complete`);
		};
		// Fixed performance viewport: 1680x1072 top-level, dpr 2 like the baseline.
		await page.send('Emulation.setDeviceMetricsOverride', {
			width: 1680,
			height: 1072,
			deviceScaleFactor: 2,
			mobile: false,
		});

		// Gate probe — the profile's visibility/paint preconditions, asserted.
		await nav(`${base}/`);
		const gate = await evaluate(
			page,
			`(${async () => {
				const raf = await new Promise((r) => {
					const t = setTimeout(() => r(false), 3000);
					requestAnimationFrame(() => {
						clearTimeout(t);
						r(true);
					});
				});
				const fcp = performance
					.getEntriesByType('paint')
					.find((p) => p.name === 'first-contentful-paint');
				return {
					visible: document.visibilityState === 'visible',
					raf,
					fcpMs: fcp ? Math.round(fcp.startTime) : null,
					viewport: [innerWidth, innerHeight],
					dpr: devicePixelRatio,
				};
			}})()`,
		);
		if (!gate.visible || !gate.raf || gate.fcpMs === null) {
			throw new Error(`gate probe failed: ${JSON.stringify(gate)}`);
		}

		// ---- Perf: 10 routes, priming load + 5 recorded runs, top-level ----
		const perf = [];
		for (const route of PERF_ROUTES) {
			const samples = [];
			for (let i = 0; i < 6; i += 1) {
				await nav(`${base}${route}`);
				const s = await evaluate(page, `${perfProbeSrc}; globalThis.__perfProbe(1200)`);
				if (i > 0) samples.push(s); // first load is the discarded prime
			}
			perf.push({ route, samples });
		}

		// ---- Interaction latency: Cmd+K palette on /, ArrowRight on the deck ----
		// A live `event` collector is installed before navigation so durations are
		// recorded during input, not reconstructed from the buffer afterwards.
		const { identifier: collectorId } = await page.send('Page.addScriptToEvaluateOnNewDocument', {
			source: `globalThis.__events=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>globalThis.__events.push({name:e.name,duration:e.duration}))).observe({type:'event',durationThreshold:16});}catch(e){globalThis.__eventsError=String(e)}`,
		});
		const interactions = [];
		const collectInteractions = async (route, label, doInput) => {
			await nav(`${base}${route}`);
			await new Promise((r) => setTimeout(r, 300)); // collector live
			await doInput();
			const events = await evaluate(page, `JSON.stringify(globalThis.__events ?? [])`);
			interactions.push({ flow: label, route, events: JSON.parse(events) });
		};
		await collectInteractions('/', '/ Cmd+K open, Escape close x5', async () => {
			for (let i = 0; i < 5; i += 1) {
				await chord(page, 'k', { meta: true });
				await until(async () => await evaluate(page, `!!document.querySelector('[role=dialog]')`));
				await press(page, 'Escape');
				await until(async () => await evaluate(page, `!document.querySelector('[role=dialog]')`));
			}
		});
		await collectInteractions(
			'/talks/my-career',
			'/talks/my-career ArrowRight x5, 3s gaps',
			async () => {
				for (let i = 0; i < 5; i += 1) {
					await press(page, 'ArrowRight');
					await new Promise((r) => setTimeout(r, 3000));
				}
			},
		);
		await page.send('Page.removeScriptToEvaluateOnNewDocument', {
			identifier: collectorId,
		});

		// ---- Keyboard flows K1-K8 (baseline sequences, candidate assertions) ----
		const keys = [];
		const key = async (id, route, fn) => {
			await nav(`${base}${route}`);
			try {
				keys.push({ id, route, observed: await fn() });
			} catch (error) {
				keys.push({ id, route, error: String(error) });
			}
		};
		await key('K1', '/', async () => {
			await chord(page, 'k', { meta: true });
			await until(async () => await evaluate(page, `!!document.querySelector('[role=dialog]')`));
			return evaluate(
				page,
				`JSON.stringify({dialog:!!document.querySelector('[role=dialog]'),options:document.querySelectorAll('[role=option]').length,active:document.activeElement?.tagName,ph:document.activeElement?.getAttribute('placeholder')})`,
			);
		});
		await key('K2', '/', async () => {
			await chord(page, 'k', { meta: true });
			await until(async () => await evaluate(page, `!!document.querySelector('[role=dialog]')`));
			await press(page, 'ArrowDown');
			await press(page, 'ArrowDown');
			return evaluate(
				page,
				`JSON.stringify({ad:document.querySelector('[role=dialog] [aria-activedescendant],[aria-activedescendant]')?.getAttribute('aria-activedescendant'),active:document.querySelector('[aria-selected=true]')?.textContent?.trim().slice(0,60)})`,
			);
		});
		await key('K3', '/', async () => {
			await chord(page, 'k', { meta: true });
			await until(async () => await evaluate(page, `!!document.querySelector('[role=dialog]')`));
			const before = await evaluate(page, `document.querySelectorAll('[role=option]').length`);
			await page.send('Input.insertText', { text: 'redis' });
			await new Promise((r) => setTimeout(r, 700));
			const after = await evaluate(page, `document.querySelectorAll('[role=option]').length`);
			const first = await evaluate(
				page,
				`document.querySelector('[role=option]')?.textContent?.trim().slice(0,80)`,
			);
			return JSON.stringify({ before, after, first });
		});
		await key('K4', '/', async () => {
			await chord(page, 'k', { meta: true });
			await until(async () => await evaluate(page, `!!document.querySelector('[role=dialog]')`));
			await press(page, 'Escape');
			await new Promise((r) => setTimeout(r, 300));
			return evaluate(
				page,
				`JSON.stringify({dialog:!!document.querySelector('[role=dialog]'),path:location.pathname,focus:document.activeElement?.tagName})`,
			);
		});
		await key('K5', '/posts/claude-code-agent-teams', async () => {
			await press(page, 'Backspace');
			await new Promise((r) => setTimeout(r, 800));
			return evaluate(page, `JSON.stringify({path:location.pathname,title:document.title})`);
		});
		await key('K6', '/talks/my-career', async () => {
			const seen = [];
			for (let i = 0; i < 6; i += 1) {
				await press(page, 'ArrowRight');
				await new Promise((r) => setTimeout(r, 1200));
				seen.push(await evaluate(page, `location.search`));
			}
			return JSON.stringify(seen);
		});
		await key('K7', '/talks/my-career', async () => {
			await press(page, 'ArrowRight');
			await new Promise((r) => setTimeout(r, 1200));
			await press(page, 'ArrowLeft');
			await new Promise((r) => setTimeout(r, 1200));
			return evaluate(page, `location.search`);
		});
		await key('K8', '/posts/claude-code-agent-teams', async () => {
			await evaluate(page, `scrollTo(0, document.body.scrollHeight * 0.5)`);
			await new Promise((r) => setTimeout(r, 500));
			return evaluate(
				page,
				`JSON.stringify({pb:document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'),y:scrollY,max:document.body.scrollHeight})`,
			);
		});

		// ---- Structural / a11y: 10 routes x 3 viewports via /__viewport ----
		const structural = [];
		for (const route of PERF_ROUTES) {
			for (const [w, h] of VIEWPORTS) {
				await nav(`${base}/__viewport?w=${w}&h=${h}&u=${encodeURIComponent(route)}`);
				const snap = await evaluate(page, `${frameProbeSrc}; globalThis.__frameProbe()`);
				structural.push({ route, viewport: [w, h], ...snap });
			}
		}

		const chrome = await evaluate(page, `navigator.userAgent`);
		const result = {
			buildDir,
			base,
			env: {
				ua: chrome,
				node: process.version,
				platform: process.platform,
				headless: 'new',
				dpr: gate.dpr,
				perfViewport: gate.viewport,
			},
			gate,
			perf,
			interactions,
			keys,
			structural,
		};
		writeFileSync(outPath, JSON.stringify(result, null, 1));
		console.log(`wrote ${outPath}`);
		return EXIT.PASS;
	} finally {
		await browser.close();
		await server?.close();
	}
};

const code = await main().catch((error) => {
	console.error(error);
	return EXIT.ERROR;
});
process.exit(code);
