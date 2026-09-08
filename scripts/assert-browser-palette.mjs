/**
 * migration:browser — the palette's rendered-stage assertions, executed.
 *
 * These claims are invisible to every static suite: `migration:shell` and its
 * siblings read exported HTML, and the palette exists only after hydration and
 * only after a key press or a click. What the browser can see, and the source
 * suites cannot, is that the mount reached BOTH locale layouts, that exactly
 * one host answers on a page, and where a palette selection actually lands.
 *
 *   node scripts/assert-browser-palette.mjs                    # assert
 *   node scripts/assert-browser-palette.mjs --suppress         # BP-01 control
 *   node scripts/assert-browser-palette.mjs --clear-marker     # BP-00 gate control
 *   node scripts/assert-browser-palette.mjs --stale-marker     # BP-01 control
 *   node scripts/assert-browser-palette.mjs --second-overlay   # BP-03 control
 *   node scripts/assert-browser-palette.mjs --block-navigation # BP-04 control
 *   node scripts/assert-browser-palette.mjs --client-nav       # BP-04 control
 *   node scripts/assert-browser-palette.mjs --wrong-destination# BP-04 control
 *
 * WHAT THE CONTROLS PROVE, EXACTLY. Every flag above mutates the live DOM, not
 * the application bytes: `mutateBehavior` is
 * `Page.addScriptToEvaluateOnNewDocument`, so it can suppress an event or add a
 * node, and it can NOT mount a React subtree, detach a listener, or replace the
 * navigation adapter. A flag that simulates a scenario is labelled as an
 * ASSERTION or GATE control in its row text; the scenarios themselves —
 * duplicate mounts, a missing locale mount, adapter identity — are reproduced at
 * source in `migration:gsap-palette` rows M1-M4, where a mutation can really
 * create them.
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
	until,
	EXIT,
} from './browser-probe.mjs';

const EN_ROUTE = '/migration-fixture/palette';
const KO_ROUTE = '/ko/system/3b';
/** Same-root by construction: an `(en)` page navigating to an `(en)` route. */
const DESTINATION = '/posts/giscus-sveltekit-integration';
const DESTINATION_QUERY = 'giscus';

const flag = (name) => process.argv.includes(name);
const SUPPRESS = flag('--suppress');
const BLOCK_HYDRATION = flag('--block-hydration');
const CLEAR_MARKER = flag('--clear-marker');
const STALE_MARKER = flag('--stale-marker');
const SECOND_OVERLAY = flag('--second-overlay');
const BLOCK_NAVIGATION = flag('--block-navigation');
const CLIENT_NAV = flag('--client-nav');
const WRONG_DESTINATION = flag('--wrong-destination');

/** The controller sets this with its listener and clears it in the cleanup. */
const READY = "document.body.dataset.paletteReady === 'true'";

/**
 * A capturing listener that stops the chord before it reaches the app's own
 * window listener. Nothing on disk changes, so this control cannot leave a
 * mutated tree behind the way a file-mutating control can.
 */
const SUPPRESS_CHORD = `
	window.addEventListener('keydown', (e) => { e.stopImmediatePropagation(); }, true);
`;

/** Readiness must fail closed when the marker is absent, listener or not. */
const CLEAR_READY_MARKER = `
	setInterval(() => { document.body?.removeAttribute('data-palette-ready'); }, 5);
`;

/**
 * The marker is forced to stay while the chord is suppressed — readiness passes
 * and the chord row must be the thing that fails. The pair distinguishes two
 * proofs that a single "detachment" control would have blurred.
 */
const STALE_READY_MARKER = `
	${SUPPRESS_CHORD}
	const mark = () => { document.body.dataset.paletteReady = 'true'; };
	document.addEventListener('DOMContentLoaded', mark);
	setInterval(mark, 25);
`;

/** A cloned overlay: proves the COUNT assertion fails, not that two hosts exist. */
const INJECT_SECOND_OVERLAY = `
	// setInterval, not a MutationObserver: this script runs at document start,
	// before \`document.documentElement\` exists, so an observer attached here
	// throws and takes the rest of the injected script with it. The first version
	// did exactly that and reported a control that never reproduced its scenario.
	setInterval(() => {
		const nodes = document.querySelectorAll('.cmdk-overlay');
		if (nodes.length === 1) document.body.appendChild(nodes[0].cloneNode(true));
	}, 1);
`;

/** Adapter controls, all at the DOM level, all labelled for what they simulate. */
const STOP_SELECTION = `
	window.addEventListener('click', (e) => {
		if (e.target.closest('[data-result-index]')) e.stopImmediatePropagation();
	}, true);
`;
// One listener per control: a second capturing listener added after
// STOP_SELECTION would never run, because stopImmediatePropagation ends the
// dispatch — the first version of these two controls made exactly that mistake
// and reported "did not navigate" for both.
const FAKE_CLIENT_NAV = `
	window.addEventListener('click', (e) => {
		if (!e.target.closest('[data-result-index]')) return;
		e.stopImmediatePropagation();
		history.pushState({}, '', ${JSON.stringify(DESTINATION)});
	}, true);
`;
const WRONG_TARGET = `
	window.addEventListener('click', (e) => {
		if (!e.target.closest('[data-result-index]')) return;
		e.stopImmediatePropagation();
		window.location.assign('/');
	}, true);
`;

const results = [];
const report = (id, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

const overlayCount = (page) => evaluate(page, "document.querySelectorAll('.cmdk-overlay').length");
const openOverlay = (page) =>
	until(async () => (await overlayCount(page)) > 0, { timeoutMs: 4000 });

async function visit(page, server, route) {
	await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route}` });
	return ready(page, READY);
}

async function main() {
	if (!findBrowser()) {
		console.log('SKIP  no Chrome or Chromium found; set CHROME_BINARY to point at one');
		return EXIT.SKIPPED;
	}

	let server = null;
	let page = null;
	try {
		// Acquisition is inside the try, so a launch fault cannot skip the server's
		// teardown. Found in review: `launch()` throwing left the server running and
		// the profile on disk, because the finally block had not been entered yet.
		server = await serve('next/build');
		page = await launch();
		if (!page) {
			console.log('SKIP  browser could not launch');
			return EXIT.SKIPPED;
		}

		await page.send('Page.enable');
		await page.send('Runtime.enable');
		if (SUPPRESS) await mutateBehavior(page, SUPPRESS_CHORD);
		if (CLEAR_MARKER) await mutateBehavior(page, CLEAR_READY_MARKER);
		if (STALE_MARKER) await mutateBehavior(page, STALE_READY_MARKER);
		if (SECOND_OVERLAY) await mutateBehavior(page, INJECT_SECOND_OVERLAY);
		if (BLOCK_NAVIGATION) await mutateBehavior(page, STOP_SELECTION);
		if (CLIENT_NAV) await mutateBehavior(page, FAKE_CLIENT_NAV);
		if (WRONG_DESTINATION) await mutateBehavior(page, WRONG_TARGET);
		if (BLOCK_HYDRATION) {
			await page.send('Network.enable');
			await page.send('Network.setBlockedURLs', { urls: ['*/_next/*.js*'] });
			// A bootstrap global must not satisfy readiness without client effects.
			await mutateBehavior(page, 'window.next = {};');
		}

		// --- BP-00: readiness is the controller's, and it is a gate ------------
		if (!(await visit(page, server, EN_ROUTE))) {
			report('BP-00', false, 'the palette never reported ready on the EN route');
			return EXIT.FAIL;
		}
		report('BP-00', true, 'the controller marked the EN route ready after attaching its listener');

		// --- BP-01: the chord opens the palette --------------------------------
		if (await overlayCount(page)) {
			report('BP-01', false, 'the palette was already open; the assertion would pass vacuously');
			return EXIT.FAIL;
		}
		await chord(page, 'k', { meta: true });
		// The open is a React state update, so it lands on a later frame than the
		// dispatch. Poll rather than read once.
		const opened = await openOverlay(page);
		const role = opened
			? await evaluate(page, 'document.querySelector(".cmdk-overlay")?.getAttribute("role")')
			: null;
		report(
			'BP-01',
			opened && role === 'dialog',
			opened
				? `the chord opened a role=${JSON.stringify(role)} overlay`
				: `the palette did not open on the chord${SUPPRESS ? ' (expected: --suppress)' : ''}`,
		);

		// --- BP-03: exactly one host answers -----------------------------------
		// A second host would mean two overlays and two chord listeners on one
		// page. `querySelector` cannot see the difference; a count can.
		// Read the count twice and keep the larger. A second host does not appear
		// on the same frame as the first, so a single read can be taken in the gap
		// between them and report "one" for a page that carries two. The real
		// mount adds nothing after the open, so the settle window costs it nothing.
		const firstCount = await overlayCount(page);
		await new Promise((resolve) => setTimeout(resolve, 250));
		const overlays = Math.max(firstCount, await overlayCount(page));
		const markers = await evaluate(
			page,
			"document.querySelectorAll('[data-palette-ready]').length",
		);
		report(
			'BP-03',
			overlays === 1 && markers === 1,
			`${overlays} overlay(s) and ${markers} readiness marker(s) after one chord`,
		);

		// --- BP-04: the palette navigates, and the document is replaced --------
		// The beacon is seeded with `evaluate` on the CURRENT document. Seeding it
		// through `mutateBehavior` would register the script for FUTURE documents
		// too, re-seeding the destination and making "preserved" the only possible
		// answer. Its absence afterwards is evidence the document was REPLACED —
		// not evidence of which adapter did it; adapter identity is row M3's.
		const beacon = `probe-${Date.now()}`;
		await evaluate(page, `window.__paletteBeacon = ${JSON.stringify(beacon)};`);
		await page.send('Input.insertText', { text: DESTINATION_QUERY });
		const hasRow = await until(
			async () => Boolean(await evaluate(page, "!!document.querySelector('[data-result-index]')")),
			{ timeoutMs: 4000 },
		);
		if (!hasRow) {
			report('BP-04', false, `no palette row matched ${DESTINATION_QUERY}`);
		} else {
			await evaluate(page, "document.querySelector('[data-result-index]').click()");
			const arrived = await until(
				async () => (await evaluate(page, 'location.pathname')) === DESTINATION,
				{ timeoutMs: 6000 },
			);
			const survived = await evaluate(page, `window.__paletteBeacon === ${JSON.stringify(beacon)}`);
			const where = await evaluate(page, 'location.pathname');
			report(
				'BP-04',
				arrived && !survived,
				arrived
					? survived
						? 'the destination was reached without replacing the document'
						: `the palette navigated to ${where} and the document was replaced`
					: `the palette did not reach ${DESTINATION}; it is at ${where}`,
			);
		}

		// --- BP-02: the mount reached BOTH locale layouts ----------------------
		// Run last: it navigates away, and a missing KO mount fails this row on its
		// own, with no mutation to simulate the absence.
		for (const [id, route] of [
			['BP-02a', EN_ROUTE],
			['BP-02b', KO_ROUTE],
		]) {
			const live = await visit(page, server, route);
			if (!live) {
				report(id, false, `${route} never reported the palette ready`);
				continue;
			}
			const before = await overlayCount(page);
			await evaluate(page, "document.querySelector('.site-nav__cmd').click()");
			const viaButton = await openOverlay(page);
			report(
				id,
				before === 0 && viaButton,
				viaButton
					? `the header button opened the palette on ${route}`
					: `the header button is inert on ${route}`,
			);
		}

		const passed = results.filter(Boolean).length;
		console.log(`\n${results.length} rows: ${passed} passed`);
		return passed === results.length ? EXIT.PASS : EXIT.FAIL;
	} finally {
		// Each teardown is independent, and each is null-safe because either
		// acquisition may not have happened. Found by running the spike: when
		// `page.close()` threw, `server.close()` never ran and a server process
		// outlived the probe — the same leak that later fails an unrelated suite
		// on a busy port. A teardown step must not be able to skip its sibling.
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
