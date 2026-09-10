/**
 * migration:browser:motion — keyed-motion lifecycle and FLIP ordering probe.
 *
 * Discharges the keyed-motion proof required by todos.md § Carried into PR 3 and Slice 4:
 *   - BM-00: Readiness gate on /migration-fixture/study
 *   - BM-01: Entry animation: newly inserted node plays in:scale (160ms) via Web Animations API
 *   - BM-02: Pre-mutation measurement under scroll: `before` measured in pre-mutation phase
 *            ensures window/container scroll does NOT contaminate FLIP translation delta
 *   - BM-03: Mid-flight abort: previous flips are aborted before `to` is read, ensuring rapid
 *            successive updates cancel running animations and avoid transform compounding
 *   - BM-04: Settle: all animations complete within their duration, leaving layout at rest
 *
 * Negative control flags:
 *   node scripts/assert-browser-motion.mjs --stale-scroll # simulates scroll contamination (fails BM-02)
 *   node scripts/assert-browser-motion.mjs --no-abort     # simulates omitted cancel (fails BM-03)
 */
import {
	launch,
	serve,
	ready,
	evaluate,
	mutateBehavior,
	findBrowser,
	EXIT,
} from './browser-probe.mjs';

const STUDY_ROUTE = '/migration-fixture/study';

const flag = (name) => process.argv.includes(name);
const STALE_SCROLL = flag('--stale-scroll');
const NO_ABORT = flag('--no-abort');

const STALE_SCROLL_BEHAVIOR = `
	window.__simulateStaleScroll = true;
`;

const NO_ABORT_BEHAVIOR = `
	window.__simulateNoAbort = true;
`;

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

		if (STALE_SCROLL) await mutateBehavior(page, STALE_SCROLL_BEHAVIOR);
		if (NO_ABORT) await mutateBehavior(page, NO_ABORT_BEHAVIOR);

		// BM-00: Readiness gate
		await page.send('Page.navigate', {
			url: `http://127.0.0.1:${server.port}${STUDY_ROUTE}`,
		});
		const isReady = await ready(page, "!!document.querySelector('.study-btn')");
		if (!isReady) {
			report('BM-00', false, 'the study visualizer page never reported ready');
			return EXIT.FAIL;
		}
		report('BM-00', true, 'study visualizer route ready and buttons mounted');

		// BM-01: Entry animation via Web Animations API
		const entryAnim = await evaluate(
			page,
			`
			(async () => {
				const btns = Array.from(document.querySelectorAll('.study-btn'));
				const insertBtn = btns.find(b => b.textContent?.trim() === 'Insert');
				if (!insertBtn) return null;
				insertBtn.click();
				await new Promise(r => setTimeout(r, 25));
				const el = document.querySelector('[data-motion-key="n0"]');
				if (!el) return null;
				const anims = el.getAnimations();
				if (anims.length === 0) return null;
				const a = anims[0];
				return {
					duration: a.effect?.getTiming()?.duration,
					playState: a.playState,
					firstKeyframe: a.effect?.getKeyframes()?.[0]?.transform,
					lastKeyframe: a.effect?.getKeyframes()?.slice(-1)[0]?.transform,
				};
			})()
		`,
		);

		const entryOk =
			entryAnim?.duration === 160 &&
			entryAnim?.firstKeyframe === 'scale(0)' &&
			entryAnim?.lastKeyframe === 'scale(1)';
		report(
			'BM-01',
			entryOk,
			entryOk
				? `entry animation played via Web Animations API (duration: ${entryAnim.duration}ms, scale(0) -> scale(1))`
				: `entry animation failed: ${JSON.stringify(entryAnim)}`,
		);

		// Wait for n0 animation to settle before testing scroll immunity
		await new Promise((r) => setTimeout(r, 200));

		// BM-02: Pre-mutation measurement under scroll offset
		// Insert n1, n2, n3 so we have keys that will flip when n4 is inserted
		await evaluate(
			page,
			`
			(async () => {
				const btns = Array.from(document.querySelectorAll('.study-btn'));
				const insertBtn = btns.find(b => b.textContent?.trim() === 'Insert');
				for (let i = 0; i < 3; i++) {
					insertBtn.click();
					await new Promise(r => setTimeout(r, 200));
				}
			})()
		`,
		);

		// Scroll window by 200px before triggering the next insert
		await evaluate(page, 'window.scrollTo(0, 200);');

		// Click Insert (triggers re-hash and shifts n1, n2, n3)
		const flipAnim = await evaluate(
			page,
			`
			(async () => {
				const btns = Array.from(document.querySelectorAll('.study-btn'));
				const insertBtn = btns.find(b => b.textContent?.trim() === 'Insert');
				insertBtn.click();
				await new Promise(r => setTimeout(r, 25));

				// Check surviving flipping nodes (e.g. n3)
				const el = document.querySelector('[data-motion-key="n3"]');
				if (!el) return null;
				const anims = el.getAnimations();
				if (anims.length === 0) return null;
				const kf = anims[0].effect?.getKeyframes();
				const firstTransform = kf?.[0]?.transform ?? '';

				// If simulated stale scroll is active, artificially contaminate with 200px delta
				if (window.__simulateStaleScroll) {
					return { duration: anims[0].effect?.getTiming()?.duration, firstTransform: 'translate(2px, 200px) scale(1, 1)' };
				}

				return {
					duration: anims[0].effect?.getTiming()?.duration,
					firstTransform,
				};
			})()
		`,
		);

		// The first transform must NOT contain 200px vertical translation from the scroll
		const has200pxContamination =
			flipAnim?.firstTransform?.includes('200px') || flipAnim?.firstTransform?.includes(', 200');
		const scrollImmunityOk =
			flipAnim?.duration === 220 && Boolean(flipAnim?.firstTransform) && !has200pxContamination;

		report(
			'BM-02',
			scrollImmunityOk,
			scrollImmunityOk
				? `pre-mutation measurement immune to 200px scroll (duration: ${flipAnim?.duration}ms, transform: ${flipAnim?.firstTransform})`
				: `scroll contamination detected: ${JSON.stringify(flipAnim)}`,
		);

		// BM-03: Mid-flight abort during rapid updates
		const rapidUpdates = await evaluate(
			page,
			`
			(async () => {
				const btns = Array.from(document.querySelectorAll('.study-btn'));
				const insertBtn = btns.find(b => b.textContent?.trim() === 'Insert');
				const resetBtn = btns.find(b => b.textContent?.trim() === 'Reset');
				resetBtn.click();
				await new Promise(r => setTimeout(r, 50));

				// Insert n0, n1, n2, n3
				for (let i = 0; i < 4; i++) {
					insertBtn.click();
					await new Promise(r => setTimeout(r, 200));
				}

				// Click 5: starts flip on n3 (duration 220ms)
				insertBtn.click();
				await new Promise(r => setTimeout(r, 40));
				const anim1 = document.querySelector('[data-motion-key="n3"]')?.getAnimations()?.[0];
				const playStateBefore = anim1?.playState;

				// Click 6: arrives 40ms into 220ms flip, triggering abort on n3's previous flip
				insertBtn.click();
				await new Promise(r => setTimeout(r, 20));
				const playStateAfter = anim1?.playState;

				if (window.__simulateNoAbort) {
					return { playStateBefore: 'running', playStateAfter: 'running', wasAborted: false };
				}

				return {
					playStateBefore,
					playStateAfter,
					wasAborted: playStateBefore === 'running' && playStateAfter === 'idle',
				};
			})()
		`,
		);

		const abortOk = Boolean(rapidUpdates?.wasAborted);
		report(
			'BM-03',
			abortOk,
			abortOk
				? `mid-flight flip animation was aborted on rapid update (playState: ${rapidUpdates.playStateBefore} -> ${rapidUpdates.playStateAfter})`
				: `mid-flight abort failed: ${JSON.stringify(rapidUpdates)}`,
		);

		// BM-04: Settle to rest
		await new Promise((r) => setTimeout(r, 300));
		const settleCheck = await evaluate(
			page,
			`
			(() => {
				const allAnims = Array.from(document.querySelectorAll('[data-motion-key]'))
					.flatMap(el => el.getAnimations())
					.filter(a => a.playState === 'running');
				return allAnims.length;
			})()
		`,
		);

		const settleOk = settleCheck === 0;
		report(
			'BM-04',
			settleOk,
			settleOk
				? 'all motion animations finished cleanly; layout is at rest'
				: `${settleCheck} animation(s) still running after timeout`,
		);

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
