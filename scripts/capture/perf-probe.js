/**
 * Slice 0 performance probe — injected verbatim into the page under test.
 *
 * Lab proxies, not field Core Web Vitals. See verification/thresholds.md
 * § Browser evidence for the profile, the algorithms and the bounds.
 *
 *   LCP proxy   last largest-contentful-paint entry before first input/scroll
 *   CLS proxy   layout-shift entries with hadRecentInput === false, grouped
 *               into session windows (<=1s gap, <=5s window); MAX window
 *   INT proxy   worst `event` entry duration (durationThreshold 16)
 *
 * Returns one run's numbers. The caller navigates, waits, then evaluates this.
 */
globalThis.__perfProbe = async (settleMs = 1200) => {
	const shifts = [];
	const events = [];
	let lcp = null;

	const observe = (type, cb, extra = {}) => {
		try {
			new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({
				type,
				buffered: true,
				...extra,
			});
			return true;
		} catch (error) {
			return String(error);
		}
	};

	const installed = {
		lcp: observe('largest-contentful-paint', (e) => {
			lcp = e.startTime;
		}),
		shift: observe('layout-shift', (e) => {
			if (!e.hadRecentInput) shifts.push({ start: e.startTime, value: e.value });
		}),
		event: observe(
			'event',
			(e) => {
				events.push({ name: e.name, duration: e.duration });
			},
			{ durationThreshold: 16 },
		),
	};

	await new Promise((resolve) => setTimeout(resolve, settleMs));

	// CLS as the maximum session window, not the naive sum of every shift.
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

	const nav = performance.getEntriesByType('navigation')[0];
	const paint = Object.fromEntries(
		performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]),
	);

	return {
		url: location.pathname,
		viewport: [innerWidth, innerHeight],
		dpr: devicePixelRatio,
		installed,
		lcpMs: lcp === null ? null : Math.round(lcp),
		cls: +best.toFixed(4),
		shiftCount: shifts.length,
		interactionMs: events.length ? Math.round(Math.max(...events.map((e) => e.duration))) : null,
		eventCount: events.length,
		fcpMs: paint['first-contentful-paint'] ?? null,
		domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
		loadMs: nav ? Math.round(nav.loadEventEnd) : null,
		transferBytes: nav ? nav.transferSize : null,
	};
};
