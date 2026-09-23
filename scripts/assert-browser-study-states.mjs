/**
 * migration:browser:study-states — study visualizer states use the shell inks.
 *
 * The redesign (StudyCoursePage README § Visualizer node states) gives each
 * visualizer state one of the six shell inks:
 *   - traversals (dsa-ii BST, dsa-iv graph): the current node and current
 *     chip are reverse video (amber fill, glass text), visited is green and
 *     unvisited worn;
 *   - BST removal: target and promoted amber bold, successor green bold, the
 *     removed node faint with its edge dropped;
 *   - heap: `new` reverse video, `swap` an amber dashed border, `min` (root)
 *     green, `set` worn;
 *   - HashMap: `placed` a `--line` border, `chained` and `probed` amber dashed.
 * The first port kept the old amber-highlight / green-highlight looks, which
 * is the defect this probe guards.
 *
 * It drives each visualizer in a real browser (Stepper clicks, Heap Add,
 * HashMap Insert and strategy change) on `/study/dsa-ii`, `/study/dsa-iv` and
 * their `/ko/` twins and reads computed styles. Every row requires at least
 * one matching element, so a missing element or a renamed hook fails the row
 * instead of passing it vacuously.
 *
 * Positive controls (each must FAIL):
 *   node scripts/assert-browser-study-states.mjs --amber-only
 *     restores the old amber-highlight look for the traversal current states
 *     (BST and graph) and the heap `new` state.
 *   node scripts/assert-browser-study-states.mjs --old-states
 *     restores the old removal (green, regular weight) and HashMap (green
 *     placed, solid green probed) looks.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { launch, serve, ready, evaluate, findBrowser, EXIT } from './browser-probe.mjs';

const AMBER_ONLY = process.argv.includes('--amber-only');
const OLD_STATES = process.argv.includes('--old-states');

// src/app.css:156-164 (--crt-*), as getComputedStyle reports them.
const INK = {
	glass: 'rgb(13, 11, 19)',
	amber: 'rgb(224, 163, 92)',
	green: 'rgb(159, 214, 167)',
	worn: 'rgb(214, 207, 191)',
	faint: 'rgb(133, 127, 114)',
	line: 'rgb(74, 68, 55)',
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

// The pre-fix removal and HashMap looks.
const OLD_STATES_CSS = `
.pg-study [data-viz="bst-removal"] g[data-state="target"] text,
.pg-study [data-viz="bst-removal"] g[data-state="promoted"] text { fill: var(--crt-green) !important; font-weight: 400 !important; }
.pg-study [data-viz="bst-removal"] g[data-state="successor"] text { font-weight: 400 !important; }
.pg-study [data-viz="bst-removal"] g[data-state="removed"] circle { stroke: var(--crt-line) !important; }
.pg-study [data-viz="hashmap"] div[data-state="placed"] { border-color: var(--crt-green) !important; color: var(--crt-green) !important; }
.pg-study [data-viz="hashmap"] div[data-state="probed"] { border-style: solid !important; border-color: var(--crt-green) !important; }
`;

// Hydration-safe click: retry until the page reports the expected change.
const HELPERS = `
window.__clickUntil = async (btn, snapshot) => {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const before = snapshot();
		btn.click();
		await new Promise((r) => setTimeout(r, 300));
		if (snapshot() !== before) return true;
	}
	return false;
};
window.__svgNode = (g) => {
	const c = g.querySelector('circle');
	const t = g.querySelector('text');
	const cs = c ? getComputedStyle(c) : null;
	const ts = t ? getComputedStyle(t) : null;
	return {
		label: t ? t.textContent.trim() : null,
		fill: cs ? cs.fill : null,
		stroke: cs ? cs.stroke : null,
		dash: cs ? cs.strokeDasharray : null,
		text: ts ? ts.fill : null,
		weight: ts ? ts.fontWeight : null,
	};
};
window.__box = (el) => {
	const cs = getComputedStyle(el);
	return {
		label: el.lastElementChild ? el.lastElementChild.textContent.trim() : el.textContent.trim(),
		bg: cs.backgroundColor,
		color: cs.color,
		border: cs.borderTopColor,
		style: cs.borderTopStyle,
	};
};
`;

// A Stepper-driven traversal card (BST in dsa-ii, graph in dsa-iv), one step.
const TRAVERSAL = (selectId) => `
(async () => {
	${HELPERS}
	const select = document.querySelector('#${selectId}');
	const card = select ? select.closest('article') : null;
	if (!card) return { error: 'traversal card (#${selectId}) not found' };
	const next = [...card.querySelectorAll('button')].find((b) => (b.textContent || '').includes('\\u2192'));
	if (!next) return { error: 'traversal Next button not found' };
	const counter = () => card.querySelector('span.font-mono')?.textContent.trim() ?? '';
	const before = counter();
	const moved = await window.__clickUntil(next, counter);
	const svg = card.querySelector('svg[role="img"]');
	const nodes = (state) => (svg ? [...svg.querySelectorAll('g[data-state="' + state + '"]')].map(window.__svgNode) : []);
	const chips = (state) => [...card.querySelectorAll('span[data-state="' + state + '"]')].map(window.__box);
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
		if (await window.__clickUntil(add, count)) added += 1;
	}
	const cells = (state) => [...card.querySelectorAll('div[data-state="' + state + '"]')].map(window.__box);
	const tree = (state) => [...card.querySelectorAll('svg g[data-state="' + state + '"]')].map(window.__svgNode);
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

// BST removal: step to the given 1-based counter value, then read the roles.
const REMOVAL = (target) => `
(async () => {
	${HELPERS}
	const card = document.querySelector('[data-viz="bst-removal"]');
	if (!card) return { error: 'BST removal card not found' };
	const next = [...card.querySelectorAll('button')].find((b) => (b.textContent || '').includes('\\u2192'));
	if (!next) return { error: 'BST removal Next button not found' };
	const counter = () => card.querySelector('span.font-mono')?.textContent.trim() ?? '';
	for (let i = 0; i < 8 && !counter().startsWith('${target}/'); i += 1) {
		await window.__clickUntil(next, counter);
	}
	const svg = card.querySelector('svg[role="img"]');
	const nodes = (state) => (svg ? [...svg.querySelectorAll('g[data-state="' + state + '"]')].map(window.__svgNode) : []);
	return {
		step: counter(),
		edges: svg ? svg.querySelectorAll('line').length : 0,
		target: nodes('target'),
		successor: nodes('successor'),
		promoted: nodes('promoted'),
		removed: nodes('removed'),
	};
})()
`;

// HashMap: optionally switch strategy, then Insert `times` keys.
const HASHMAP = (strategy, times) => `
(async () => {
	${HELPERS}
	const card = document.querySelector('[data-viz="hashmap"]');
	if (!card) return { error: 'HashMap card not found' };
	const select = card.querySelector('#hashmap-strategy');
	if (!select) return { error: 'HashMap strategy select not found' };
	if (select.value !== '${strategy}') {
		const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
		setter.call(select, '${strategy}');
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 300));
	}
	const insert = card.querySelector('button.study-btn');
	if (!insert) return { error: 'HashMap Insert button not found' };
	const count = () => String(card.querySelectorAll('div[data-state]:not([data-state="empty"])').length);
	let inserted = 0;
	for (let i = 0; i < ${times}; i += 1) {
		if (await window.__clickUntil(insert, count)) inserted += 1;
	}
	const boxes = (state) => [...card.querySelectorAll('div[data-state="' + state + '"]')].map(window.__box);
	return {
		strategy: select.value,
		inserted,
		placed: boxes('placed'),
		collision: boxes('collision'),
		probed: boxes('probed'),
	};
})()
`;

let failed = 0;
let rows = 0;
function check(id, route, ok, detail) {
	rows += 1;
	if (!ok) failed += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${route}  ${detail}`);
}
function row(id, route, items, predicate, describe) {
	const bad = items.filter((item) => !predicate(item));
	const ok = items.length > 0 && bad.length === 0;
	const why =
		items.length === 0 ? 'no matching element' : bad.length ? `bad: ${JSON.stringify(bad)}` : '';
	check(id, route, ok, `${describe} (${items.length} el)${why ? ` — ${why}` : ''}`);
}
const isReverse = (n) => n.fill === INK.amber && n.text === INK.glass;
const isReverseBox = (c) => c.bg === INK.amber && c.color === INK.glass;
const isBold = (n) => Number(n.weight) >= 700;
const isAmberDashed = (c) => c.style === 'dashed' && c.border === INK.amber;

async function traversalRows(page, route, prefix, selectId, wantSteps) {
	const t = await evaluate(page, TRAVERSAL(selectId));
	if (t.error) {
		check(`${prefix}0`, route, false, t.error);
		return;
	}
	check(`${prefix}0`, route, t.moved && t.steps === wantSteps, `traversal stepped ${t.steps}`);
	row(`${prefix}1`, route, t.current, isReverse, 'current node: amber fill, glass label');
	row(`${prefix}2`, route, t.visited, (n) => n.text === INK.green, 'visited node: green label');
	row(`${prefix}3`, route, t.unvisited, (n) => n.text === INK.worn, 'unvisited node: worn label');
	row(`${prefix}4`, route, t.chipCurrent, isReverseBox, 'current chip: reverse video');
	row(`${prefix}5`, route, t.chipVisited, (c) => c.color === INK.green, 'visited chip: green');
}

async function heapRows(page, route) {
	// Add x3 (5, 3, 8): 8 lands without swimming, so it is `new`; 3 is the root.
	const h3 = await evaluate(page, HEAP_ADD(3));
	if (h3.error) {
		check('SS-H0', route, false, h3.error);
		return;
	}
	check('SS-H0', route, h3.added === 3, `heap Add x3 registered ${h3.added} (cells ${h3.size})`);
	row('SS-H1', route, h3.newCells, isReverseBox, 'new cell: reverse video');
	row('SS-H2', route, h3.newNodes, isReverse, 'new tree node: amber fill, glass label');
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
	row('SS-H5', route, h3.min ? [h3.min] : [], (m) => m.color === INK.green, 'MIN readout: green');

	// Add x1 more (1): swims to the root, so the path 1-3-5 is `swap`.
	const h4 = await evaluate(page, HEAP_ADD(1));
	if (h4.error) {
		check('SS-H6', route, false, h4.error);
		return;
	}
	check('SS-H6', route, h4.added === 1, `heap Add x4 registered (cells ${h4.size})`);
	row('SS-H7', route, h4.swapCells, isAmberDashed, 'swap cell: amber dashed border');
	row(
		'SS-H8',
		route,
		h4.swapNodes,
		(n) => n.stroke === INK.amber && n.dash !== 'none',
		'swap tree node: amber dashed stroke',
	);
	row('SS-H9', route, h4.setCells, (c) => c.color === INK.worn, 'set cell: worn');
}

async function removalRows(page, route) {
	// Step 3/6: target (4) and successor (5). Step 4/6: promoted. Step 5/6: removed.
	const r3 = await evaluate(page, REMOVAL(3));
	if (r3.error) {
		check('SS-R0', route, false, r3.error);
		return;
	}
	check('SS-R0', route, r3.step.startsWith('3/'), `removal at ${r3.step}`);
	row('SS-R1', route, r3.target, (n) => n.text === INK.amber && isBold(n), 'target: amber bold');
	row(
		'SS-R2',
		route,
		r3.successor,
		(n) => n.text === INK.green && isBold(n),
		'successor: green bold',
	);
	const r4 = await evaluate(page, REMOVAL(4));
	row(
		'SS-R3',
		route,
		r4.promoted ?? [],
		(n) => n.text === INK.amber && isBold(n),
		`promoted: amber bold (at ${r4.step})`,
	);
	const r5 = await evaluate(page, REMOVAL(5));
	row(
		'SS-R4',
		route,
		r5.removed ?? [],
		(n) => n.stroke === INK.faint,
		`removed: faint stroke (at ${r5.step})`,
	);
	check(
		'SS-R5',
		route,
		r3.edges === 6 && r5.edges === 5,
		`removed edge dropped (edges ${r3.edges} -> ${r5.edges})`,
	);
}

async function hashMapRows(page, route) {
	// Chaining, Insert x3 (5, 12, 19): all hash to bucket 5; the last is `chained`.
	const c = await evaluate(page, HASHMAP('chaining', 3));
	if (c.error) {
		check('SS-M0', route, false, c.error);
		return;
	}
	check('SS-M0', route, c.inserted === 3, `chaining Insert x3 registered ${c.inserted}`);
	const isLine = (b) => b.style === 'solid' && b.border === INK.line;
	row('SS-M1', route, c.placed, isLine, 'chaining placed: line border');
	row('SS-M2', route, c.collision, isAmberDashed, 'chained: amber dashed');
	// Probing, Insert x2 (5, 12): 12 collides at 5 and probes into 6.
	const p = await evaluate(page, HASHMAP('probing', 2));
	if (p.error) {
		check('SS-M3', route, false, p.error);
		return;
	}
	check(
		'SS-M3',
		route,
		p.strategy === 'probing' && p.inserted === 2,
		`probing Insert x2 registered ${p.inserted}`,
	);
	row('SS-M4', route, p.placed, isLine, 'probing placed: line border');
	row('SS-M5', route, p.probed, isAmberDashed, 'probed: amber dashed');
}

const ROUTES = [
	{ url: '/study/dsa-ii', course: 'dsa-ii' },
	{ url: '/ko/study/dsa-ii', course: 'dsa-ii' },
	{ url: '/study/dsa-iv', course: 'dsa-iv' },
	{ url: '/ko/study/dsa-iv', course: 'dsa-iv' },
];

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
		for (const { url, course } of ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${url}` });
			const hook =
				course === 'dsa-ii'
					? "!!document.querySelector('#bst-traversal-order') && !!document.querySelector('[data-viz=\"heap\"]')"
					: "!!document.querySelector('#graph-traversal-mode')";
			const isReady = await ready(page, hook, { timeoutMs: 15000 });
			if (!isReady) {
				check('SS-00', url, false, 'visualizers never rendered');
				continue;
			}
			const css = [AMBER_ONLY ? AMBER_ONLY_CSS : '', OLD_STATES ? OLD_STATES_CSS : ''].join('');
			if (css) {
				await evaluate(
					page,
					`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return true; })()`,
				);
			}
			if (course === 'dsa-ii') {
				await traversalRows(page, url, 'SS-T', 'bst-traversal-order', '1/6->2/6');
				await heapRows(page, url);
				await removalRows(page, url);
				await hashMapRows(page, url);
			} else {
				await traversalRows(page, url, 'SS-G', 'graph-traversal-mode', '1/10->2/10');
			}
		}
		console.log(
			failed === 0
				? `\nall ${rows} study state rows passed`
				: `\n${failed} of ${rows} row(s) failed`,
		);
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
