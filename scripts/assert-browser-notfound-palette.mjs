/**
 * migration:browser:notfound-palette — the B3 regression row.
 *
 * B3: ⌘K / Ctrl+K did nothing on the 404 page, because `global-not-found`
 * rendered the shell with no palette controller. The fix mounts
 * `ShellPalette` as that shell's header (pinned cwd `~`, no locale toggle).
 *
 * Each row loads an unmatched URL in a real browser, waits for the 404 panel
 * and for the controller's `data-palette-ready` marker, dispatches the chord,
 * and requires exactly one `.cmdk-overlay` with role="dialog". Escape closes it
 * between chords so the second chord is proven on its own.
 *
 * Positive control (must FAIL):
 *   node scripts/assert-browser-notfound-palette.mjs --swallow-chord
 * swallows every keydown in the capture phase before the controller sees it.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import {
	launch,
	serve,
	ready,
	evaluate,
	chord,
	until,
	mutateBehavior,
	findBrowser,
	EXIT,
} from './browser-probe.mjs';

const SWALLOW_CHORD = process.argv.includes('--swallow-chord');

const SWALLOW_SCRIPT = `
	window.addEventListener('keydown', (e) => { e.stopImmediatePropagation(); }, true);
`;

const ROUTES = [
	{ id: 'NP-01', url: '/this-route-does-not-exist', key: { meta: true }, label: '⌘K' },
	{ id: 'NP-02', url: '/this-route-does-not-exist', key: { ctrl: true }, label: 'Ctrl+K' },
	{ id: 'NP-03', url: '/ko/does-not-exist', key: { meta: true }, label: '⌘K' },
	{ id: 'NP-04', url: '/ko/does-not-exist', key: { ctrl: true }, label: 'Ctrl+K' },
];

const overlayCount = (page) => evaluate(page, "document.querySelectorAll('.cmdk-overlay').length");

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
		if (SWALLOW_CHORD) await mutateBehavior(page, SWALLOW_SCRIPT);

		for (const route of ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route.url}` });
			const panel = await ready(page, "!!document.querySelector('#not-found-title')");
			if (!panel) {
				report(route.id, false, `${route.url} — the 404 panel never rendered`);
				continue;
			}
			// The marker is set with the chord listener; without a controller it
			// never appears, which is B3 itself.
			const armed = await until(
				async () =>
					Boolean(await evaluate(page, "document.body.hasAttribute('data-palette-ready')")),
				{ timeoutMs: 5000 },
			);
			if ((await overlayCount(page)) !== 0) {
				report(route.id, false, `${route.url} — an overlay was open before the chord`);
				continue;
			}
			await chord(page, 'k', route.key);
			const opened = await until(async () => (await overlayCount(page)) > 0, { timeoutMs: 4000 });
			await new Promise((resolve) => setTimeout(resolve, 250));
			const count = await overlayCount(page);
			const role = opened
				? await evaluate(page, "document.querySelector('.cmdk-overlay')?.getAttribute('role')")
				: null;
			const ok = armed && opened && count === 1 && role === 'dialog';
			report(
				route.id,
				ok,
				`${route.url} ${route.label}: ready=${armed} overlays=${count} role=${JSON.stringify(role)}`,
			);
			if (opened) {
				// `chord` takes printable keys only; Escape is dispatched directly.
				const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
				await page.send('Input.dispatchKeyEvent', { ...escape, type: 'rawKeyDown' });
				await page.send('Input.dispatchKeyEvent', { ...escape, type: 'keyUp' });
				await until(async () => (await overlayCount(page)) === 0, { timeoutMs: 2000 });
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
