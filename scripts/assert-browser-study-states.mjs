/**
 * migration:browser:study-states — dsa-ii visualizer states use the shell inks.
 *
 * The redesign (StudyCoursePage README § Visualizer node states) gives each
 * visualizer state one of the six shell inks: the BST traversal's current node
 * and current visit-order chip are reverse video (amber fill, glass text),
 * visited is green and unvisited worn; a heap `new` cell is reverse video,
 * `swap` an amber dashed border, and `min` (root) green. The first port kept
 * the old amber-highlight look (amber stroke and text on glass), which is the
 * defect this probe guards.
 *
 * On `/study/dsa-ii` and `/ko/study/dsa-ii` it steps the BST traversal once
 * and clicks Heap Add four times, reading computed styles in a real browser.
 * Every row requires at least one matching element, so a missing element or a
 * renamed hook fails the row instead of passing it vacuously.
 *
 * Positive control (must FAIL):
 *   node scripts/assert-browser-study-states.mjs --amber-only
 * injects CSS that restores the old amber-highlight look for the current and
 * new states before measuring.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { launch, serve, ready, evaluate, findBrowser, EXIT } from './browser-probe.mjs';

const ROUTES = ['/study/dsa-ii', '/ko/study/dsa-ii'];
const AMBER_ONLY = process.argv.includes('--amber-only');

// src/app.css:156-164 (--crt-*), as getComputedStyle reports them.
const INK = {
	glass: 'rgb(13, 11, 19)',
	amber: 'rgb(224, 163, 92)',
	green: 'rgb(159, 214, 167)',
	worn: 'rgb(214, 207, 191)',
};

// The pre-fix look: current/new drawn as an amber (or green) highlight on glass.
const AMBER_ONLY_CSS = `
.pg-study g[data-state="current"] circle { fill: var(--crt-glass) !important; stroke: var(--crt-amber) !important; }
.pg-study g[data-state="current"] text { fill: var(--crt-amber) !important; }
.pg-study span[data-state="current"] { background: transparent !important; color: var(--crt-amber) !important; }
.pg-study [data-viz="heap"] div[data-state="inserted"] { background: var(--crt-glass) !important; color: var(--crt-green) !important; border-color: var(--crt-green) !important; }
.pg-study [data-viz="heap"] div[data-state="inserted"] span { color: var(--crt-green) !important; }
.pg-study [data-viz="heap"] g[data-state="inserted"] circle { fill: var(--crt-glass) !important; }
.pg-study [data-viz="heap"] g[data-state="inserted"] text { fill: var(--crt-green) !important; }
`;

// Hydration-safe click: retry until the page reports the expected change.
const HELPERS = `
window.__clickUntil = async (btn, changed) => {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const before = changed.snapshot();
		btn.click();
		await new Promise((r) => setTimeout(r, 300));
		if (changed.snapshot() !== before) return true;
	}
	return false;
};
`;

const TRAVERSAL = `
(async () => {
	${HELPERS}
	const select = document.querySelector('#bst-traversal-order');
	const card = select ? select.closest('article') : null;
	if (!card) return { error: 'BST traversal card not found' };
	const next = [...card.querySelectorAll('button')].find((b) => (b.textContent || '').includes('\\u2192'));
	if (!next) return { error: 'BST traversal Next button not found' };
	const counter = () => card.querySelector('span.font-mono')?.textContent.trim() ?? '';
	const before = counter();
	const moved = await window.__clickUntil(next, { snapshot: counter });
	const svg = card.querySelector('svg[role="img"]');
	const node = (g) => {
		const c = g.querySelector('circle');
		const t = g.querySelector('text');
		return {
			label: t ? t.textContent.trim() : null,
			fill: c ? getComputedStyle(c).fill : null,
			text: t ? getComputedStyle(t).fill : null,
		};
	};
	const nodes = (state) => (svg ? [...svg.querySelectorAll('g[data-state="' + state + '"]')].map(node) : []);
	const chips = (state) =>
		[...card.querySelectorAll('span[data-state="' + state + '"]')].map((s) => ({
			label: s.textContent.trim(),
			bg: getComputedStyle(s).backgroundColor,
			color: getComputedStyle(s).color,
		}));
	return {
		steps: before + '->' + counter(),
		moved,
		current: nodes('current'),
		visited: nodes('visited'),
		unvisited: nodes('unvisited'),
		chipCurrent: chips('current'),
		chipVisited: chips('visited'),
	};
})()
`;

const HEAP_ADD = (times) => `
(async () => {
	${HELPERS}
	const card = document.querySelector('[data-viz="heap"]');
	if (!card) return { error: 'heap card not found' };
	const add = card.querySelector('button');
	if (!add) return { error: 'heap Add button not found' };
	const count = () => String(card.querySelectorAll('div[data-state]').length);
	let added = 0;
	for (let i = 0; i < ${times}; i += 1) {
		if (await window.__clickUntil(add, { snapshot: count })) added += 1;
	}
	const cells = (state) =>
		[...card.querySelectorAll('div[data-state="' + state + '"]')].map((d) => {
			const cs = getComputedStyle(d);
			return {
				label: d.lastElementChild ? d.lastElementChild.textContent.trim() : null,
				bg: cs.backgroundColor,
				color: cs.color,
				border: cs.borderTopColor,
				style: cs.borderTopStyle,
			};
		});
	const tree = (state) =>
		[...card.querySelectorAll('svg g[data-state="' + state + '"]')].map((g) => {
			const c = g.querySelector('circle');
			const t = g.querySelector('text');
			const cs = c ? getComputedStyle(c) : null;
			return {
				label: t ? t.textContent.trim() : null,
				fill: cs ? cs.fill : null,
				stroke: cs ? cs.stroke : null,
				dash: cs ? cs.strokeDasharray : null,
				text: t ? getComputedStyle(t).fill : null,
			};
		});
	const min = card.querySelector('[data-state="min"]');
	return {
		added,
		size: count(),
		newCells: cells('inserted'),
		swapCells: cells('swapped'),
		rootCells: cells('root'),
		setCells: cells('settled'),
		newNodes: tree('inserted'),
		swapNodes: tree('swapped'),
		rootNodes: tree('root'),
		min: min ? { label: min.textContent.trim(), color: getComputedStyle(min).color } : null,
	};
})()
`;

let failed = 0;
function row(id, route, items, predicate, describe) {
	const bad = items.filter((item) => !predicate(item));
	const ok = items.length > 0 && bad.length === 0;
	if (!ok) failed += 1;
	const why =
		items.length === 0 ? 'no matching element' : bad.length ? `bad: ${JSON.stringify(bad)}` : '';
	console.log(
		`${ok ? 'PASS' : 'FAIL'}  ${id} ${route}  ${describe} (${items.length} el)${why ? ` — ${why}` : ''}`,
	);
}

async function main() {
	if (!findBrowser()) {
		console.log('SKIPPED  no browser available');
		return EXIT.SKIPPED;
	}
	const server = await serve('next/build');
	let page;
	try {
		page = await launch();
		if (!page) {
			console.log('SKIPPED  browser could not launch');
			return EXIT.SKIPPED;
		}
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
			const isReady = await ready(
				page,
				"!!document.querySelector('#bst-traversal-order') && !!document.querySelector('[data-viz=\"heap\"]')",
				{ timeoutMs: 15000 },
			);
			if (!isReady) {
				failed += 1;
				console.log(`FAIL  SS-00 ${route}  visualizers never rendered`);
				continue;
			}
			if (AMBER_ONLY) {
				await evaluate(
					page,
					`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(AMBER_ONLY_CSS)}; document.head.appendChild(s); return true; })()`,
				);
			}

			const t = await evaluate(page, TRAVERSAL);
			if (t.error) {
				failed += 1;
				console.log(`FAIL  SS-T0 ${route}  ${t.error}`);
			} else {
				const moved = t.moved && t.steps === '1/6->2/6';
				if (!moved) failed += 1;
				console.log(`${moved ? 'PASS' : 'FAIL'}  SS-T0 ${route}  traversal stepped ${t.steps}`);
				row(
					'SS-T1',
					route,
					t.current,
					(n) => n.fill === INK.amber && n.text === INK.glass,
					'current node: amber fill, glass label',
				);
				row('SS-T2', route, t.visited, (n) => n.text === INK.green, 'visited node: green label');
				row('SS-T3', route, t.unvisited, (n) => n.text === INK.worn, 'unvisited node: worn label');
				row(
					'SS-T4',
					route,
					t.chipCurrent,
					(c) => c.bg === INK.amber && c.color === INK.glass,
					'current chip: reverse video',
				);
				row('SS-T5', route, t.chipVisited, (c) => c.color === INK.green, 'visited chip: green');
			}

			// Add x3 (5, 3, 8): 8 lands without swimming, so it is `new`; 3 is the root.
			const h3 = await evaluate(page, HEAP_ADD(3));
			if (h3.error) {
				failed += 1;
				console.log(`FAIL  SS-H0 ${route}  ${h3.error}`);
				continue;
			}
			const added3 = h3.added === 3;
			if (!added3) failed += 1;
			console.log(
				`${added3 ? 'PASS' : 'FAIL'}  SS-H0 ${route}  heap Add x3 registered ${h3.added} (cells ${h3.size})`,
			);
			row(
				'SS-H1',
				route,
				h3.newCells,
				(c) => c.bg === INK.amber && c.color === INK.glass,
				'new cell: reverse video',
			);
			row(
				'SS-H2',
				route,
				h3.newNodes,
				(n) => n.fill === INK.amber && n.text === INK.glass,
				'new tree node: amber fill, glass label',
			);
			row(
				'SS-H3',
				route,
				h3.rootCells,
				(c) => c.color === INK.green && c.border === INK.green,
				'min (root) cell: green',
			);
			row(
				'SS-H4',
				route,
				h3.rootNodes,
				(n) => n.stroke === INK.green && n.text === INK.green,
				'min (root) tree node: green',
			);
			row(
				'SS-H5',
				route,
				h3.min ? [h3.min] : [],
				(m) => m.color === INK.green,
				'MIN readout: green',
			);

			// Add x1 more (1): swims to the root, so the path 1-3-5 is `swap`.
			const h4 = await evaluate(page, HEAP_ADD(1));
			const added4 = !h4.error && h4.added === 1;
			if (!added4) failed += 1;
			console.log(
				`${added4 ? 'PASS' : 'FAIL'}  SS-H6 ${route}  heap Add x4 registered (cells ${h4.size ?? '?'})${h4.error ? ` — ${h4.error}` : ''}`,
			);
			if (h4.error) continue;
			row(
				'SS-H7',
				route,
				h4.swapCells,
				(c) => c.style === 'dashed' && c.border === INK.amber,
				'swap cell: amber dashed border',
			);
			row(
				'SS-H8',
				route,
				h4.swapNodes,
				(n) => n.stroke === INK.amber && n.dash !== 'none',
				'swap tree node: amber dashed stroke',
			);
			row('SS-H9', route, h4.setCells, (c) => c.color === INK.worn, 'set cell: worn');
		}
		console.log(failed === 0 ? '\nall study state rows passed' : `\n${failed} row(s) failed`);
		return failed === 0 ? EXIT.PASS : EXIT.FAIL;
	} finally {
		try {
			await page?.close();
		} catch (error) {
			console.warn(`WARN  browser teardown: ${error.message}`);
		}
		try {
			await server.close();
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
