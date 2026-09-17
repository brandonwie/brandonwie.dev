'use client';

/**
 * S9 — Sync: linear → parallel (0:45).
 * The React port of `src/routes/talks/my-career/slides/ParallelSyncSlide.svelte`.
 *
 * THERE WERE NO BATCHES BEFORE. Corrected 2026-07-29 on Brandon's report. This
 * slide used to render five blocks labelled "Batch" in the before state, which
 * contradicted every source: init.me.md says "linear 1 year limit sync
 * processing, NO BATCH (caused memory overflow for users with thousands of
 * events)", facts.md § MOBA sync carries "Linear sync with a 1-year history cap"
 * as the before, and storyboard.md § S9 specs "a single sequential lane splits
 * into parallel lanes". The build had drifted from its own spec.
 *
 * It also broke the causation. The memory overflow happened BECAUSE nothing
 * was batched — one pass held everything. Batching is what fixed memory;
 * running the batches together is what produced the throughput. Showing
 * batches as pre-existing collapsed two distinct changes into one and left
 * the memory note underneath unexplained.
 *
 * So the before state is ONE continuous bar: five segments butted together
 * with their inner borders collapsed and no per-block label, reading as a
 * single linear pass across the whole track. The word "Batch" appears only on
 * the advance — which is how the slide says batching was part of the fix
 * without spending a caption on it.
 *
 * FIVE SEGMENTS, NOT FOUR, AND THAT IS DELIBERATE. The one bar divides into
 * five and the stack occupies one fifth of the track it used to fill. The
 * animation therefore *is* the 5x — the number is not asserted next to a
 * picture, it is the picture. Change the count and the arithmetic on screen
 * stops matching.
 *
 * 5x is locked in facts.md C1 and matches the submitted CV. The
 * interview-facts file offers a 5–20x range; that range is deliberately NOT
 * used. Pick the figure the panel is holding.
 *
 * The segments are the same DOM nodes in both states — a class flips the flex
 * direction and Flip animates the delta. Nothing is created or destroyed, so
 * the single pass is visibly the same work that ends up running five at a
 * time.
 *
 * PUBLISH-SAFE: batch parallelism and a removed history cap, both already on
 * the submitted CV, with no internal detail beyond it. Keep it that way — the
 * repo this lives in is public.
 *
 * PORT NOTE (S60, opposite of EventDriven): this is Flip's classic supported
 * case — MOVE, not REPLACE. The five `.batch` nodes persist across the step
 * (keyed `.map()` under one `.lanes` wrapper; only the `parallel` class
 * toggles), so `Flip.from` must NOT receive explicit `targets`: handing it a
 * live re-query would be correct but is unnecessary here, and the S60
 * prescription forbids converting this move into a replace. The pre-mutation
 * capture / post-commit play split is the same two phases EventDriven uses.
 *
 * STRICTMODE. Every set, tween and timeline is created inside a
 * `gsap.context()` scoped to the slide root and retained in `running`, so the
 * mount cleanup reverts them and no stale delayed callback can overwrite a
 * reversal.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;
type FlipState = ReturnType<Bundle['Flip']['getState']>;

/** A layout effect on the client and a passive one during the static export,
 *  which is the standard way to keep React from warning about
 *  `useLayoutEffect` in a render that has no layout to read. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Props {
	step?: number;
	animate?: boolean;
}

// Five, because five in line versus five at once is exactly the 5x claim.
const BATCHES = [1, 2, 3, 4, 5];

// The one-year cap was stated three times — both state-line branches and
// here. It stays in the state pair, where the before/after contrast carries
// it, and leaves the notes. "during a sync" was scaffolding on a slide about
// syncing.
const notes = ['Heavy accounts no longer overflow memory'];

export default function ParallelSyncSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	/** Phase-1 → phase-2 handoff: the Flip state captured while the DOM still
	 *  shows the row, waiting for the post-commit phase to play it. */
	const handoff = useRef<{
		state: FlipState | null;
		want: boolean;
		still: boolean;
		target: number;
	} | null>(null);
	/** Every killable handle this slide issues, so a reversal cancels delayed
	 *  work whose stale callback would overwrite the restored state. */
	const running = useRef<Array<{ kill: () => void }>>([]);

	const [parallel, setParallel] = useState(false);
	const [ready, setReady] = useState(false);

	/** Everything GSAP touches goes through the slide's context, so one revert
	 *  undoes the whole slide on unmount. */
	const inContext = useCallback((body: () => void) => {
		const ctx = context.current;
		if (ctx) ctx.add(body);
		else body();
	}, []);

	const track = useCallback(<T extends { kill: () => void }>(handle: T): T => {
		running.current.push(handle);
		return handle;
	}, []);

	const killRunning = useCallback(() => {
		for (const handle of running.current) handle.kill();
		running.current = [];
	}, []);

	const runReveals = useCallback(
		(target: number, still: boolean) => {
			const element = root.current;
			const loaded = bundle.current;
			if (!element || !loaded) return;

			const d = still ? 0 : 1;
			const want = target >= 1;
			inContext(() => {
				// Kill the prior reveals before their delayed replacements: the
				// source issues these unconditionally, so a rapid 0→1→0 reversal
				// would otherwise fire the forward delay after the hide.
				loaded.gsap.killTweensOf(element.querySelectorAll('.gain, .note'));

				// The multiple arrives after the blocks land, in the space the
				// sequential run used to occupy. That empty track is the argument.
				track(
					loaded.gsap.to(element.querySelectorAll('.gain'), {
						autoAlpha: want ? 1 : 0,
						duration: DURATION * d,
						ease: EASE,
						delay: want ? DURATION * 1.5 * d : 0,
					}),
				);

				track(
					loaded.gsap.to(element.querySelectorAll('.note'), {
						autoAlpha: want ? 1 : 0,
						y: want ? 0 : 6,
						duration: DURATION * d,
						stagger: 0.07 * d,
						ease: EASE,
						delay: want ? DURATION * 1.7 * d : 0,
					}),
				);
			});
		},
		[inContext, track],
	);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const loaded = await loadGsap();
			if (cancelled || !root.current) return;

			bundle.current = loaded;
			context.current = loaded.gsap.context(() => {
				const element = root.current!;
				loaded.gsap.set(element.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelectorAll('.gain'), { autoAlpha: 0 });
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

	// PHASE 1 — pre-mutation. The `.batch` nodes are the SAME elements in both
	// states, so the capture reads the row the class toggle is about to leave.
	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const want = step >= 1;

		// Cancel every retained handle BEFORE this step's work — including an
		// in-flight Flip timeline — so nothing stale survives a reversal.
		killRunning();

		if (want !== parallel) {
			handoff.current = {
				state: still ? null : loaded.Flip.getState(element.querySelectorAll('.batch')),
				want,
				still,
				target: step,
			};
			setParallel(want);
			return;
		}

		runReveals(step, still);
	}, [animate, killRunning, parallel, ready, runReveals, step]);

	// PHASE 2 — post-mutation, pre-paint. The class toggle committed and the
	// same five nodes now sit in their new arrangement; Flip animates the
	// delta. NO `targets` key: the nodes were never destroyed, so the captured
	// state already points at live elements — the S60 same-node case.
	useIsomorphicLayoutEffect(() => {
		const pending = handoff.current;
		if (!pending) return;
		handoff.current = null;

		const loaded = bundle.current;
		const element = root.current;
		if (loaded && element && pending.state) {
			inContext(() =>
				// Slower than the deck default. The blocks travel a long way and
				// land in a different arrangement; at the standard duration it
				// reads as a jump rather than as five things pulling alongside
				// each other.
				track(
					loaded.Flip.from(pending.state as FlipState, {
						duration: DURATION * 1.5,
						ease: EASE,
						absolute: true,
					}),
				),
			);
		}

		runReveals(pending.target, pending.still);
	}, [inContext, parallel, runReveals, track]);

	return (
		<section className="slide parallel-sync" ref={root}>
			<header>
				<p className="company">MOBA &middot; 2025 &ndash; now</p>
				{/*
					NOT "Running the sync in parallel" — that described the animation
					the room is already watching. The picture IS the 5x, so the headline
					has to say the thing the picture cannot: batching is what stopped
					heavy accounts running out of memory.
				*/}
				<h1>Batching is what fixed the memory</h1>
				<p className="state">
					{parallel
						? 'After — batched, and the history cap is gone'
						: 'Before — one pass over every event, capped at one year'}
				</p>
			</header>

			{/* The stage is a fixed box representing elapsed time. One bar fills it;
			    the five batches it divides into occupy one fifth of it. */}
			<div className="stage">
				<div className={`lanes${parallel ? ' parallel' : ''}`}>
					{BATCHES.map((batch) => (
						<div className="batch" key={batch}>
							<span>Batch</span>
						</div>
					))}
				</div>

				{/* States on the bar the exact thing that was wrong before: there was
				    no batching at all. Deliberately NOT a repeat of the header
				    sentence — that one carries the pass and the cap, this one carries
				    the absence that caused the memory overflow. Absolutely positioned
				    for the same reason `.gain` is: naming the bar must not change its
				    geometry, or Flip animates the label's cost. */}
				<span className="pass">Nothing batched</span>

				<span className="gain">&asymp;5x throughput</span>
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
