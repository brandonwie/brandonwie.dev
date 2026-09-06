/**
 * migration:browser:palette — ONE rendered-stage assertion, executed.
 *
 * SPIKE deliverable. The claim under test: pressing the palette chord on the
 * fixture route opens the palette. That behavior is invisible to every existing
 * suite, because `migration:shell` and its siblings read exported HTML and the
 * palette exists only after hydration and only after a key event.
 *
 *   node scripts/assert-browser-palette.mjs                # assert
 *   node scripts/assert-browser-palette.mjs --suppress     # negative control
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 skipped (no browser).
 * SKIPPED is NOT a pass: a caller that treats 3 as success turns "no browser in
 * CI" into a permanently green suite, which is the exact false-green shape this
 * migration has already paid for twice.
 */
import {
	launch,
	serve,
	ready,
	chord,
	evaluate,
	mutateBehavior,
	findBrowser,
	EXIT,
} from './browser-probe.mjs';

const ROUTE = '/migration-fixture/palette';
const SUPPRESS = process.argv.includes('--suppress');

/**
 * The behavioral mutation, for the negative control.
 *
 * A capturing listener that stops the event before it reaches the app's own
 * window listener. Nothing on disk changes, so this control cannot leave a
 * mutated tree behind the way a file-mutating control can.
 */
const SUPPRESS_CHORD = `
	window.addEventListener('keydown', (e) => { e.stopImmediatePropagation(); }, true);
`;

async function main() {
	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; set CHROME_BINARY to point at one');
		return EXIT.SKIPPED;
	}

	const server = await serve('next/build');
	const page = await launch();
	if (!page) {
		server.close();
		console.log('SKIP  browser could not launch');
		return EXIT.SKIPPED;
	}

	try {
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		if (SUPPRESS) await mutateBehavior(page, SUPPRESS_CHORD);

		await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${ROUTE}` });

		// Hydration, not just load. The fixture's own heading is server-rendered,
		// so it is not a hydration signal; React having attached is.
		const interactive = await ready(
			page,
			'Boolean(document.querySelector("[data-palette-fixture]") || document.body.dataset.hydrated || window.next)',
		);
		if (!interactive) {
			console.log('FAIL  the page never reached an interactive state');
			return EXIT.FAIL;
		}

		const before = await evaluate(page, 'Boolean(document.querySelector(".cmdk-overlay"))');
		if (before) {
			console.log(
				'FAIL  the palette was already open before the chord; the assertion would pass vacuously',
			);
			return EXIT.FAIL;
		}

		await chord(page, 'k', { meta: true });

		// The open is a React state update, so it lands on a later frame than the
		// dispatch. Poll rather than read once.
		const opened = await pollFor(page, 'Boolean(document.querySelector(".cmdk-overlay"))');
		if (!opened) {
			console.log(
				`FAIL  BP-01  the palette did not open on the chord${SUPPRESS ? ' (expected: --suppress)' : ''}`,
			);
			return EXIT.FAIL;
		}

		const role = await evaluate(
			page,
			'document.querySelector(".cmdk-overlay")?.getAttribute("role")',
		);
		if (role !== 'dialog') {
			console.log(
				`FAIL  BP-01  the palette opened but its role is ${JSON.stringify(role)}, not "dialog"`,
			);
			return EXIT.FAIL;
		}

		console.log(
			'PASS  BP-01  the palette chord opens a role="dialog" overlay on the fixture route',
		);
		return EXIT.PASS;
	} finally {
		// Each teardown is independent. Found by running the spike: when
		// `page.close()` threw, `server.close()` never ran and a server process
		// outlived the probe — the same leak that later fails an unrelated suite
		// on a busy port. A teardown step must not be able to skip its sibling.
		try {
			await page.close();
		} catch (error) {
			console.warn(`WARN  browser teardown: ${error.message}`);
		}
		try {
			server.close();
		} catch (error) {
			console.warn(`WARN  server teardown: ${error.message}`);
		}
	}
}

async function pollFor(page, expression, timeoutMs = 4000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await evaluate(page, expression)) return true;
		if (Date.now() > deadline) return false;
		await new Promise((r) => setTimeout(r, 50));
	}
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(`ERROR ${error.message}`);
		process.exit(EXIT.ERROR);
	});
