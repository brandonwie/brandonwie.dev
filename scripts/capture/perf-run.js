/**
 * Slice 0 performance driver — injected into /__viewport, loops in the page.
 *
 * Loads each route into the harness iframe `runs` times at the frame's exact
 * CSS size, installing buffered PerformanceObservers on each fresh document,
 * and returns per-route medians with min and max. Looping inside the page keeps
 * 165 measurements from costing 165 automation round trips.
 *
 * These are LAB PROXIES. See verification/thresholds.md § Browser evidence for
 * the profile, the algorithms, and why they are not field Core Web Vitals.
 *
 *   LCP proxy  last largest-contentful-paint entry, ms from the frame's
 *              navigation start
 *   CLS proxy  layout-shift entries with hadRecentInput === false, grouped into
 *              session windows (<=1s gap, <=5s window); the MAX window, not the
 *              naive sum
 *
 * The first load of each route is a discarded priming load, so every recorded
 * run is warm-cache, matching the profile.
 */
globalThis.__perfRun = async ({ routes, runs = 5, settleMs = 1500 }) => {
	const frame = document.getElementById('frame');
	if (!frame) throw new Error('no #frame — is this /__viewport?');

	const load = (url) =>
		new Promise((resolve) => {
			frame.addEventListener('load', () => resolve(frame.contentWindow), { once: true });
			frame.src = url;
		});

	const measureOnce = async (route) => {
		const view = await load(route);
		const shifts = [];
		let lcp = null;
		const observe = (type, cb) => {
			try {
				new view.PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({
					type,
					buffered: true,
				});
			} catch {
				/* entry type unsupported in this frame; reported as null below */
			}
		};
		observe('largest-contentful-paint', (e) => {
			lcp = e.startTime;
		});
		observe('layout-shift', (e) => {
			if (!e.hadRecentInput) shifts.push({ start: e.startTime, value: e.value });
		});
		await new Promise((r) => setTimeout(r, settleMs));

		let best = 0;
		let current = 0;
		let windowStart = 0;
		let previous = 0;
		for (const shift of shifts) {
			if (current && (shift.start - previous > 1000 || shift.start - windowStart > 5000)) {
				best = Math.max(best, current);
				current = 0;
			}
			if (!current) windowStart = shift.start;
			current += shift.value;
			previous = shift.start;
		}
		best = Math.max(best, current);

		const nav = view.performance.getEntriesByType('navigation')[0];
		const fcp = view.performance
			.getEntriesByType('paint')
			.find((p) => p.name === 'first-contentful-paint');
		return {
			lcp: lcp === null ? null : Math.round(lcp),
			cls: +best.toFixed(4),
			fcp: fcp ? Math.round(fcp.startTime) : null,
			load: nav ? Math.round(nav.loadEventEnd) : null,
			visible: view.document.visibilityState === 'visible',
		};
	};

	const median = (xs) => {
		const s = [...xs].sort((a, b) => a - b);
		return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
	};
	const stat = (xs) => {
		const clean = xs.filter((x) => typeof x === 'number');
		if (!clean.length) return null;
		return {
			median: +median(clean).toFixed(4),
			min: Math.min(...clean),
			max: Math.max(...clean),
			n: clean.length,
		};
	};

	const out = [];
	for (const route of routes) {
		await measureOnce(route); // priming load, discarded — every recorded run is warm
		const samples = [];
		for (let i = 0; i < runs; i += 1) samples.push(await measureOnce(route));
		out.push({
			route,
			viewport: [frame.clientWidth, frame.clientHeight],
			visible: samples.every((s) => s.visible),
			lcp: stat(samples.map((s) => s.lcp)),
			cls: stat(samples.map((s) => s.cls)),
			fcp: stat(samples.map((s) => s.fcp)),
			load: stat(samples.map((s) => s.load)),
		});
	}
	return out;
};
