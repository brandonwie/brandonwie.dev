/**
 * Home preview pane (D6): row 01 without JavaScript, then hover AND focus.
 *
 * STATIC (reads next/build, no browser):
 *   HP-S1  index.html  the server-rendered preview previews row 01: its
 *                      data-preview-slug and title equal the first row's
 *   HP-S2  ko.html     the same on the Korean home
 *   HP-S3  both        the preview is aria-hidden and carries no link, so the
 *                      page's /posts/<slug> link order is only the ten rows
 *
 * BROWSER (1280px, where the pane is shown):
 *   HP-B1  focusing row 03 switches the preview to row 03's post
 *   HP-B2  then hovering row 05 (a real CDP mouse move) switches it to row 05
 *
 * POSITIVE CONTROLS (always run):
 *   HP-SC  a doctored index.html whose preview holds row 02's title and slug
 *          must be rejected by the HP-S1 verdict
 *   HP-BC  the page reloaded with a mutation that stops focusin/mouseover before
 *          React's root listener must FAIL HP-B1 and HP-B2
 *
 * Needs a build: run `pnpm build:next` first. Exit codes follow
 * browser-probe.mjs: 0 pass, 1 fail, 2 harness error, 3 skipped (no browser;
 * the static rows still print).
 *
 * Run: node scripts/assert-browser-home-preview.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	EXIT,
	evaluate,
	findBrowser,
	launch,
	mutateBehavior,
	ready,
	serve,
} from './browser-probe.mjs';

const BUILD = 'next/build';

/** The preview block of a built home page, or null. */
function previewBlock(html) {
	const start = html.indexOf('class="term-frame pg-home__pv"');
	if (start < 0) return null;
	const open = html.lastIndexOf('<div', start);
	// The pane is the recent grid's last child; it ends before the grid closes.
	const end = html.indexOf('</div></div>', start);
	return end < 0 ? null : html.slice(open, end + 6);
}

/** First row's slug and title, from `data-row="1"`. */
function rowAt(html, n) {
	const match = html.match(
		new RegExp(
			`<a[^>]*class="pg-home__post"[^>]*data-row="${n}"[^>]*>[\\s\\S]*?<h3 class="pg-home__ti">([\\s\\S]*?)</h3>`,
		),
	);
	if (!match) return null;
	const href = match[0].match(/href="[^"]*\/posts\/([^"]+)"/)?.[1] ?? null;
	return { slug: href, title: match[1] };
}

/** Null when the static preview previews row 01, else the reason. */
export function staticPreviewVerdict(html) {
	const block = previewBlock(html);
	if (!block) return 'no preview pane in the page';
	const first = rowAt(html, 1);
	if (!first) return 'no row 01 in the page';
	const slug = block.match(/data-preview-slug="([^"]+)"/)?.[1];
	const title = block.match(/<p class="pg-home__pv-ti">([\s\S]*?)<\/p>/)?.[1];
	if (slug !== first.slug) return `preview slug ${slug} != row 01 ${first.slug}`;
	if (title !== first.title) return `preview title "${title}" != row 01 "${first.title}"`;
	if (!/aria-hidden="true"/.test(block.slice(0, block.indexOf('>'))))
		return 'preview is not aria-hidden';
	if (/<a\s|href=/.test(block)) return 'preview contains a link';
	return null;
}

const HYDRATED = `(() => {
	const row = document.querySelector('.pg-home__post');
	return !!row && Object.keys(row).some((k) => k.startsWith('__reactProps'));
})()`;

/**
 * Stops the events React maps to onFocus / onMouseEnter before its root
 * listener. React derives enter/leave from the PREVIOUS element's `mouseout`
 * with the row as `relatedTarget`, so both ends of the event are checked.
 */
const BLOCK_ROW_EVENTS = `
	const inRow = (node) => node instanceof Element && !!node.closest('.pg-home__post');
	for (const type of ['focusin', 'mouseover', 'mouseout', 'pointerover', 'pointerout']) {
		window.addEventListener(type, (event) => {
			if (inRow(event.target) || inRow(event.relatedTarget)) event.stopPropagation();
		}, true);
	}
`;

const PREVIEW = `(() => {
	const pv = document.querySelector('.pg-home__pv');
	return pv ? {
		slug: pv.dataset.previewSlug,
		title: pv.querySelector('.pg-home__pv-ti')?.textContent ?? null,
		visible: pv.getBoundingClientRect().width > 0,
	} : null;
})()`;

const rowInfo = (n) => `(() => {
	const row = document.querySelector('.pg-home__post[data-row="${n}"]');
	if (!row) return null;
	return {
		slug: row.getAttribute('href').split('/posts/')[1],
		title: row.querySelector('.pg-home__ti')?.textContent ?? null,
	};
})()`;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function browserRun(page, port) {
	await page.send('Emulation.setDeviceMetricsOverride', {
		width: 1280,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
	await pause(200);
	if (!(await ready(page, HYDRATED, { timeoutMs: 15000 })))
		throw new Error('home rows never hydrated');
	// Park the pointer away from every row so only the probe's moves count.
	await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });

	const before = await evaluate(page, PREVIEW);
	const row3 = await evaluate(page, rowInfo(3));
	await evaluate(page, `document.querySelector('.pg-home__post[data-row="3"]').focus()`);
	await pause(150);
	const afterFocus = await evaluate(page, PREVIEW);

	const row5 = await evaluate(page, rowInfo(5));
	const box = await evaluate(
		page,
		`(() => {
			const row = document.querySelector('.pg-home__post[data-row="5"]');
			row.scrollIntoView({ block: 'center' });
			const r = row.getBoundingClientRect();
			return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
		})()`,
	);
	await pause(100);
	await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
	await pause(150);
	const afterHover = await evaluate(page, PREVIEW);
	return { before, row3, afterFocus, row5, afterHover };
}

const matches = (preview, row) =>
	!!preview && !!row && preview.slug === row.slug && preview.title === row.title;

async function main() {
	const results = [];
	const report = (id, ok, detail) => {
		results.push(ok);
		console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
	};

	const pages = { 'HP-S1': 'index.html', 'HP-S2': 'ko.html' };
	const html = {};
	for (const [id, file] of Object.entries(pages)) {
		const path = join(BUILD, file);
		if (!existsSync(path)) {
			console.error(`ERROR ${path} missing — run pnpm build:next first`);
			return EXIT.ERROR;
		}
		html[file] = readFileSync(path, 'utf8');
		const problem = staticPreviewVerdict(html[file]);
		report(
			id,
			problem === null,
			problem ?? `${file}: preview shows row 01 (${rowAt(html[file], 1).slug}) without JS`,
		);
	}
	const linkOrderOk = Object.values(html).every((page) => {
		const block = previewBlock(page);
		return block && !/href=/.test(block);
	});
	report(
		'HP-S3',
		linkOrderOk,
		linkOrderOk ? 'preview holds no link in either locale' : 'preview holds a link',
	);

	// Static positive control: preview doctored to row 02.
	const en = html['index.html'];
	const first = rowAt(en, 1);
	const second = rowAt(en, 2);
	const block = previewBlock(en);
	const doctoredBlock = block
		.replace(`data-preview-slug="${first.slug}"`, `data-preview-slug="${second.slug}"`)
		.replace(
			`<p class="pg-home__pv-ti">${first.title}</p>`,
			`<p class="pg-home__pv-ti">${second.title}</p>`,
		);
	const doctored = en.replace(block, doctoredBlock);
	report(
		'HP-SC',
		doctored !== en && staticPreviewVerdict(doctored) !== null,
		doctored === en
			? 'doctoring did not change the page — control is vacuous'
			: `preview on row 02 is rejected: ${staticPreviewVerdict(doctored)}`,
	);

	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; browser rows not run');
		return EXIT.SKIPPED;
	}

	let server = null;
	let page = null;
	let controlPage = null;
	try {
		server = await serve(BUILD);
		page = await launch();
		if (!page) {
			console.log('SKIP  browser could not launch');
			return EXIT.SKIPPED;
		}
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		const run = await browserRun(page, server.port);
		if (!run.before?.visible) throw new Error('preview pane is not visible at 1280px');
		report(
			'HP-B1',
			matches(run.afterFocus, run.row3) && !matches(run.before, run.row3),
			`focus row 03 → preview ${run.afterFocus?.slug} (row 03 is ${run.row3?.slug}; before: ${run.before?.slug})`,
		);
		report(
			'HP-B2',
			matches(run.afterHover, run.row5),
			`hover row 05 → preview ${run.afterHover?.slug} (row 05 is ${run.row5?.slug})`,
		);

		controlPage = await launch();
		await controlPage.send('Page.enable');
		await controlPage.send('Runtime.enable');
		await mutateBehavior(controlPage, BLOCK_ROW_EVENTS);
		const broken = await browserRun(controlPage, server.port);
		const caughtFocus = !matches(broken.afterFocus, broken.row3);
		const caughtHover = !matches(broken.afterHover, broken.row5);
		report(
			'HP-BC',
			caughtFocus && caughtHover,
			`with row events blocked: focus ${caughtFocus ? 'caught' : 'NOT caught'}, hover ${caughtHover ? 'caught' : 'NOT caught'} (preview stayed ${broken.afterHover?.slug})`,
		);

		const passed = results.filter(Boolean).length;
		console.log(`\n${results.length} rows: ${passed} passed`);
		return passed === results.length ? EXIT.PASS : EXIT.FAIL;
	} finally {
		for (const p of [controlPage, page]) {
			try {
				await p?.close();
			} catch (error) {
				console.warn(`WARN  browser teardown: ${error.message}`);
			}
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
