/**
 * migration:browser:shell-layout — the full-bleed enclosure and the header nav.
 *
 * User instruction 2026-09-23: the CRT enclosure is the page (its glowing
 * border sits on the page edges, not a card floating inside the page), and the
 * header carries every navigation link. This probe loads each route at a
 * desktop and a phone viewport and requires, with `vw` = the layout viewport
 * (`documentElement.clientWidth`, scrollbar excluded) and `vh` = innerHeight:
 *
 *   SL-01 enclosure  `.term-crt` at left 0 / top 0, width == vw, height >= vh
 *   SL-02 no h-scroll  documentElement.scrollWidth <= vw
 *   SL-03 header nav  `header.term-bar nav` visible above the fold with all 8
 *                     links inside the viewport, each >= 24px tall
 *   SL-04 status line  its bottom sits on the enclosure's bottom (1px border),
 *                     so short pages put it at the bottom of the viewport
 *   SL-05 column     `main` keeps the old reading column:
 *                     min(854, vw - 2px border - 2 x gutter)
 *
 * Positive controls (must FAIL), driven by assert-browser-shell-layout-controls.mjs:
 *   --boxed   re-injects the old boxed layout (960px max-width, 24px page padding)
 *   --no-nav  hides the header nav
 *   --no-grow drops the enclosure's min-height (short pages end mid-viewport)
 *   --no-flex drops the flex column (the status line floats above the bottom)
 *
 * /search and the 404 are shorter than the desktop viewport, which is what lets
 * the last two controls fail.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { launch, serve, ready, evaluate, findBrowser, EXIT } from './browser-probe.mjs';

const ROUTES = [
	'/',
	'/posts',
	'/ko/posts',
	'/posts/sync-token-invalidation-recovery',
	'/study/dsa-ii',
	'/system/3b',
	'/projects',
	'/search',
	'/this-route-does-not-exist',
];
const VIEWPORTS = [
	{ width: 1280, height: 800, mobile: false, gutter: 26 },
	{ width: 375, height: 812, mobile: true, gutter: 16 },
];
/** Old glass width 906 minus two 26px gutters: the column every page was laid out in. */
const COLUMN = 854;

const BOXED = process.argv.includes('--boxed');
const NO_NAV = process.argv.includes('--no-nav');
const NO_GROW = process.argv.includes('--no-grow');
const NO_FLEX = process.argv.includes('--no-flex');

const DEFECT_CSS = [
	BOXED
		? '.term-page { max-width: 960px !important; margin-inline: auto !important; padding: 24px !important; } .term-crt { border-radius: 14px !important; padding: 2px !important; }'
		: '',
	NO_NAV ? '.term-bar__nav { display: none !important; }' : '',
	NO_GROW ? '.term-page, .term-crt { min-height: 0 !important; }' : '',
	NO_FLEX ? '.term-crt, .term-glass { display: block !important; }' : '',
].join(' ');

const MEASURE = `(() => {
	${DEFECT_CSS ? `const s = document.createElement('style'); s.textContent = ${JSON.stringify(DEFECT_CSS)}; document.head.appendChild(s);` : ''}
	window.scrollTo(0, 0);
	const de = document.documentElement;
	const box = (el) => {
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
	};
	const nav = document.querySelector('header.term-bar nav');
	const links = nav ? [...nav.querySelectorAll('a')] : [];
	const visible = (el) => {
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
	};
	return JSON.stringify({
		vw: de.clientWidth,
		vh: window.innerHeight,
		scrollWidth: de.scrollWidth,
		crt: box(document.querySelector('.term-crt')),
		status: box(document.querySelector('.term-status')),
		main: box(document.querySelector('main#main-content')),
		nav: nav && visible(nav) ? box(nav) : null,
		links: links.map((a) => ({ text: a.textContent.trim(), visible: visible(a), ...box(a) })),
	});
})()`;

function check(route, vp, m) {
	const rows = [];
	const row = (id, ok, detail) => rows.push({ id, ok, detail });
	const tag = `${route} @${vp.width}`;

	const c = m.crt;
	row(
		'SL-01',
		Boolean(c) &&
			Math.abs(c.left) < 0.5 &&
			Math.abs(c.top) < 0.5 &&
			Math.abs(c.width - m.vw) < 0.5 &&
			c.height >= m.vh - 0.5,
		`${tag} crt ${c ? `left ${c.left} top ${c.top} ${c.width}x${Math.round(c.height)}` : 'missing'}; viewport ${m.vw}x${m.vh}`,
	);
	row('SL-02', m.scrollWidth <= m.vw, `${tag} scrollWidth ${m.scrollWidth} <= ${m.vw}`);

	const clipped = m.links.filter(
		(l) => !l.visible || l.left < -0.5 || l.right > m.vw + 0.5 || l.height < 24,
	);
	row(
		'SL-03',
		Boolean(m.nav) && m.links.length === 8 && clipped.length === 0 && m.nav.bottom <= m.vh,
		`${tag} nav ${m.nav ? `bottom ${Math.round(m.nav.bottom)}` : 'not visible'}, ${m.links.length} link(s) [${m.links.map((l) => l.text).join(' ')}]` +
			(clipped.length ? `; clipped/short: ${clipped.map((l) => l.text).join(' ')}` : ''),
	);

	row(
		'SL-04',
		Boolean(c && m.status) && Math.abs(c.bottom - m.status.bottom) <= 1.5,
		`${tag} status bottom ${m.status ? Math.round(m.status.bottom) : 'missing'}, crt bottom ${c ? Math.round(c.bottom) : 'missing'}`,
	);

	const want = Math.min(COLUMN, m.vw - 2 - 2 * vp.gutter);
	row(
		'SL-05',
		Boolean(m.main) && Math.abs(m.main.width - want) < 1,
		`${tag} main width ${m.main ? m.main.width : 'missing'}, want ${want}`,
	);
	return rows;
}

async function main() {
	if (!findBrowser()) {
		console.log('SKIPPED  no browser available');
		return EXIT.SKIPPED;
	}
	const server = await serve('next/build');
	let page;
	let failed = 0;
	let total = 0;
	try {
		page = await launch();
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		for (const vp of VIEWPORTS) {
			await page.send('Emulation.setDeviceMetricsOverride', {
				width: vp.width,
				height: vp.height,
				deviceScaleFactor: 1,
				mobile: vp.mobile,
			});
			for (const route of ROUTES) {
				await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route}` });
				const ok = await ready(
					page,
					"document.querySelectorAll('header.term-bar a').length > 0 && document.fonts.status === 'loaded'",
					{ timeoutMs: 15000 },
				);
				if (!ok) throw new Error(`${route} @${vp.width} never became ready`);
				const m = JSON.parse(await evaluate(page, MEASURE));
				for (const r of check(route, vp, m)) {
					total += 1;
					if (!r.ok) failed += 1;
					console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.detail}`);
				}
			}
		}
		console.log(`\n${total - failed}/${total} rows passed`);
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
