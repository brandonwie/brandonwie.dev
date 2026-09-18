/**
 * migration:browser:ac7 — AC7-methodology capture for the Slice 4 route set:
 * the 12 study routes plus `/talks/my-career`. This is the capture
 * `verification/behavior-matrix.md` reserves for Slice 4 — the study smoke
 * (`assert-browser-study.mjs`) is functional only, and this suite adds what
 * that one deliberately does not: viewport sweeps, keyboard flows, the graded
 * a11y counts, and the deck/video rows.
 *
 * Rows:
 * Row order: interactive deck rows (K-*, D-*) run first on a fresh renderer —
 * real input dispatch after a long navigate/evaluate sweep wedges
 * Runtime.evaluate (measured), while the V-sweep is pure-evaluate and safe
 * anywhere. Report order does not change the assertion surface.
 *
 *   V-01..V-13  one per route: status 200, `<html lang>`, `h1`, then at
 *               390x844 / 820x1180 / 1440x900 via Emulation.setDeviceMetricsOverride
 *               (the baseline used a /__viewport iframe because its automation
 *               could not resize; the CDP override evaluates the same property —
 *               media queries against a real box — with a stronger primitive):
 *               expected breakpoints, no horizontal overflow, 0 images without
 *               alt, 0 unnamed controls (frame-probe.js heuristic incl.
 *               element.labels), and zero console errors across the sweep.
 *   K-NEXT      `/talks/my-career`: six real ArrowRight presses walk steps and
 *               slides to `4 / 20` `step 2/2`, URL mirrors `?page=4&step=2`,
 *               and the slide body is present and visible (baseline K6).
 *   K-PREV      ArrowLeft steps back to `step 1/2` (baseline K7).
 *   D-VID-3/4   SlideVideo on modulabs (page 3) and moviation (page 4): muted /
 *               loop / playsInline / aria-label, autoplay engaged
 *               (`video.paused === false`), a step advance pauses it while the
 *               animation runs (the 1250 ms videoPaused window), then it
 *               resumes. This is the "video behavior" pending row.
 *   D-PRINT     `?print` renders `.print-deck` with all 20 slides at their
 *               final step and no `.deck-rail` — every slide mounts content.
 *   D-RESTORE   `?page=N` mounts every slide live at its registry label with
 *               the right `N / 20` counter — the live-mount half of "the other
 *               19 deck slides" (D-PRINT covers the rendered-content half).
 *               Restore navigation is used rather than a long key walk: real
 *               CDP input events back-pressure the renderer's pipeline after
 *               ~dozens of interleaved dispatches (measured: Runtime.evaluate
 *               wedged >20s), so a 60-press walk is unreliable evidence.
 *
 * Screenshots are opt-in (`--screenshots`, JPEG under
 * `verification/screenshots/slice4-ac7/<slug>@<W>x<H>.jpg`, branch-lifetime per
 * `verification/README.md`); the gate itself is DOM observations only.
 *
 * Exit contract: 0 pass, 1 assertion failure, 2 harness error, 3 no browser.
 *
 * Negative control flags (consumed by `assert-browser-ac7-controls.mjs`):
 *   node scripts/assert-browser-ac7.mjs --inject-console-error
 *   node scripts/assert-browser-ac7.mjs --inject-overflow
 *   node scripts/assert-browser-ac7.mjs --suppress-deck-keys
 *   node scripts/assert-browser-ac7.mjs --suppress-video-pause
 *   node scripts/assert-browser-ac7.mjs --suppress-print
 *   node scripts/assert-browser-ac7.mjs --corrupt-restore-label
 *   node scripts/assert-browser-ac7.mjs --drop-status-responses
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
	launch,
	serve,
	ready,
	evaluate,
	mutateBehavior,
	findBrowser,
	until,
	EXIT,
} from './browser-probe.mjs';

const flag = (name) => process.argv.includes(name);
const SCREENSHOTS = flag('--screenshots');
const INJECT_CONSOLE_ERROR = flag('--inject-console-error');
const INJECT_OVERFLOW = flag('--inject-overflow');
const SUPPRESS_KEYS = flag('--suppress-deck-keys');
const SUPPRESS_VIDEO_PAUSE = flag('--suppress-video-pause');
const SUPPRESS_PRINT = flag('--suppress-print');
const CORRUPT_LABEL = flag('--corrupt-restore-label');
const DROP_STATUS = flag('--drop-status-responses');

const SHOTS_DIR = 'verification/screenshots/slice4-ac7';

const ROUTES = [
	{ id: 'V-01', url: '/study', locale: 'en', slug: 'study' },
	{ id: 'V-02', url: '/study/dsa-i', locale: 'en', slug: 'study-dsa-i' },
	{ id: 'V-03', url: '/study/dsa-ii', locale: 'en', slug: 'study-dsa-ii' },
	{ id: 'V-04', url: '/study/dsa-iii', locale: 'en', slug: 'study-dsa-iii' },
	{ id: 'V-05', url: '/study/dsa-iv', locale: 'en', slug: 'study-dsa-iv' },
	{
		id: 'V-06',
		url: '/study/aws-ai-practitioner',
		locale: 'en',
		slug: 'study-aws-ai-practitioner',
	},
	{ id: 'V-07', url: '/ko/study', locale: 'ko', slug: 'ko-study' },
	{ id: 'V-08', url: '/ko/study/dsa-i', locale: 'ko', slug: 'ko-study-dsa-i' },
	{ id: 'V-09', url: '/ko/study/dsa-ii', locale: 'ko', slug: 'ko-study-dsa-ii' },
	{ id: 'V-10', url: '/ko/study/dsa-iii', locale: 'ko', slug: 'ko-study-dsa-iii' },
	{ id: 'V-11', url: '/ko/study/dsa-iv', locale: 'ko', slug: 'ko-study-dsa-iv' },
	{
		id: 'V-12',
		url: '/ko/study/aws-ai-practitioner',
		locale: 'ko',
		slug: 'ko-study-aws-ai-practitioner',
	},
	{ id: 'V-13', url: '/talks/my-career', locale: 'en', slug: 'talks-my-career' },
];

// [width, height, expected breakpoint map] — same three boxes as the baseline.
const VIEWPORTS = [
	[390, 844, { 'max-640': true, 'min-768': false, 'min-1024': false, 'min-1280': false }],
	[820, 1180, { 'max-640': false, 'min-768': true, 'min-1024': false, 'min-1280': false }],
	[1440, 900, { 'max-640': false, 'min-768': true, 'min-1024': true, 'min-1280': true }],
];

const COLLECTOR = `
window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || e.type)));
window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
const __origErr = console.error.bind(console);
console.error = (...a) => { window.__errs.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); __origErr(...a); };
`;

// The frame-probe.js heuristics evaluated against the real document — the CDP
// metrics override replaces the baseline's /__viewport iframe. The unnamed-
// control check is the corrected version that consults element.labels (the
// baseline probe defect recorded in behavior-matrix.md).
const FRAME_SNAPSHOT = `
(() => {
	const doc = document;
	const mq = (q) => matchMedia(q).matches;
	const named = (el) => {
		const name = (
			el.getAttribute('aria-label') ||
			el.getAttribute('title') ||
			el.textContent ||
			''
		).trim();
		const labelled = el.getAttribute('aria-labelledby');
		const alt = el.querySelector?.('img[alt]')?.getAttribute('alt')?.trim();
		const labelText = [...(el.labels ?? [])]
			.map((l) => l.textContent.trim())
			.filter(Boolean)
			.join(' ');
		return Boolean(name || labelled || alt || labelText);
	};
	return {
		lang: doc.documentElement.lang,
		innerWidth: window.innerWidth,
		scrollWidth: doc.documentElement.scrollWidth,
		overflow: doc.documentElement.scrollWidth > window.innerWidth + 1,
		bp: {
			'max-640': mq('(max-width: 640px)'),
			'min-768': mq('(min-width: 768px)'),
			'min-1024': mq('(min-width: 1024px)'),
			'min-1280': mq('(min-width: 1280px)'),
		},
		imagesMissingAlt: [...doc.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt'))
			.length,
		focusables: doc.querySelectorAll(
			'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
		).length,
		unnamed: [...doc.querySelectorAll('a[href],button,input,select,textarea')].filter(
			(el) => !named(el),
		).length,
		studyCards: doc.querySelectorAll('.study-card').length,
		h1: doc.querySelector('#main-content h1')?.textContent.trim().slice(0, 80) ?? null,
		errs: window.__errs,
	};
})()
`;

const DECK_SNAPSHOT = `
(() => {
	const countEl = document.querySelector('.deck-count');
	const clone = countEl?.cloneNode(true);
	clone?.querySelector('.deck-step')?.remove();
	const count = clone?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
	const step = document.querySelector('.deck-step')?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
	const label = document.querySelector('.deck-label')?.textContent.trim() ?? null;
	const stage = document.querySelector('.deck-stage');
	const body = stage?.firstElementChild ?? null;
	const style = body ? getComputedStyle(body) : null;
	return {
		count,
		step,
		label,
		search: window.location.search,
		stageText: stage ? stage.textContent.trim().length : 0,
		bodyVisible: style ? style.visibility !== 'hidden' && Number(style.opacity) > 0 : false,
		errs: window.__errs,
	};
})()
`;

const VIDEO_SNAPSHOT = `
(() => {
	const v = document.querySelector('.deck-stage video');
	if (!v) return { present: false };
	return {
		present: true,
		muted: v.muted,
		loop: v.loop,
		playsInline: v.playsInline,
		label: v.getAttribute('aria-label'),
		paused: v.paused,
		errs: window.__errs,
	};
})()
`;

const PRINT_SNAPSHOT = `
(() => {
	const slides = [...document.querySelectorAll('.print-slide')];
	return {
		printDeck: !!document.querySelector('.print-deck'),
		rail: !!document.querySelector('.deck-rail'),
		count: slides.length,
		empty: slides.filter((s) => s.textContent.trim().length === 0).length,
		errs: window.__errs,
	};
})()
`;

const results = [];
const report = (id, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

// A real CDP key event for a named (non-printable) key — chord() only covers
// single characters. rawKeyDown + keyUp is what the deck's window listener sees.
async function pressArrow(page, key) {
	const code = key === 'ArrowRight' ? 39 : 37;
	const base = {
		key,
		code: key,
		windowsVirtualKeyCode: code,
		nativeVirtualKeyCode: code,
	};
	await page.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' });
	await page.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

/**
 * Under --suppress-deck-keys, dispatch synthetic keydowns instead of real CDP
 * input. Real events that no handler acts on (the defect being simulated)
 * leave the renderer's Runtime domain wedged >20s a few seconds later —
 * measured across listener-kill and key-getter mutations alike. Synthetic
 * dispatch still reaches the deck handler, so the control keeps its bite:
 * if the mutation ever fails to install, a synthetic ArrowRight advances
 * the deck and K-NEXT passes, which the control reads as a broken mutant.
 */
async function pressKey(page, key) {
	if (!SUPPRESS_KEYS) return pressArrow(page, key);
	await evaluate(
		page,
		`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }))`,
	);
}

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
		await page.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECTOR });
		// HTTP status is observed out-of-band (Page.navigate's return is
		// discarded); Document-type responses keyed by URL.
		await page.send('Network.enable');
		const statusByUrl = new Map();
		page.on('Network.responseReceived', (params) => {
			if (params?.type === 'Document' && params?.response?.url) {
				statusByUrl.set(params.response.url, params.response.status);
			}
		});
		const status = (url) => statusByUrl.get(`http://127.0.0.1:${server.port}${url}`);

		if (INJECT_OVERFLOW)
			await mutateBehavior(
				page,
				`(document.head || document.documentElement).appendChild(Object.assign(document.createElement('style'), { textContent: 'body{min-width:2000px !important}' }));`,
			);
		if (SUPPRESS_KEYS)
			// Defect simulation: keys arrive but the handler cannot recognize
			// them — the listener stays live and the input pipeline stays
			// exercised (a dead addEventListener leaves unhandled real input
			// events that wedge Runtime.evaluate under load). Same observable
			// defect as a dead handler: the counter never advances.
			await mutateBehavior(
				page,
				`Object.defineProperty(KeyboardEvent.prototype, 'key', { get() { return 'Dead'; } });`,
			);
		if (SUPPRESS_VIDEO_PAUSE)
			// The ported defect this suite guards: pause() during a step
			// animation doing nothing leaves the video playing.
			await mutateBehavior(page, `HTMLMediaElement.prototype.pause = function () {};`);
		if (SUPPRESS_PRINT)
			// Defect simulation: print mode mounts but emits no slides — the
			// count predicate (20) is what must catch it. A MutationObserver
			// strips slides as React renders them so the failure holds
			// regardless of hydration timing.
			await mutateBehavior(
				page,
				`if (location.pathname.endsWith('/talks/my-career') && location.search.includes('print')) {
	new MutationObserver(() => {
		document.querySelectorAll('.print-slide').forEach((s) => s.remove());
	}).observe(document, { childList: true, subtree: true });
}`,
			);
		if (CORRUPT_LABEL)
			// Defect simulation: the rendered slide label disagrees with the
			// registry — D-RESTORE's label parity is what must catch it. The
			// observer rewrites .deck-label only after React has claimed the
			// node (a `__react*` key = hydration done): rewriting server HTML
			// earlier throws a hydration-mismatch console error, which would
			// fail K-NEXT collaterally instead of isolating D-RESTORE.
			await mutateBehavior(
				page,
				`if (location.pathname.endsWith('/talks/my-career') && !location.search.includes('print')) {
	new MutationObserver(() => {
		const el = document.querySelector('.deck-label');
		const claimed = el && Object.keys(el).some((k) => k.startsWith('__react'));
		if (claimed && el.textContent !== 'Corrupted slide') el.textContent = 'Corrupted slide';
	}).observe(document, { childList: true, subtree: true });
}`,
			);
		if (SCREENSHOTS) mkdirSync(SHOTS_DIR, { recursive: true });

		// Interactive deck rows run BEFORE the viewport sweep: real input
		// dispatch on a fresh renderer is reliable, but after ~13 navigations
		// of metric overrides + evaluates the accumulated state wedges
		// Runtime.evaluate >20s once key events land (measured; the sweep
		// itself is pure-evaluate and never wedges).
		// ---- K-NEXT: six ArrowRight presses walk to slide 4 step 2 (baseline K6)
		{
			await page.send('Page.navigate', {
				url: `http://127.0.0.1:${server.port}/talks/my-career`,
			});
			const isReady = await ready(page, "!!document.querySelector('.deck-count')");
			if (!isReady) {
				report('K-NEXT', false, 'deck never mounted');
			} else {
				for (let i = 0; i < 6; i++) {
					await pressKey(page, 'ArrowRight');
					await new Promise((r) => setTimeout(r, 120));
				}
				// everyMs is deliberately coarse: a failing run polls for the
				// whole timeout, and a 50 ms eval-storm backs up the renderer's
				// protocol queue — the next evaluate then wedges >20s.
				const settled = await until(
					async () => {
						const s = await evaluate(page, DECK_SNAPSHOT);
						return s.count === '4 / 20' && s.step?.includes('step 2/2');
					},
					{ timeoutMs: 4000, everyMs: 250 },
				);
				const s = await evaluate(page, DECK_SNAPSHOT);
				const params = new URLSearchParams(s.search);
				const problems = [];
				if (!settled) problems.push(`counter "${s.count}" / "${s.step}", want "4 / 20" "step 2/2"`);
				if (params.get('page') !== '4' || params.get('step') !== '2')
					problems.push(`URL "${s.search}", want ?page=4&step=2`);
				if (s.stageText === 0 || !s.bodyVisible)
					problems.push(`slide body not legible (text=${s.stageText} visible=${s.bodyVisible})`);
				if (s.errs.length > 0) problems.push(`${s.errs.length} console error(s)`);
				report(
					'K-NEXT',
					problems.length === 0,
					`ArrowRight x6 -> "${s.count}" "${s.step}" url=${s.search} label="${s.label}" legible=${s.stageText > 0 && s.bodyVisible}${problems.length ? ' — ' + problems.join('; ') : ''}`,
				);
			}
		}

		// ---- K-PREV: ArrowLeft steps back within the slide (baseline K7)
		{
			await pressKey(page, 'ArrowLeft');
			const settled = await until(
				async () => {
					const s = await evaluate(page, DECK_SNAPSHOT);
					return s.count === '4 / 20' && s.step?.includes('step 1/2');
				},
				{ timeoutMs: 4000, everyMs: 250 },
			);
			const s = await evaluate(page, DECK_SNAPSHOT);
			const params = new URLSearchParams(s.search);
			const problems = [];
			if (!settled) problems.push(`counter "${s.count}" / "${s.step}", want "4 / 20" "step 1/2"`);
			if (params.get('page') !== '4' || params.get('step') !== '1')
				problems.push(`URL "${s.search}", want ?page=4&step=1`);
			if (s.errs.length > 0) problems.push(`${s.errs.length} console error(s)`);
			report(
				'K-PREV',
				problems.length === 0,
				`ArrowLeft -> "${s.count}" "${s.step}" url=${s.search}${problems.length ? ' — ' + problems.join('; ') : ''}`,
			);
		}

		// ---- D-VID: SlideVideo pauses while a step animation runs, then resumes
		for (const [id, pageNo, name] of [
			['D-VID-3', 3, 'modulabs'],
			['D-VID-4', 4, 'moviation'],
		]) {
			await page.send('Page.navigate', {
				url: `http://127.0.0.1:${server.port}/talks/my-career?page=${pageNo}`,
			});
			const isReady = await ready(page, "!!document.querySelector('.deck-stage video')");
			if (!isReady) {
				report(id, false, `page ${pageNo} (${name}) never mounted its video`);
				continue;
			}
			const v0 = await evaluate(page, VIDEO_SNAPSHOT);
			const playing = await until(
				async () => (await evaluate(page, VIDEO_SNAPSHOT)).paused === false,
				{ timeoutMs: 8000, everyMs: 200 },
			);
			await pressKey(page, 'ArrowRight');
			const pausedDuring = await until(
				async () => (await evaluate(page, VIDEO_SNAPSHOT)).paused === true,
				{ timeoutMs: 3000, everyMs: 200 },
			);
			const resumed = await until(
				async () => (await evaluate(page, VIDEO_SNAPSHOT)).paused === false,
				{ timeoutMs: 5000, everyMs: 200 },
			);
			const problems = [];
			if (!v0.present) problems.push('no video element');
			else {
				if (!v0.muted) problems.push('video not muted');
				if (!v0.loop) problems.push('video not looping');
				if (!v0.playsInline) problems.push('playsInline unset');
				if (!v0.label) problems.push('no aria-label');
			}
			if (!playing) problems.push('autoplay never engaged (paused stayed true)');
			if (!pausedDuring) problems.push('never paused during the step animation');
			if (!resumed) problems.push('never resumed after the animation window');
			// Snapshot errs after the full press/animate/resume window — v0 was
			// taken before any interaction and would miss errors thrown mid-cycle.
			const vFinal = await evaluate(page, VIDEO_SNAPSHOT);
			const errs = vFinal.errs ?? [];
			if (errs.length > 0) problems.push(`${errs.length} console error(s)`);
			report(
				id,
				problems.length === 0,
				`page ${pageNo} (${name}) video muted=${v0.muted} loop=${v0.loop} inline=${v0.playsInline} label="${v0.label}" playing=${playing} paused-during-animation=${pausedDuring} resumed=${resumed}${problems.length ? ' — ' + problems.join('; ') : ''}`,
			);
		}

		// ---- D-PRINT: ?print renders every slide at its final step
		{
			await page.send('Page.navigate', {
				url: `http://127.0.0.1:${server.port}/talks/my-career?print`,
			});
			const isReady = await ready(page, "!!document.querySelector('.print-deck')");
			const s = isReady ? await evaluate(page, PRINT_SNAPSHOT) : null;
			const problems = [];
			if (!isReady) problems.push('print deck never mounted');
			else {
				if (s.count !== 20) problems.push(`${s.count} print slides, want 20`);
				if (s.empty > 0) problems.push(`${s.empty} empty print slide(s)`);
				if (s.rail) problems.push('deck rail present in print mode');
				if (s.errs.length > 0) problems.push(`${s.errs.length} console error(s)`);
			}
			report(
				'D-PRINT',
				problems.length === 0,
				`?print -> ${s?.count ?? 0} slides, empty=${s?.empty ?? '-'}, rail=${s?.rail ?? '-'}${problems.length ? ' — ' + problems.join('; ') : ''}`,
			);
		}

		// ---- D-RESTORE: ?page=N mounts every slide at its registry label — the
		// live-mount half of "the other 19 deck slides" (D-PRINT covers render).
		{
			const expected = [
				'Title',
				'The arc',
				'MODULABS',
				'Moviation',
				'Playtag — admin tool',
				'Playtag — backend',
				'MOBA — the setup',
				'Sync — account separation',
				'Decoupling the sync queue',
				'Sync — polling to push',
				'Sync — linear to parallel',
				'Infrastructure',
				'Data pipeline',
				'3B — the AI-native loop',
				'3B — kill, diagnose, rebuild',
				'Privacy governance',
				'Close',
				'How I work',
				'Never stopped learning',
				'FINE',
			];
			const problems = [];
			for (let n = 1; n <= expected.length; n++) {
				await page.send('Page.navigate', {
					url: `http://127.0.0.1:${server.port}/talks/my-career?page=${n}`,
				});
				const isReady = await ready(page, "!!document.querySelector('.deck-count')", {
					timeoutMs: 15000,
				});
				if (!isReady) {
					problems.push(`page ${n}: deck never mounted`);
					continue;
				}
				const s = await evaluate(page, DECK_SNAPSHOT);
				if (s.count !== `${n} / 20`) problems.push(`page ${n}: counter "${s.count}"`);
				if (s.label !== expected[n - 1])
					problems.push(`page ${n}: label "${s.label}", want "${expected[n - 1]}"`);
				if (s.stageText === 0) problems.push(`page ${n}: empty slide body`);
				if (s.errs.length > 0) problems.push(`page ${n}: ${s.errs.length} console error(s)`);
			}
			report(
				'D-RESTORE',
				problems.length === 0,
				problems.length === 0
					? `all 20 slides mount at ?page=N with their registry labels`
					: problems.join('; '),
			);
		}

		let first = true;
		for (const route of ROUTES) {
			await page.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route.url}` });
			const isReady = await ready(page, "!!document.querySelector('#main-content h1')");
			if (!isReady) {
				report(route.id, false, `${route.url} never rendered its h1`);
				continue;
			}
			if (INJECT_CONSOLE_ERROR && first) {
				await evaluate(page, `console.error('synthetic defect for BAC-01')`);
			}
			first = false;

			const problems = [];
			const perViewport = [];
			for (const [w, h, expected] of VIEWPORTS) {
				// `mobile` stays false on purpose: the baseline's iframe harness
				// never emulated touch, and toggling mobile emulation mid-session
				// destabilizes CDP input dispatch (measured: Runtime.evaluate
				// wedged >20s after real key events following mobile:true cycles).
				await page.send('Emulation.setDeviceMetricsOverride', {
					width: w,
					height: h,
					deviceScaleFactor: 1,
					mobile: false,
				});
				const applied = await until(async () => (await evaluate(page, 'window.innerWidth')) === w, {
					timeoutMs: 5000,
				});
				if (!applied) {
					problems.push(`viewport ${w}x${h} never applied`);
					continue;
				}
				const snap = await evaluate(page, FRAME_SNAPSHOT);
				if (SCREENSHOTS) {
					// Let entrance animations settle before the capture — headless
					// rAF runs, but a screenshot taken mid-fade understates what a
					// visitor sees (the baseline's paint-gating caveat).
					await new Promise((r) => setTimeout(r, 800));
					const shot = await page.send('Page.captureScreenshot', {
						format: 'jpeg',
						quality: 80,
					});
					writeFileSync(
						`${SHOTS_DIR}/${route.slug}@${w}x${h}.jpg`,
						Buffer.from(shot.data, 'base64'),
					);
				}
				const bpBad = Object.entries(expected)
					.filter(([k, want]) => snap.bp[k] !== want)
					.map(([k, want]) => `${k}=${snap.bp[k]} want ${want}`);
				if (snap.overflow) problems.push(`overflow at ${w} (scrollWidth ${snap.scrollWidth})`);
				if (bpBad.length) problems.push(`breakpoints at ${w}: ${bpBad.join(', ')}`);
				if (snap.imagesMissingAlt > 0)
					problems.push(`${snap.imagesMissingAlt} image(s) missing alt at ${w}`);
				if (snap.unnamed > 0) problems.push(`${snap.unnamed} unnamed control(s) at ${w}`);
				if (snap.lang !== route.locale) problems.push(`lang=${snap.lang}, want ${route.locale}`);
				if (snap.errs.length > 0) problems.push(`${snap.errs.length} console error(s)`);
				perViewport.push(
					`${w}:${snap.overflow ? 'overflow' : 'ok'} scroll=${snap.scrollWidth} focus=${snap.focusables} cards=${snap.studyCards} unnamed=${snap.unnamed}`,
				);
			}
			await page.send('Emulation.clearDeviceMetricsOverride');

			// Defect simulation for BAC-05: drop the observed statuses so the HTTP
			// gate must fire on every row.
			if (DROP_STATUS) statusByUrl.clear();
			if (status(route.url) !== 200)
				problems.push(`HTTP status ${status(route.url) ?? 'unobserved'}, want 200`);

			report(
				route.id,
				problems.length === 0,
				`${route.url} ${perViewport.join(' | ')}${problems.length ? ' — ' + problems.join('; ') : ''}`,
			);
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
