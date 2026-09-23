/**
 * migration:browser:mermaid — post diagrams are drawn in the shell inks.
 *
 * Found in the redesign's post-page review: the mermaid config still carried
 * the pre-redesign greys, and mermaid's own id-scoped stylesheet paints
 * `.edgeLabel p` with `edgeLabelBackground`, so every edge label sat on a grey
 * (#2d2d2d) box the page CSS never reached. The fix remaps `themeVariables`
 * onto the Phosphor Fade inks and scopes the leftover generated rules under the
 * post page CSS.
 *
 * This probe loads posts with mermaid fences in both locales, waits until every
 * `[data-mermaid]` holds an `<svg>`, then requires:
 *   MM-01  at least one rendered diagram per route (cannot pass vacuously);
 *   MM-02  every edge label (and its descendants) has a transparent or glass
 *          background;
 *   MM-03  every computed fill, stroke, text colour and background colour of
 *          every visible element inside each diagram is one of the inks
 *          (glass, amber, green, hi, worn, faint, line, off), `none` or fully
 *          transparent. `color` is checked where it paints: HTML label text
 *          and SVG text. A partially transparent ink counts as off-palette,
 *          because it composites into a colour that is not an ink.
 *
 * Positive control (must FAIL):
 *   node scripts/assert-browser-mermaid.mjs --grey
 * injects the old grey edge-label background (#2d2d2d on `.edgeLabel p`, the
 * rule mermaid generated from the previous config) before measuring.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { launch, serve, ready, evaluate, findBrowser, EXIT } from './browser-probe.mjs';

// ecr-ecs-deployment-workflow carries all four diagram families the corpus
// uses on one page: flowchart, graph, sequenceDiagram and gantt, 8 fences in
// each locale. websocket-architecture adds labelled flowchart edges.
const ROUTES = [
	'/posts/ecr-ecs-deployment-workflow',
	'/ko/posts/ecr-ecs-deployment-workflow',
	'/posts/websocket-architecture',
	'/ko/posts/websocket-architecture',
];
const GREY = process.argv.includes('--grey');

const INKS = {
	glass: '#0d0b13',
	amber: '#e0a35c',
	green: '#9fd6a7',
	hi: '#ece6d6',
	worn: '#d6cfbf',
	faint: '#857f72',
	line: '#4a4437',
	off: '#3d372c',
};

async function main() {
	if (!findBrowser()) {
		console.log('SKIPPED  no browser available');
		return EXIT.SKIPPED;
	}
	const server = await serve('next/build');
	let page;
	let failed = 0;
	const report = (ok, row, route, detail) => {
		if (!ok) failed += 1;
		console.log(`${ok ? 'PASS' : 'FAIL'}  ${row} ${route}  ${detail}`);
	};
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
			const drawn = await ready(
				page,
				`(() => {
					const all = document.querySelectorAll('.prose-terminal [data-mermaid], .prose-terminal [data-mermaid-error]');
					return all.length > 0 && [...all].every((el) => el.hasAttribute('data-mermaid-error') || el.querySelector('svg'));
				})()`,
				{ timeoutMs: 20000 },
			);
			if (drawn === false) {
				report(false, 'MM-01', route, 'diagrams never finished rendering');
				continue;
			}
			const raw = await evaluate(
				page,
				`(() => {
					${GREY ? `const s = document.createElement('style'); s.textContent = '.pg-post .prose-terminal [data-mermaid] svg .edgeLabel p { background-color: #2d2d2d !important; }'; document.head.appendChild(s);` : ''}
					const inks = ${JSON.stringify(Object.values(INKS))};
					const probe = document.createElement('canvas').getContext('2d');
					// Normalise any CSS colour to [r,g,b,a] through a 1x1 canvas.
					const rgba = (value) => {
						const m = value.match(/^rgba?\\(([^)]+)\\)$/);
						if (m) {
							const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
							return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
						}
						probe.clearRect(0, 0, 1, 1);
						probe.fillStyle = '#000';
						probe.fillStyle = value;
						probe.fillRect(0, 0, 1, 1);
						const d = probe.getImageData(0, 0, 1, 1).data;
						return [d[0], d[1], d[2], d[3] / 255];
					};
					const hex = ([r, g, b]) => '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
					const verdict = (value) => {
						if (!value || value === 'none' || value === 'transparent') return null;
						if (value.startsWith('url(')) return null; // markers/gradients: their own paint is walked
						const c = rgba(value);
						if (c[3] === 0) return null;
						if (c[3] === 1 && inks.includes(hex(c))) return null;
						return c[3] === 1 ? hex(c) : hex(c) + '@' + c[3];
					};
					const diagrams = [...document.querySelectorAll('.prose-terminal [data-mermaid] svg')];
					const offPalette = {};
					let checked = 0;
					for (const svg of diagrams) {
						for (const el of [svg, ...svg.querySelectorAll('*')]) {
							const cs = getComputedStyle(el);
							if (cs.display === 'none' || cs.visibility === 'hidden') continue;
							if (['style', 'defs', 'title', 'desc', 'br'].includes(el.localName)) continue;
							const props = { fill: cs.fill, stroke: cs.stroke, color: cs.color, 'background-color': cs.backgroundColor };
							// 'color' paints only HTML label text (foreignObject content) and
							// SVG text; on an SVG shape it paints nothing, and any currentColor
							// use already resolves into the computed fill/stroke checked here.
							// (Site CSS leaks e.g. \`.note { color }\` onto mermaid's rect.note.)
							const svgNs = el.namespaceURI === 'http://www.w3.org/2000/svg';
							if (svgNs && !['text', 'tspan'].includes(el.localName)) delete props.color;
							// A stroke only paints where it has width.
							if (cs.stroke !== 'none' && parseFloat(cs.strokeWidth) === 0) delete props.stroke;
							for (const [prop, value] of Object.entries(props)) {
								checked += 1;
								const bad = verdict(value);
								if (bad) {
									const key = prop + ' ' + bad;
									offPalette[key] ??= el.localName + (el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\\s+/).join('.') : '');
								}
							}
						}
					}
					const labels = [...document.querySelectorAll('.prose-terminal [data-mermaid] svg .edgeLabel')];
					const labelBackgrounds = [];
					for (const label of labels) {
						for (const el of [label, ...label.querySelectorAll('*')]) {
							const bg = getComputedStyle(el).backgroundColor;
							const c = rgba(bg);
							if (c[3] === 0) continue;
							if (c[3] === 1 && hex(c) === inks[0]) continue;
							labelBackgrounds.push(el.localName + ' ' + (c[3] === 1 ? hex(c) : hex(c) + '@' + c[3]));
						}
					}
					return JSON.stringify({
						diagrams: diagrams.length,
						errors: document.querySelectorAll('.prose-terminal [data-mermaid-error]').length,
						labels: labels.length,
						labelBackgrounds: [...new Set(labelBackgrounds)],
						checked,
						offPalette,
					});
				})()`,
			);
			const r = JSON.parse(raw);
			report(
				r.diagrams > 0 && r.errors === 0,
				'MM-01',
				route,
				`${r.diagrams} diagram(s) rendered, ${r.errors} render error(s)`,
			);
			report(
				r.labelBackgrounds.length === 0,
				'MM-02',
				route,
				`${r.labels} edge label(s), off-glass backgrounds: ${r.labelBackgrounds.length ? r.labelBackgrounds.join(', ') : 'none'}`,
			);
			const off = Object.entries(r.offPalette);
			report(
				r.diagrams > 0 && off.length === 0,
				'MM-03',
				route,
				`${r.checked} paint value(s) checked, off-palette: ${off.length ? off.map(([k, v]) => `${k} (${v})`).join('; ') : 'none'}`,
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
