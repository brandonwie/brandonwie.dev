/**
 * migration:browser:xyflow — focused functional probe over the `/system/3b`
 * @xyflow graph routes and their `/ko/` twins, plus the two `/system` index
 * routes.
 *
 * Rows per graph route (X-EN/X-KO):
 *
 *   mount     serves 200, carries `<html lang>`, renders h1, zero console
 *             errors, and the lazy graph mounts after hydration: 17
 *             `.react-flow__node`, 42 edge paths (21 visible +
 *             21 interaction, matching the baseline counting method), 3
 *             control buttons, MiniMap and Background present, graph copy in
 *             the route locale.
 *   controls  zoom-in raises the viewport scale, fit-view restores it.
 *   dim       hovering a chip dims the non-incident edges (the Svelte
 *             `dimEdges` hover contract) and leaving restores them.
 *   drill     clicking an expandable chip drills into its subsystem —
 *             node count changes, the toolbar gains crumb + back control —
 *             and back restores the overview.
 *   nodrag    a synthetic mouse drag leaves the chip transform unchanged
 *             (`nodesDraggable={false}` parity).
 *   shots     opt-in screenshots at 390 / 820 / 1440 (`--screenshots`,
 *             archived under `verification/screenshots/slice4-3b/`,
 *             branch-lifetime per `verification/README.md`).
 *
 * The hydration-boundary half of the baseline contract — zero flow elements
 * in the exported HTML — is asserted statically by `pnpm migration:c11` row
 * H; this probe covers the browser half. The baseline's "mounted only after
 * scroll" wording was a lazy-chunk timing artifact: neither stack uses an
 * IntersectionObserver, so the asserted contract is mount-after-hydration.
 *
 * Negative control flags (consumed by `assert-browser-xyflow-controls.mjs`):
 *   node scripts/assert-browser-xyflow.mjs --inject-console-error
 *   node scripts/assert-browser-xyflow.mjs --hide-minimap
 *   node scripts/assert-browser-xyflow.mjs --drop-status-responses
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
	{ id: 'X-EN', url: '/system/3b', locale: 'en', hangul: false },
	{ id: 'X-KO', url: '/ko/system/3b', locale: 'ko', hangul: true },
];
const INDEX_ROUTES = [
	{ id: 'X-SYS-EN', url: '/system', locale: 'en' },
	{ id: 'X-SYS-KO', url: '/ko/system', locale: 'ko' },
];
const VIEWPORTS = [
	[390, 844],
	[820, 900],
	[1440, 900],
];

const flag = (name) => process.argv.includes(name);
const SCREENSHOTS = flag('--screenshots');
const INJECT_CONSOLE_ERROR = flag('--inject-console-error');
const HIDE_MINIMAP = flag('--hide-minimap');
const DROP_STATUS = flag('--drop-status-responses');

const COLLECTOR = `
window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || e.type)));
window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
const __origErr = console.error.bind(console);
console.error = (...a) => { window.__errs.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); __origErr(...a); };
`;

const SCALE = `
(() => {
	const t = document.querySelector('.react-flow__viewport')?.style.transform || '';
	const m = t.match(/scale\\(([0-9.]+)\\)/);
	return m ? parseFloat(m[1]) : null;
})()
`;

// Edges paint a tick after nodes under load; wait for the whole mounted
// contract rather than the first node (CI flake: edgePaths=0 mid-paint).
// Minimap is DOM-presence only so --hide-minimap still reaches the row assert.
const MOUNTED =
	"document.querySelectorAll('.react-flow__node').length === 17 " +
	"&& document.querySelectorAll('.react-flow__edges path, .react-flow__edge path').length === 42 " +
	"&& document.querySelectorAll('.react-flow__controls button').length === 3 " +
	"&& !!document.querySelector('.react-flow__minimap') " +
	"&& !!document.querySelector('.react-flow__background')";

const GRAPH_SNAPSHOT = `
(async () => {
	const rf = document.querySelector('.react-flow');
	const nodes = document.querySelectorAll('.react-flow__node');
	const chips = document.querySelectorAll('.react-flow__node-subsystem, .react-flow__node-leaf');
	const edgePaths = document.querySelectorAll('.react-flow__edges path, .react-flow__edge path');
	const controls = document.querySelectorAll('.react-flow__controls button');
	const minimap = document.querySelector('.react-flow__minimap');
	const bg = document.querySelector('.react-flow__background');
	const h1 = document.querySelector('#main-content h1, main h1, h1');
	const hint = document.querySelector('.s3b-flow .hint');
	const title = document.querySelector('.s3b-flow .toolbar .title');
	return {
		mounted: !!rf,
		nodes: nodes.length,
		chips: chips.length,
		edgePaths: edgePaths.length,
		controls: controls.length,
		minimap: !!minimap && getComputedStyle(minimap).display !== 'none',
		background: !!bg,
		lang: document.documentElement.lang,
		h1: h1 ? h1.textContent.trim().slice(0, 80) : null,
		hint: hint ? hint.textContent.trim() : null,
		titleText: title ? title.textContent.trim().slice(0, 60) : null,
		errs: window.__errs,
	};
})()
`;

const CLICK_CTRL = `
((cls) => {
	const b = document.querySelector('.react-flow__controls-' + cls);
	if (!b) return { found: false };
	b.click();
	return { found: true };
})
`;

const HOVER_DIM = `
(async () => {
	const read = () => [...document.querySelectorAll('.react-flow__edge-path')].map(
		(p) => p.style.opacity || getComputedStyle(p).opacity,
	);
	const until = async (fn, ms = 3000) => {
		const t0 = Date.now();
		while (!fn() && Date.now() - t0 < ms)
			await new Promise((r) => setTimeout(r, 100));
	};
	const before = read();
	const chip = document.querySelector('.react-flow__node-subsystem .s3b-node, .react-flow__node-leaf .s3b-node');
	if (!chip) return { ok: false, reason: 'no chip' };
	chip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
	await until(() => read().some((a, i) => a !== before[i]));
	const during = read();
	chip.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
	await until(() => read().every((a, i) => a === before[i]));
	const after = read();
	const dimmed = during.filter((a, i) => a !== before[i]).length;
	const restored = after.filter((a, i) => a === before[i]).length;
	return { ok: true, edges: before.length, dimmed, restored };
})()
`;

// Real-input drag: CDP Input.dispatchMouseEvent walks the trusted pipeline
// (hit test, pointer events), unlike synthetic dispatchEvent which can miss
// listener paths. nodesDraggable=false means the viewport pans while the
// node's own world-coordinate transform must not change.
const DRAG_TARGET = `
(() => {
	document.querySelector('.react-flow')?.scrollIntoView({ block: 'center' });
	const node = document.querySelector('.react-flow__node-subsystem, .react-flow__node-leaf');
	if (!node) return { ok: false, reason: 'no chip node' };
	const r = node.getBoundingClientRect();
	return { ok: true, before: node.style.transform, x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()
`;

const DRAG_RESULT = `
(() => {
	const node = document.querySelector('.react-flow__node-subsystem, .react-flow__node-leaf');
	return node ? { ok: true, after: node.style.transform } : { ok: false, reason: 'node vanished' };
})()
`;

/** Drag a chip by real CDP mouse input; the node transform must not change. */
const dragTest = async (page) => {
	const target = await evaluate(page, DRAG_TARGET);
	if (!target.ok) return { ok: false, reason: target.reason || 'no chip node' };
	await page.send('Input.dispatchMouseEvent', {
		type: 'mousePressed',
		x: target.x,
		y: target.y,
		button: 'left',
		clickCount: 1,
	});
	for (let i = 1; i <= 4; i++) {
		await page.send('Input.dispatchMouseEvent', {
			type: 'mouseMoved',
			x: target.x + i * 15,
			y: target.y + i * 10,
			button: 'left',
		});
	}
	await page.send('Input.dispatchMouseEvent', {
		type: 'mouseReleased',
		x: target.x + 60,
		y: target.y + 40,
		button: 'left',
		clickCount: 1,
	});
	await new Promise((r) => setTimeout(r, 300));
	const result = await evaluate(page, DRAG_RESULT);
	return {
		ok: !!result.ok,
		before: target.before,
		after: result.after,
		moved: !!result.ok && target.before !== result.after,
	};
};

const DRILL_TEST = `
(async () => {
	const chip = document.querySelector('.react-flow__node-subsystem .s3b-node.expandable');
	if (!chip) return { ok: false, reason: 'no expandable chip' };
	const nodesNow = () => document.querySelectorAll('.react-flow__node-subsystem, .react-flow__node-leaf').length;
	const until = async (fn, ms = 3000) => {
		const t0 = Date.now();
		while (!fn() && Date.now() - t0 < ms)
			await new Promise((r) => setTimeout(r, 100));
	};
	const before = nodesNow();
	chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await until(() => nodesNow() !== before);
	const drilled = nodesNow();
	const back = document.querySelector('.s3b-flow .toolbar .btn');
	const crumb = document.querySelector('.s3b-flow .toolbar .crumb');
	const drillState = { drilled, hasBack: !!back, hasCrumb: !!crumb };
	if (back) {
		back.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await until(() => nodesNow() === before);
	}
	const restored = nodesNow();
	const hintBack = !!document.querySelector('.s3b-flow .hint');
	return { ok: true, before, ...drillState, restored, hintBack };
})()
`;

const results = [];
const report = (id, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

/** fitView animates on mount; scale is only comparable once it stops moving. */
const settledScale = async (page) => {
	let prev = null;
	for (let i = 0; i < 20; i++) {
		const s = await evaluate(page, SCALE);
		if (s !== null && s === prev) return s;
		prev = s;
		await new Promise((r) => setTimeout(r, 200));
	}
	console.warn(
		prev === null
			? 'WARN  scale never appeared on .react-flow__viewport'
			: `WARN  scale never settled; last=${prev}`,
	);
	return prev;
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
		if (HIDE_MINIMAP)
			await mutateBehavior(
				page,
				`{
					const s = document.createElement('style');
					s.textContent = '.react-flow__minimap{display:none!important}';
					(document.head || document.documentElement).appendChild(s);
				}`,
			);
		if (SCREENSHOTS) mkdirSync('verification/screenshots/slice4-3b', { recursive: true });

		for (const route of INDEX_ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route.url}` });
			const isReady = await ready(page, '!!document.querySelector("h1")');
			const snap = await evaluate(
				page,
				`({ lang: document.documentElement.lang, h1: (document.querySelector('h1')||{}).textContent?.trim().slice(0,80) || null, errs: window.__errs })`,
			);
			if (DROP_STATUS) statusByUrl.clear();
			const status = statusByUrl.get(`http://127.0.0.1:${server.port}${route.url}`);
			const problems = [];
			if (!isReady) problems.push('never rendered h1');
			if (status !== 200) problems.push(`HTTP status ${status ?? 'unobserved'}, want 200`);
			if (snap.lang !== route.locale) problems.push(`lang=${snap.lang}, want ${route.locale}`);
			if (snap.errs.length > 0) problems.push(`${snap.errs.length} console error(s)`);
			report(
				route.id,
				problems.length === 0,
				`${route.url} lang=${snap.lang} status=${status}${problems.length ? ' — ' + problems.join('; ') : ` h1="${snap.h1}"`}`,
			);
		}

		let first = true;
		for (const route of ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route.url}` });
			const isReady = await ready(page, MOUNTED, { timeoutMs: 15000 });
			if (INJECT_CONSOLE_ERROR && first) {
				await evaluate(page, `console.error('synthetic defect for BXC-01')`);
			}
			first = false;
			const snap = await evaluate(page, GRAPH_SNAPSHOT);
			if (DROP_STATUS) statusByUrl.clear();
			const status = statusByUrl.get(`http://127.0.0.1:${server.port}${route.url}`);
			const problems = [];
			if (!isReady || !snap.mounted) problems.push('graph never mounted');
			if (status !== 200) problems.push(`HTTP status ${status ?? 'unobserved'}, want 200`);
			if (snap.lang !== route.locale) problems.push(`lang=${snap.lang}, want ${route.locale}`);
			if (snap.nodes !== 17) problems.push(`nodes=${snap.nodes}, want 17`);
			if (snap.edgePaths !== 42) problems.push(`edgePaths=${snap.edgePaths}, want 42`);
			if (snap.controls !== 3) problems.push(`controls=${snap.controls}, want 3`);
			if (!snap.minimap) problems.push('minimap missing or hidden');
			if (!snap.background) problems.push('no background');
			if (!snap.h1) problems.push('no h1');
			const copy = `${snap.hint ?? ''} ${snap.titleText ?? ''}`;
			const hasHangul = /[가-힣]/.test(copy);
			if (route.hangul && !hasHangul)
				problems.push(`no hangul in graph copy (hint="${snap.hint}", title="${snap.titleText}")`);
			if (!route.hangul && hasHangul) problems.push('hangul on EN route');
			if (snap.errs.length > 0) problems.push(`${snap.errs.length} console error(s)`);
			report(
				`${route.id}-mount`,
				problems.length === 0,
				`${route.url} mounted=${snap.mounted} nodes=${snap.nodes} chips=${snap.chips} edgePaths=${snap.edgePaths} controls=${snap.controls} minimap=${snap.minimap} bg=${snap.background}` +
					(problems.length ? ` — ${problems.join('; ')}` : ` h1="${snap.h1}" hint="${snap.hint}"`),
			);
			if (snap.errs.length > 0)
				console.log(`      errs: ${JSON.stringify(snap.errs).slice(0, 300)}`);

			const s0 = await settledScale(page);
			const zin = await evaluate(page, `(${CLICK_CTRL})('zoomin')`);
			const zoomed = await settledScale(page);
			const fit = await evaluate(page, `(${CLICK_CTRL})('fitview')`);
			const reset = await settledScale(page);
			report(
				`${route.id}-controls`,
				zin.found &&
					fit.found &&
					zoomed !== null &&
					s0 !== null &&
					zoomed > s0 &&
					reset !== null &&
					Math.abs(reset - s0) < 0.06,
				`zoomin found=${zin.found} scale ${s0}->${zoomed}; fitview found=${fit.found} ->${reset}`,
			);

			const dim = await evaluate(page, HOVER_DIM);
			report(
				`${route.id}-dim`,
				dim.ok && dim.dimmed > 0 && dim.restored === dim.edges,
				`hover chip: ${dim.dimmed}/${dim.edges} edges dimmed, ${dim.restored}/${dim.edges} restored${dim.ok ? '' : ' — ' + (dim.reason || '')}`,
			);

			const drill = await evaluate(page, DRILL_TEST);
			report(
				`${route.id}-drill`,
				drill.ok &&
					drill.drilled > 0 &&
					drill.drilled !== drill.before &&
					drill.hasBack &&
					drill.hasCrumb &&
					drill.restored === drill.before &&
					drill.hintBack,
				`expand ${drill.before}->${drill.drilled} chips (crumb=${drill.hasCrumb} back=${drill.hasBack}); restored=${drill.restored} hint=${drill.hintBack}${drill.ok ? '' : ' — ' + (drill.reason || '')}`,
			);

			const drag = await dragTest(page);
			report(
				`${route.id}-nodrag`,
				drag.ok && !drag.moved,
				`drag attempt: moved=${drag.moved} ("${drag.before}" -> "${drag.after}")`,
			);

			if (SCREENSHOTS) {
				for (const [w, h] of VIEWPORTS) {
					await page.send('Emulation.setDeviceMetricsOverride', {
						width: w,
						height: h,
						deviceScaleFactor: 1,
						mobile: w < 500,
					});
					await evaluate(
						page,
						`document.querySelector('.react-flow')?.scrollIntoView({block:'center'})`,
					);
					await new Promise((r) => setTimeout(r, 500));
					const shot = await page.send('Page.captureScreenshot', {
						format: 'jpeg',
						quality: 80,
					});
					const slug = route.id === 'X-EN' ? 'system-3b' : 'ko-system-3b';
					writeFileSync(
						`verification/screenshots/slice4-3b/${slug}@${w}x${h}.jpg`,
						Buffer.from(shot.data, 'base64'),
					);
				}
				await page.send('Emulation.clearDeviceMetricsOverride');
				report(`${route.id}-shots`, true, `3 viewports -> verification/screenshots/slice4-3b/`);
			}
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
