/**
 * Posts category filter in a real browser (`/posts`, `/ko/posts`).
 *
 * The filter is client-side `useState` on already-rendered entries (D7), so
 * only a browser can prove it. Per locale:
 *
 *   PF-1  on load: All is pressed, every entry is listed, count line `// N · <all>`
 *   PF-2  selecting a category: only that category's entries remain, the count
 *         line reads `// n · <category>`, the button is aria-pressed="true" and
 *         every other button "false", and the URL does not change
 *   PF-3  clicking the selected category again keeps it selected (no toggle-off)
 *   PF-4  All restores every entry and is the only pressed button
 *
 * POSITIVE CONTROL (always runs, per locale): the page is reloaded with a
 * behavioural mutation that swallows clicks on the filter buttons before React
 * sees them, and PF-2 MUST then fail. A probe that passed under that mutation
 * would not be observing the filter at all.
 *
 * Needs a build: run `pnpm build:next` first. Exit codes follow
 * browser-probe.mjs: 0 pass, 1 fail, 2 harness error, 3 skipped (no browser).
 *
 * Run: node scripts/assert-browser-posts-filter.mjs
 */
import {
	EXIT,
	evaluate,
	findBrowser,
	launch,
	mutateBehavior,
	ready,
	serve,
} from './browser-probe.mjs';

const LOCALES = [
	{ route: '/posts', all: 'all' },
	{ route: '/ko/posts', all: '전체' },
];

/** React has hydrated the filter once its props are attached to a button. */
const HYDRATED = `(() => {
	const b = document.querySelector('.pg-posts__cat');
	return !!b && Object.keys(b).some((k) => k.startsWith('__reactProps'));
})()`;

/** Swallows filter clicks in the capture phase, before React's root listener. */
const SWALLOW_FILTER_CLICKS = `
	window.addEventListener('click', (event) => {
		if (event.target instanceof Element && event.target.closest('.pg-posts__cat')) {
			event.stopPropagation();
		}
	}, true);
`;

const STATE = `(() => {
	const buttons = [...document.querySelectorAll('.pg-posts [role="group"] button')];
	const entries = [...document.querySelectorAll('.pg-posts__entry')];
	return {
		href: location.href,
		count: document.querySelector('.pg-posts__count')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
		buttons: buttons.map((b) => ({
			name: b.querySelector('.pg-posts__nm')?.textContent ?? '',
			count: Number(b.querySelector('.pg-posts__c')?.textContent ?? NaN),
			pressed: b.getAttribute('aria-pressed'),
		})),
		entries: entries.map((e) => e.querySelector('.pg-posts__cat-col')?.textContent ?? ''),
	};
})()`;

const click = (index) =>
	`document.querySelectorAll('.pg-posts [role="group"] button')[${index}].click()`;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function visit(page, server, route) {
	await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route}` });
	await pause(200);
	if (!(await ready(page, HYDRATED, { timeoutMs: 15000 }))) {
		throw new Error(`${route}: the filter never hydrated`);
	}
	return evaluate(page, STATE);
}

async function clickAndRead(page, index) {
	await evaluate(page, click(index));
	await pause(150);
	return evaluate(page, STATE);
}

/** Null when `state` shows exactly `category` selected, else the reason. */
function selectedProblem(state, category, expectedCount, url) {
	const index = state.buttons.findIndex((b) => b.name === category);
	if (index < 0) return `no button named ${category}`;
	const wrongPressed = state.buttons.filter(
		(b, i) => b.pressed !== (i === index ? 'true' : 'false'),
	);
	if (wrongPressed.length)
		return `aria-pressed wrong on ${wrongPressed.map((b) => b.name).join(', ')}`;
	if (state.entries.length !== expectedCount)
		return `${state.entries.length} entries listed, expected ${expectedCount}`;
	const stray = state.entries.filter((c) => c !== category);
	if (stray.length) return `${stray.length} entries from other categories (${stray[0]})`;
	if (state.count !== `// ${expectedCount} · ${category}`) return `count line "${state.count}"`;
	if (state.href !== url) return `URL changed to ${state.href}`;
	return null;
}

async function main() {
	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; set CHROME_BINARY to point at one');
		return EXIT.SKIPPED;
	}
	const results = [];
	const report = (id, ok, detail) => {
		results.push(ok);
		console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
	};

	let server = null;
	let page = null;
	let controlPage = null;
	try {
		server = await serve('next/build');
		page = await launch();
		if (!page) {
			console.log('SKIP  browser could not launch');
			return EXIT.SKIPPED;
		}
		await page.send('Page.enable');
		await page.send('Runtime.enable');

		for (const { route, all } of LOCALES) {
			const url = `http://127.0.0.1:${server.port}${route}`;
			const initial = await visit(page, server, route);
			const total = initial.entries.length;
			const allButton = initial.buttons[0];
			const onlyAllPressed =
				allButton?.pressed === 'true' &&
				initial.buttons.slice(1).every((b) => b.pressed === 'false');
			report(
				`PF-1 ${route}`,
				total > 0 &&
					onlyAllPressed &&
					allButton.count === total &&
					initial.count === `// ${total} · ${all}`,
				`${total} entries, count line "${initial.count}", All pressed=${allButton?.pressed}`,
			);

			// A category that is neither the largest nor a singleton, so a filter
			// that returned "everything" or "the first entry" cannot pass.
			const pick = initial.buttons.findIndex((b, i) => i > 1 && b.count > 1 && b.count < total / 2);
			if (pick < 1) throw new Error(`${route}: no mid-sized category to select`);
			const target = initial.buttons[pick];

			const selected = await clickAndRead(page, pick);
			const p2 = selectedProblem(selected, target.name, target.count, url);
			report(
				`PF-2 ${route}`,
				p2 === null,
				p2 ?? `${target.name}: ${target.count} entries, "${selected.count}"`,
			);

			const again = await clickAndRead(page, pick);
			const p3 = selectedProblem(again, target.name, target.count, url);
			report(`PF-3 ${route}`, p3 === null, p3 ?? `re-click keeps ${target.name} selected`);

			const restored = await clickAndRead(page, 0);
			const p4 =
				restored.entries.length !== total
					? `${restored.entries.length} entries after All, expected ${total}`
					: restored.buttons.some((b, i) => b.pressed !== (i === 0 ? 'true' : 'false'))
						? 'aria-pressed not restored to All only'
						: restored.count !== `// ${total} · ${all}`
							? `count line "${restored.count}"`
							: null;
			report(`PF-4 ${route}`, p4 === null, p4 ?? `All restores ${total} entries`);
		}

		// Positive control: swallow filter clicks; PF-2 must now fail.
		controlPage = await launch();
		await controlPage.send('Page.enable');
		await controlPage.send('Runtime.enable');
		await mutateBehavior(controlPage, SWALLOW_FILTER_CLICKS);
		for (const { route } of LOCALES) {
			const url = `http://127.0.0.1:${server.port}${route}`;
			const initial = await visit(controlPage, server, route);
			const pick = initial.buttons.findIndex(
				(b, i) => i > 1 && b.count > 1 && b.count < initial.entries.length / 2,
			);
			const target = initial.buttons[pick];
			const state = await clickAndRead(controlPage, pick);
			const problem = selectedProblem(state, target.name, target.count, url);
			report(
				`PF-C ${route}`,
				problem !== null,
				problem !== null
					? `swallowed clicks are caught: ${problem}`
					: 'PF-2 PASSED with clicks swallowed — the probe cannot fail',
			);
		}

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
