'use client';

/**
 * S5 — MOBA, the setup (0:20).
 * The React port of `src/routes/talks/my-career/slides/MobaSetupSlide.svelte`.
 *
 * The shortest slide in the deck, and the only one whose job is purely to set
 * scale. Everything after it — four sync slides, infrastructure, the data
 * pipeline — is unreadable without knowing what the system grew into.
 *
 * THE FRAME IS CLOSED BETA → PUBLIC, not just "numbers went up". Brandon was
 * handed the system in closed beta; it went public underneath him. That is a
 * different and better claim than growth alone, because it names what changed
 * about the system's obligations, not only its size.
 *
 * ROLE WORDING IS THE CV'S, VERBATIM: "lead backend engineering" and "built and
 * own the core Calendar Sync Engine". An earlier draft said "sole backend
 * owner"; that had no verified row, and "sole" is an escalation the panel
 * cannot check. See facts.md § Role and scale (S5).
 *
 * EACH MULTIPLE SITS ON ITS OWN ROW. Users went 120 → 6.5k, which is ≈54x.
 * Events went 200k → 7M, which is 35x. A single multiple floating over both
 * rows would silently claim one metric's ratio for the other; per-row means
 * every figure on the slide is recomputable from the two numbers printed
 * beside it. See facts.md C2.
 *
 * BOTH FIGURES CORRECTED 2026-07-29 (Brandon, mid-walk). Users read 6,000+ and
 * events started at 500k; the real numbers are 6.5k+ and 200k. That moves the
 * event multiple from 14x to 35x, and the user multiple from the CV's 50x to
 * 54x — the recomputability rule above is what forces the second change, since
 * 6.5k over 120 does not come to 50 and this audience does arithmetic. The
 * CV's ~50x was true against 6,000; the slide says "today", which is what lets
 * the two differ without reading as a discrepancy.
 *
 * The bars are not decoration. Two numbers side by side are arithmetic; a
 * sliver becoming a full track is the ratio, read instantly.
 *
 * PUBLISH-SAFE: user and event counts only, no MOBA-internal architecture.
 * Keep it that way — the repo this lives in is public.
 *
 * PORT NOTE (motion): Svelte's `$state` proxies tween counts in place; React
 * keeps them in state plus a ref mirror so the tween's onUpdate and the settle
 * delayedCall see one source of truth. Every tween and the settle delayedCall
 * are retained in `running` and killed before the next applied step — the
 * source issues its delayedCall unconditionally, so a rapid 0→1→0 reversal
 * would otherwise let the stale callback write final counts and flip `settled`
 * after the reverse settled.
 *
 * STRICTMODE. Every set, tween and delayedCall is created inside a
 * `gsap.context()` scoped to the slide root, so the mount cleanup reverts them
 * and the second mount starts clean. The `applied` ref guard makes the
 * double-invoked step effect re-enter safely.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

function events(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	return `${Math.round(v / 1000)}k`;
}

// Switches to `k` at a thousand so the counter's units match where it lands.
// Rendering the run as 1,340 and the rest as 6.5k would change notation at the
// exact moment the eye stops moving, which reads as a glitch rather than as
// the number settling.
function users(v: number): string {
	if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	return `${Math.round(v)}`;
}

// `fromLabel` / `toLabel` are the exact resting wording; `fmt` only renders
// the in-between frames while the counter is moving. That keeps the two
// states under the ledger's control and lets the motion be approximate.
const METRICS = [
	{
		key: 'users',
		label: 'Users',
		from: 120,
		to: 6500,
		fromLabel: '~120',
		toLabel: '6.5k+',
		multiple: '≈54x',
		fmt: users,
	},
	{
		key: 'events',
		label: 'Events',
		from: 200_000,
		to: 7_000_000,
		fromLabel: '200k',
		toLabel: '7M+',
		multiple: '≈35x',
		fmt: events,
	},
];

const notes = ['Lead backend engineering', 'Built and own the core Calendar Sync Engine'];

export default function MobaSetupSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);

	const initialCounts = METRICS.map((metric) => metric.from);
	const countsRef = useRef(initialCounts);
	const running = useRef<Array<{ kill: () => void }>>([]);
	const [grown, setGrown] = useState(false);
	const [settled, setSettled] = useState(true);
	const [counts, setCounts] = useState(initialCounts);
	const [ready, setReady] = useState(false);

	/** Everything GSAP touches goes through the slide's context, so one revert
	 *  undoes the whole slide on unmount. */
	const inContext = useCallback((body: () => void) => {
		const ctx = context.current;
		if (ctx) ctx.add(body);
		else body();
	}, []);

	const writeCount = useCallback((index: number, value: number) => {
		countsRef.current[index] = value;
		setCounts((previous) => {
			const next = [...previous];
			next[index] = value;
			return next;
		});
	}, []);

	const killRunning = useCallback(() => {
		for (const handle of running.current) handle.kill();
		running.current = [];
	}, []);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const loaded = await loadGsap();
			if (cancelled || !root.current) return;

			bundle.current = loaded;
			context.current = loaded.gsap.context(() => {
				loaded.gsap.set(root.current!.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(root.current!.querySelectorAll('.multiple'), { autoAlpha: 0 });
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			killRunning();
			context.current?.revert();
			context.current = null;
			// Not the bundle: the loader memo is module-scoped and shared, and
			// clearing this ref would only force a second await on remount.
			applied.current = -1;
		};
	}, [killRunning]);

	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = step >= 1;

		// Cancel every retained handle BEFORE the new step issues its own: the
		// source's settle delayedCall writes final counts and `settled`, so a
		// stale one surviving a reversal would rewrite the Before state.
		killRunning();
		loaded.gsap.killTweensOf(element.querySelectorAll('.multiple'));
		loaded.gsap.killTweensOf(element.querySelectorAll('.note'));
		loaded.gsap.killTweensOf(element.querySelectorAll('.fill'));

		setGrown(want);

		// Slower than the deck default: this is the one animation whose duration
		// is carrying meaning. A climb that finishes as fast as a box swap does
		// not read as a climb.
		const growth = DURATION * 1.8;
		const fills = element.querySelectorAll('.fill');

		METRICS.forEach((m, i) => {
			const to = want ? m.to : m.from;
			const width = want ? '100%' : `${(m.from / m.to) * 100}%`;
			const fill = fills[i];

			if (still) {
				writeCount(i, to);
				if (fill) {
					inContext(() => loaded.gsap.set(fill, { width }));
				}
				return;
			}

			const proxy = { v: countsRef.current[i] };
			inContext(() => {
				running.current.push(
					loaded.gsap.to(proxy, {
						v: to,
						duration: growth,
						ease: EASE,
						onUpdate: () => writeCount(i, proxy.v),
					}),
				);
				if (fill) {
					running.current.push(loaded.gsap.to(fill, { width, duration: growth, ease: EASE }));
				}
			});
		});

		if (still) {
			setSettled(true);
		} else {
			setSettled(false);
			inContext(() => {
				running.current.push(
					loaded.gsap.delayedCall(growth, () => {
						METRICS.forEach((m, i) => writeCount(i, want ? m.to : m.from));
						setSettled(true);
					}),
				);
			});
		}

		inContext(() => {
			// The multiple lands with the bar, not before it — it is the answer to
			// the motion, so it cannot arrive while the bar is still climbing.
			running.current.push(
				loaded.gsap.to(element.querySelectorAll('.multiple'), {
					autoAlpha: want ? 1 : 0,
					duration: DURATION * d,
					ease: EASE,
					delay: want ? growth * 0.85 * d : 0,
				}),
			);

			running.current.push(
				loaded.gsap.to(element.querySelectorAll('.note'), {
					autoAlpha: want ? 1 : 0,
					y: want ? 0 : 6,
					duration: DURATION * d,
					stagger: 0.07 * d,
					ease: EASE,
					delay: want ? growth * 0.7 * d : 0,
				}),
			);
		});
	}, [animate, inContext, killRunning, ready, step, writeCount]);

	return (
		<section className="slide moba-setup" ref={root}>
			<header>
				<p className="company">MOBA &middot; 2025 &ndash; now</p>
				{/*
					NOT "Where the backend had to keep up" — a topic sentence, and passive on
					the one slide that establishes scope. The header above says the frame is
					closed beta to public: what changed was the system's obligations, not only
					its size. That is the claim, so it is the headline.
				*/}
				<h1>It went public underneath me</h1>
				<p className="state">
					{grown
						? 'Public — the same engine today'
						: 'Closed beta — when the system was handed to me'}
				</p>
			</header>

			{/* One grid for both metrics, so the numbers and the bars line up in
			    columns. Every column is fixed width, so nothing moves when the
			    figures change length. */}
			<div className="metrics">
				{METRICS.map((metric, i) => (
					<MetricRow
						key={metric.key}
						metric={metric}
						display={settled ? (grown ? metric.toLabel : metric.fromLabel) : metric.fmt(counts[i])}
					/>
				))}
			</div>

			<ul className="notes">
				{notes.map((note) => (
					<li className="note" key={note}>
						{note}
					</li>
				))}
			</ul>
		</section>
	);
}

function MetricRow({ metric, display }: { metric: (typeof METRICS)[number]; display: string }) {
	return (
		<>
			<span className="metric-label">{metric.label}</span>
			<span className="count">{display}</span>
			<div className="track">
				<div className="fill" style={{ width: `${(metric.from / metric.to) * 100}%` }} />
			</div>
			<span className="multiple">{metric.multiple}</span>
		</>
	);
}
