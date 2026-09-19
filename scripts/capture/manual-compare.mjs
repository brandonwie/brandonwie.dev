/**
 * manual-compare — paired baseline-vs-candidate capture for the Slice 5
 * manual comparison matrix (plan.md AC7 tail + Slice 5 "manual comparison").
 *
 * Serves `build/` (Svelte baseline @ 547a840) and `next/build` (Next
 * candidate) on ephemeral ports, navigates every route in the set on both
 * sides at 1440x900 and 390x844 via Emulation.setDeviceMetricsOverride,
 * records structural facts + console errors + screenshots, and writes
 * `verification/manual-comparison.json` for the human diff.
 *
 * This is NOT an assertion suite — it emits facts. The verdict lives in
 * `verification/manual-comparison.md`, written by a human/agent reviewing
 * the JSON and the screenshot pairs.
 *
 *   node scripts/capture/manual-compare.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, serve, evaluate, until, EXIT } from '../browser-probe.mjs';

const SIDES = [
	{ name: 'baseline', dir: 'build' },
	{ name: 'candidate', dir: 'next/build' },
];
const VIEWPORTS = [
	{ name: '1440', w: 1440, h: 900 },
	{ name: '390', w: 390, h: 844 },
];
const OUT_JSON = 'verification/manual-comparison.json';
const SHOTS = 'verification/screenshots/manual-compare';

const ROUTES = [
	{ path: '/', slug: 'home' },
	{ path: '/ko', slug: 'ko-home' },
	{ path: '/posts', slug: 'posts', images: true },
	{ path: '/ko/posts', slug: 'ko-posts', images: true },
	{ path: '/posts/giscus-sveltekit-integration', slug: 'post-giscus', giscus: true },
	{ path: '/ko/posts/giscus-sveltekit-integration', slug: 'ko-post-giscus', giscus: true },
	{ path: '/posts/ai-code-review-patterns', slug: 'post-mermaid', mermaid: true },
	{ path: '/ko/posts/ai-code-review-patterns', slug: 'ko-post-mermaid', mermaid: true },
	{ path: '/tags', slug: 'tags' },
	{ path: '/ko/tags', slug: 'ko-tags' },
	{ path: '/search', slug: 'search' },
	{ path: '/ko/search', slug: 'ko-search' },
	{ path: '/study', slug: 'study' },
	{ path: '/ko/study', slug: 'ko-study' },
	{ path: '/study/dsa-i', slug: 'study-dsa-i' },
	{ path: '/ko/study/dsa-i', slug: 'ko-study-dsa-i' },
	{ path: '/study/dsa-iv', slug: 'study-dsa-iv' },
	{ path: '/system', slug: 'system' },
	{ path: '/system/3b', slug: 'system-3b', flow: true },
	{ path: '/ko/system/3b', slug: 'ko-system-3b', flow: true },
	{ path: '/talks/my-career', slug: 'deck', deck: true },
	{ path: '/about', slug: 'about' },
	{ path: '/ko/about', slug: 'ko-about' },
	{ path: '/contact', slug: 'contact' },
	{ path: '/projects', slug: 'projects' },
	{ path: '/feed', slug: 'feed' },
	{ path: '/404', slug: 'not-found' },
];

const COLLECTOR = `(() => {
	window.__consoleErrors = [];
	const orig = console.error;
	console.error = (...a) => { window.__consoleErrors.push(a.map(String).join(' ').slice(0, 300)); return orig.apply(console, a); };
	window.addEventListener('error', (e) => window.__consoleErrors.push('window.onerror: ' + e.message));
	window.addEventListener('unhandledrejection', (e) => window.__consoleErrors.push('unhandledrejection: ' + String(e.reason).slice(0, 200)));
})()`;

const PROBE = `(() => {
	const d = document, de = d.documentElement;
	const imgs = [...d.querySelectorAll('img')];
	const gis = d.querySelector('iframe.giscus-frame, iframe[src*="giscus"]');
	const counter = (d.body.innerText.match(/\\d+\\s*\\/\\s*20/) || [])[0] || null;
	return {
		title: d.title.slice(0, 90),
		lang: de.lang,
		h1: (d.querySelector('#main-content h1') || d.querySelector('h1') || {}).textContent?.trim().slice(0, 80) || null,
		overflowX: de.scrollWidth > innerWidth + 1,
		scrollW: de.scrollWidth,
		imgTotal: imgs.length,
		imgNoAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
		focusables: d.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').length,
		mermaidSvgs: d.querySelectorAll('.mermaid svg, pre.mermaid svg, [class*="mermaid"] svg').length,
		mermaidBlocks: d.querySelectorAll('.mermaid, pre.mermaid, [class*="mermaid"]:not(svg)').length,
		preBlocks: d.querySelectorAll('pre').length,
		flowNodes: d.querySelectorAll('.react-flow__node, .svelte-flow__node').length,
		flowEdges: d.querySelectorAll('.react-flow__edge, .svelte-flow__edge, path.react-flow__edge-path, path.svelte-flow__edge-path').length,
		giscus: gis ? gis.src.slice(0, 200) : null,
		deckCounter: counter,
		pagefind: !!(d.querySelector('#site-search, .pagefind-ui, [class*="pagefind"]')),
		consoleErrors: window.__consoleErrors || [],
	};
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, file) {
	const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
	writeFileSync(file, Buffer.from(data, 'base64'));
}

async function probeRoute(page, base, route) {
	await page.send('Emulation.setDeviceMetricsOverride', {
		width: VIEWPORTS[0].w,
		height: VIEWPORTS[0].h,
		deviceScaleFactor: 2,
		mobile: false,
	});
	await page.send('Page.navigate', { url: `${base}${route.path}` });
	await until(
		async () => {
			const r = await evaluate(page, 'document.readyState');
			return r === 'complete' || r === 'interactive';
		},
		{ timeoutMs: 15000 },
	);
	await sleep(route.flow ? 0 : 700); // hydration settle

	if (route.flow) {
		// graph mounts after hydration; poll, then one scroll nudge if still empty
		const mounted = await until(
			async () => {
				const n = await evaluate(
					page,
					"document.querySelectorAll('.react-flow__node,.svelte-flow__node').length",
				);
				return n > 0;
			},
			{ timeoutMs: 6000, everyMs: 150 },
		)
			.then(() => true)
			.catch(() => false);
		if (!mounted) {
			await evaluate(page, 'scrollTo(0, 3000); window.dispatchEvent(new Event("scroll"))');
			await until(
				async () => {
					const n = await evaluate(
						page,
						"document.querySelectorAll('.react-flow__node,.svelte-flow__node').length",
					);
					return n > 0;
				},
				{ timeoutMs: 6000, everyMs: 150 },
			).catch(() => {});
		}
		await sleep(400);
	}
	if (route.giscus) await sleep(2500); // let the iframe src resolve + network fly
	if (route.deck) await sleep(1200); // entrance animation (rAF-gated)

	if (route.images) {
		await evaluate(
			page,
			`(() => { const im=[...document.querySelectorAll('img[loading="lazy"]')]; im.forEach(i=>i.loading='eager'); return Promise.all(im.map(i=>i.decode().catch(()=>{}))); })()`,
		);
		await sleep(300);
	}

	const facts = await evaluate(page, PROBE).catch((e) => ({ probeError: String(e) }));

	for (const vp of VIEWPORTS) {
		await page.send('Emulation.setDeviceMetricsOverride', {
			width: vp.w,
			height: vp.h,
			deviceScaleFactor: 2,
			mobile: false,
		});
		await sleep(350);
		await shot(page, `${SHOTS}/${route.side}/${route.slug}@${vp.name}.jpg`);
	}
	await page.send('Emulation.clearDeviceMetricsOverride');
	return facts;
}

const main = async () => {
	const browser = await launch({ headless: true });
	if (!browser) {
		console.error('no Chrome found');
		return EXIT.SKIPPED;
	}
	const servers = [];
	mkdirSync(SHOTS, { recursive: true });
	const out = { captured: new Date().toISOString(), routes: {} };
	try {
		for (const side of SIDES) {
			const server = await serve(side.dir);
			servers.push(server);
			const base = `http://127.0.0.1:${server.port}`;
			mkdirSync(`${SHOTS}/${side.name}`, { recursive: true });
			await page_setup(browser);
			for (const route of ROUTES) {
				const r = { ...route, side: side.name };
				out.routes[`${side.name}:${route.slug}`] = await probeRoute(browser, base, r).catch(
					(e) => ({ error: String(e) }),
				);
				const f = out.routes[`${side.name}:${route.slug}`];
				console.log(
					`${side.name.padEnd(9)} ${route.slug.padEnd(18)} lang=${f.lang} h1=${JSON.stringify((f.h1 || '').slice(0, 30))} imgs=${f.imgTotal}/${f.imgNoAlt} flow=${f.flowNodes}/${f.flowEdges} mermaid=${f.mermaidSvgs} errs=${(f.consoleErrors || []).length}`,
				);
			}
		}
		writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
		console.log(`wrote ${OUT_JSON}`);
		return EXIT.PASS;
	} finally {
		for (const s of servers) await s.close();
		await browser.close();
	}
};

async function page_setup(page) {
	await page.send('Page.enable');
	await page.send('Runtime.enable');
	await page.send('Network.enable');
	await page.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECTOR });
}

process.exit(await main());
