/**
 * migration:browser:deck — the talk deck opens presenting and keeps its keys.
 *
 * Two defects found in review of the terminal redesign's talk-deck port:
 *
 *   1. D8 says presenting is production's behaviour — a full-viewport overlay
 *      above the site chrome — but the port opened in the framed shell view,
 *      and while presenting the stage and rail kept their 1px `term-frame`
 *      borders and border titles.
 *   2. The deck's window keydown handler claimed keys wherever focus was:
 *      with the status-line link `0:home` focused, End was default-prevented
 *      and jumped the deck from 1/20 to 20/20.
 *
 * Rows (1280x800, `next/build` served locally):
 *   DK-01  a fresh load of `/talks/my-career`, and a `?page=5&step=2` deep
 *          link, are presenting: the exported HTML already carries
 *          `deck is-presenting` with a frameless stage and rail; live, the
 *          overlay is fixed and covers the viewport, the stage and rail have
 *          0 computed border widths, no frame title or `deck-ps1` prompt is
 *          rendered, no chrome element (title bar, status line, ~/.plan,
 *          idle prompt) is hit-testable at its own centre, and a wheel over
 *          the overlay does not scroll the page.
 *   DK-02  browsing view (after Escape): with the status-line `0:home` link
 *          focused, a CDP End keypress leaves the deck on 1/20 and the
 *          event's default is NOT prevented.
 *   DK-03  the same End with focus on the deck stage (browsing) and with
 *          nothing focused (presenting, fresh load) moves to 20/20 with the
 *          default prevented — the handler still works, so DK-02 cannot pass
 *          because the deck stopped listening altogether.
 *   DK-04  Escape leaves presenting (frames, prompt and chrome come back) and
 *          `[ present ]` re-enters it.
 *   DK-05  the skip link (reviewer round 2, gap 1): from a fresh load, real
 *          CDP Tab presses reach "Skip to content", Enter moves focus to
 *          `main#main-content` — an ancestor of the deck root — and then
 *          ArrowRight advances the deck and End reaches 20/20, both with the
 *          default prevented. Run presenting (default) and browsing (after
 *          Escape).
 *
 * Positive controls (each must FAIL its row, exit 1):
 *   node scripts/assert-browser-deck.mjs --control=frames
 *     injects CSS restoring 1px borders on `.deck-stage` and `.deck-rail`
 *     while presenting — DK-01 fails on the border widths.
 *   node scripts/assert-browser-deck.mjs --control=leak
 *     DK-02 focuses the deck stage instead of the status-line link, i.e. a
 *     focus the handler must act on — DK-02 sees 20/20 and a prevented
 *     default, so the row can detect both halves of the leak.
 *   node scripts/assert-browser-deck.mjs --control=dead
 *     DK-03 focuses the status-line link instead of the stage — the deck
 *     rightly ignores the key, so DK-03 sees 1/20 and fails.
 *   node scripts/assert-browser-deck.mjs --control=sticky
 *     DK-04 presses Escape with Meta held, a chord the deck ignores — the
 *     overlay stays, so DK-04 fails.
 *   node scripts/assert-browser-deck.mjs --control=skipdead
 *     a capture-phase keydown listener on `#main-content` stops propagation
 *     of keys targeted at that element, so the deck never sees them after
 *     the skip link — DK-05 fails.
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { launch, serve, ready, evaluate, findBrowser, until, EXIT } from './browser-probe.mjs';

const ROUTE = '/talks/my-career';
const CONTROL = (process.argv.find((arg) => arg.startsWith('--control=')) ?? '').slice(10);
const CONTROLS = ['', 'frames', 'leak', 'dead', 'sticky', 'skipdead'];

/** CDP key definitions for the keys this probe presses. */
const KEYS = {
	End: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
	Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
	Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
	// Enter carries text so Chrome runs the keypress that activates a link.
	Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
	ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
};

/** Installed before any page script: records the last keydown's defaultPrevented. */
const RECORDER = `
	window.addEventListener('keydown', (event) => { window.__deckLastKey = event; }, true);
	${
		CONTROL === 'frames'
			? `document.addEventListener('DOMContentLoaded', () => {
		const s = document.createElement('style');
		s.textContent = '.deck.is-presenting .deck-stage, .deck.is-presenting .deck-rail { border: 1px solid var(--crt-line) !important; }';
		document.head.appendChild(s);
	});`
			: ''
	}
	${
		CONTROL === 'skipdead'
			? `document.addEventListener('DOMContentLoaded', () => {
		const main = document.getElementById('main-content');
		main?.addEventListener('keydown', (event) => {
			if (event.target === main) event.stopPropagation();
		}, true);
	});`
			: ''
	}
`;

const HYDRATED = "location.search.includes('page=') && !!document.querySelector('.deck-count')";

const SLIDE = `(() => {
	const m = /^(\\d+) \\/ (\\d+)/.exec(document.querySelector('.deck-count')?.textContent.trim() ?? '');
	return m ? m[1] + '/' + m[2] : 'none';
})()`;

const PRESENTING = "!!document.querySelector('.deck.is-presenting')";

async function press(page, name, { meta = false } = {}) {
	const base = { ...KEYS[name], modifiers: meta ? 4 : 0 };
	await evaluate(page, 'window.__deckLastKey = null');
	await page.send('Input.dispatchKeyEvent', {
		...base,
		type: base.text ? 'keyDown' : 'rawKeyDown',
	});
	await page.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
	// A state update lands on React's next commit; give it a frame or two.
	await evaluate(page, 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
	return evaluate(
		page,
		`window.__deckLastKey ? { key: window.__deckLastKey.key, prevented: window.__deckLastKey.defaultPrevented } : null`,
	);
}

async function open(page, port, search = '') {
	await page.send('Page.navigate', { url: `http://127.0.0.1:${port}${ROUTE}${search}` });
	if (!(await ready(page, HYDRATED, { timeoutMs: 15000 }))) {
		throw new Error(`${ROUTE}${search} never hydrated`);
	}
}

async function focus(page, selector) {
	return evaluate(
		page,
		`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.focus(); return !!el && document.activeElement === el; })()`,
	);
}

function report(id, ok, detail) {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
	return ok ? 0 : 1;
}

async function dk01(page, port) {
	let failed = 0;
	for (const search of ['', '?page=5&step=2']) {
		// The exported HTML: presenting must be the prerendered state, so no
		// framed view can paint before hydration.
		const html = await (await fetch(`http://127.0.0.1:${port}${ROUTE}${search}`)).text();
		const staticOk =
			html.includes('class="deck is-presenting"') &&
			html.includes('class="deck-stage"') &&
			html.includes('class="deck-rail"') &&
			!html.includes('deck-frame-title') &&
			!html.includes('deck-ps1');

		await open(page, port, search);
		const live = JSON.parse(
			await evaluate(
				page,
				`(() => {
				const deck = document.querySelector('.deck.is-presenting');
				const widths = (el) => {
					if (!el) return null;
					const cs = getComputedStyle(el);
					return [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
				};
				const r = deck?.getBoundingClientRect();
				const chrome = ['.term-bar', '.term-status', '.term-plan', '.term-ps1--idle'].map((sel) => {
					const el = document.querySelector(sel);
					if (!el) return [sel, 'missing'];
					const b = el.getBoundingClientRect();
					const x = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1);
					const y = Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1);
					const hit = document.elementFromPoint(x, y);
					return [sel, hit && el.contains(hit) ? 'visible' : 'hidden'];
				});
				return JSON.stringify({
					fixed: deck ? getComputedStyle(deck).position : null,
					covers: !!r && r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight,
					stage: widths(document.querySelector('.deck-stage')),
					rail: widths(document.querySelector('.deck-rail')),
					frameTitle: !!document.querySelector('.deck-frame-title'),
					ps1: !!document.querySelector('.deck-ps1'),
					chrome,
					slide: ${SLIDE},
				});
			})()`,
			),
		);
		// A real wheel over the overlay: the page must not move.
		await page.send('Input.dispatchMouseEvent', {
			type: 'mouseWheel',
			x: 640,
			y: 400,
			deltaX: 0,
			deltaY: 3000,
		});
		await new Promise((r) => setTimeout(r, 300));
		const scrollY = await evaluate(page, 'window.scrollY + document.documentElement.scrollTop');

		const zero = (w) => Array.isArray(w) && w.every((n) => n === 0);
		const chromeHidden = live.chrome.every(([, state]) => state === 'hidden');
		const wantSlide = search ? '5/20' : '1/20';
		const ok =
			staticOk &&
			live.fixed === 'fixed' &&
			live.covers &&
			zero(live.stage) &&
			zero(live.rail) &&
			!live.frameTitle &&
			!live.ps1 &&
			chromeHidden &&
			scrollY === 0 &&
			live.slide === wantSlide;
		failed += report(
			'DK-01',
			ok,
			`${ROUTE}${search || ''}  static=${staticOk} position=${live.fixed} covers=${live.covers} stage=${live.stage} rail=${live.rail} frameTitle=${live.frameTitle} ps1=${live.ps1} chrome=${live.chrome.map((c) => c.join(':')).join(',')} scrollY=${scrollY} slide=${live.slide}`,
		);
	}
	return failed;
}

/** Load fresh, leave presenting with Escape (nothing focused). */
async function browsing(page, port) {
	await open(page, port);
	await press(page, 'Escape');
	return until(async () => !(await evaluate(page, PRESENTING)), { timeoutMs: 3000 });
}

async function dk02(page, port) {
	const left = await browsing(page, port);
	const selector = CONTROL === 'leak' ? '.deck-stage' : '.term-status a[href="/"]';
	const focused = await focus(page, selector);
	const before = await evaluate(page, SLIDE);
	const key = await press(page, 'End');
	const after = await evaluate(page, SLIDE);
	const ok = left && focused && before === '1/20' && after === '1/20' && key?.prevented === false;
	return report(
		'DK-02',
		ok,
		`browsing=${left} focus ${selector}=${focused}  End: ${before} -> ${after}, defaultPrevented=${key?.prevented}`,
	);
}

async function dk03(page, port) {
	let failed = 0;

	// (a) browsing view, focus on the deck stage.
	const left = await browsing(page, port);
	const selector = CONTROL === 'dead' ? '.term-status a[href="/"]' : '.deck-stage';
	const focused = await focus(page, selector);
	const key = await press(page, 'End');
	await until(async () => (await evaluate(page, SLIDE)) === '20/20', { timeoutMs: 2000 });
	const after = await evaluate(page, SLIDE);
	failed += report(
		'DK-03',
		left && focused && after === '20/20' && key?.prevented === true,
		`browsing, focus ${selector}=${focused}  End: -> ${after}, defaultPrevented=${key?.prevented}`,
	);

	// (b) presenting, fresh load, nothing focused (the event targets body).
	await open(page, port);
	const target = await evaluate(page, 'document.activeElement === document.body');
	const keyB = await press(page, 'End');
	await until(async () => (await evaluate(page, SLIDE)) === '20/20', { timeoutMs: 2000 });
	const afterB = await evaluate(page, SLIDE);
	failed += report(
		'DK-03',
		target && afterB === '20/20' && keyB?.prevented === true,
		`presenting, body focused=${target}  End: -> ${afterB}, defaultPrevented=${keyB?.prevented}`,
	);
	return failed;
}

async function dk04(page, port) {
	await open(page, port);
	const start = await evaluate(page, PRESENTING);
	await press(page, 'Escape', { meta: CONTROL === 'sticky' });
	const left = await until(async () => !(await evaluate(page, PRESENTING)), { timeoutMs: 2000 });
	const shell = JSON.parse(
		await evaluate(
			page,
			`JSON.stringify({
				frame: !!document.querySelector('.deck-stage.term-frame') && !!document.querySelector('.deck-rail.term-frame'),
				ps1: !!document.querySelector('.deck-ps1'),
				status: getComputedStyle(document.querySelector('.term-status')).visibility,
				button: document.querySelector('.deck-present')?.textContent.trim() ?? null,
			})`,
		),
	);
	await evaluate(page, "document.querySelector('.deck-present')?.click()");
	const back = await until(async () => await evaluate(page, PRESENTING), { timeoutMs: 2000 });
	const ok =
		start &&
		left &&
		shell.frame &&
		shell.ps1 &&
		shell.status === 'visible' &&
		shell.button === 'present' &&
		back;
	return report(
		'DK-04',
		ok,
		`presenting=${start}  Escape -> browsing=${left} frames=${shell.frame} ps1=${shell.ps1} status=${shell.status} button=${shell.button}  [ present ] -> presenting=${back}`,
	);
}

const ACTIVE = `(() => {
	const el = document.activeElement;
	if (!el) return 'none';
	return el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
})()`;

const POSITION = `(() => { const q = new URLSearchParams(location.search); return q.get('page') + ':' + q.get('step'); })()`;

/** Real Tab presses until the skip link has focus; false if it never does. */
async function tabToSkipLink(page) {
	for (let i = 0; i < 20; i += 1) {
		await press(page, 'Tab');
		if (await evaluate(page, "document.activeElement?.classList.contains('skip-link') ?? false")) {
			return true;
		}
	}
	return false;
}

async function dk05(page, port) {
	let failed = 0;
	for (const view of ['presenting', 'browsing']) {
		const entered =
			view === 'browsing' ? await browsing(page, port) : (await open(page, port), true);
		const presenting = await evaluate(page, PRESENTING);
		const skip = await tabToSkipLink(page);
		await press(page, 'Enter');
		const onMain = await until(
			async () => await evaluate(page, "document.activeElement?.id === 'main-content'"),
			{ timeoutMs: 2000 },
		);
		const active = await evaluate(page, ACTIVE);
		const mainIsAncestor = await evaluate(
			page,
			"!!document.getElementById('main-content')?.contains(document.querySelector('.deck'))",
		);
		const before = await evaluate(page, POSITION);
		const slideBefore = await evaluate(page, SLIDE);
		const right = await press(page, 'ArrowRight');
		await until(async () => (await evaluate(page, POSITION)) !== before, { timeoutMs: 2000 });
		const afterRight = await evaluate(page, POSITION);
		const end = await press(page, 'End');
		await until(async () => (await evaluate(page, SLIDE)) === '20/20', { timeoutMs: 2000 });
		const afterEnd = await evaluate(page, SLIDE);
		const wantPresenting = view === 'presenting';
		const ok =
			entered &&
			presenting === wantPresenting &&
			skip &&
			onMain &&
			mainIsAncestor &&
			slideBefore === '1/20' &&
			afterRight !== before &&
			right?.prevented === true &&
			afterEnd === '20/20' &&
			end?.prevented === true;
		failed += report(
			'DK-05',
			ok,
			`view=${view} presenting=${presenting} skipLinkFocused=${skip} Enter -> active=${active} mainEnclosesDeck=${mainIsAncestor}  ArrowRight: ${slideBefore} page:step ${before} -> ${afterRight}, defaultPrevented=${right?.prevented}  End: -> ${afterEnd}, defaultPrevented=${end?.prevented}`,
		);
	}
	return failed;
}

async function main() {
	if (!CONTROLS.includes(CONTROL)) {
		console.error(
			`ERROR unknown control "${CONTROL}" (expected one of ${CONTROLS.slice(1).join(', ')})`,
		);
		return EXIT.ERROR;
	}
	if (!findBrowser()) {
		console.log('SKIPPED  no browser available');
		return EXIT.SKIPPED;
	}
	const server = await serve('next/build');
	let page;
	try {
		page = await launch();
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
		await page.send('Emulation.setDeviceMetricsOverride', {
			width: 1280,
			height: 800,
			deviceScaleFactor: 1,
			mobile: false,
		});
		let failed = 0;
		failed += await dk01(page, server.port);
		failed += await dk02(page, server.port);
		failed += await dk03(page, server.port);
		failed += await dk04(page, server.port);
		failed += await dk05(page, server.port);
		if (CONTROL) console.log(`control=${CONTROL}: ${failed} failing row check(s)`);
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
