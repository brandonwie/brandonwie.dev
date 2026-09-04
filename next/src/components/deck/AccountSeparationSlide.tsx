'use client';

/**
 * S6 — Sync: account separation (0:45) · cut-3.
 * The React port of `src/routes/talks/my-career/slides/AccountSeparationSlide.svelte`.
 *
 * THE SLIDE'S ARGUMENT IS UNCHANGED and the prose comments that carry it stay
 * with the markup below. What changed is the machinery underneath, and only
 * one part of that is interesting.
 *
 * THE ONE HARD PART: `Flip.getState()` must run BEFORE the DOM moves.
 *
 * Svelte gets this for free. `render()` captures the state, assigns
 * `separated`, and then `await tick()` — a call that means "flush the pending
 * DOM update and come back". Capture, mutate, play, in three statements of one
 * function (`AccountSeparationSlide.svelte:72`, `:75`, `:77`).
 *
 * React has no `tick()`. A state update schedules a render; the DOM changes
 * during the commit that follows, and every effect the component owns runs
 * AFTER that commit. So the naive transcription — capture and play in one
 * effect — captures a rectangle the browser has already moved, and Flip plays
 * a zero-distance animation. It does not throw and it does not warn. It just
 * silently stops animating, which is the same failure class as both live
 * defects found in the PR 2 review (a stale FLIP `from` box, and a missing
 * animation abort).
 *
 * The port therefore splits the three statements across the two phases React
 * actually has:
 *
 *   effect on `step`     capture (the DOM still shows the old nesting here,
 *                        because nothing has re-rendered yet), then setState
 *   layout effect on     the commit has landed and the node has moved; play
 *   `separated`          Flip from the captured state, then run the reveals
 *
 * It is a LAYOUT effect, not a passive one, because a passive effect runs
 * after paint: the browser would show one frame of the node already at its
 * destination before Flip pulled it back to the start. One frame of the
 * finished state is exactly what a Flip animation exists to prevent.
 *
 * STRICTMODE. React 19 double-invokes effects in development. Every tween and
 * every `set` is created inside a `gsap.context()` scoped to the slide root,
 * so the cleanup reverts them and the second mount starts from the same place
 * the first one did. The GSAP loader's module-level memo covers the other half
 * — two mounts await one `registerPlugin`, they do not register twice.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';
import { FLIP_OPTIONS, initialSets, planStep, revealTweens } from '@/deck/slide-plan';

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

// These carry the precision now that the state line above them stopped
// restating both of them at full length ("any number of ... any number of").
const NOTES = [
	'One user can connect any number of calendar accounts',
	'Each connected account can sync any number of calendars',
];

export default function AccountSeparationSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	/** The Flip state captured in the pre-mutation phase, waiting for the
	 *  post-commit phase to play it. A ref, not state: writing it must not
	 *  schedule the very render it is trying to measure. */
	const handoff = useRef<{ state: FlipState | null; want: boolean; still: boolean } | null>(null);

	const [separated, setSeparated] = useState(false);
	const [ready, setReady] = useState(false);

	/** Everything GSAP touches goes through the slide's context, so one revert
	 *  undoes the whole slide on unmount. */
	const inContext = useCallback((body: () => void) => {
		const ctx = context.current;
		if (ctx) ctx.add(body);
		else body();
	}, []);

	const runReveals = useCallback(
		(want: boolean, still: boolean) => {
			const element = root.current;
			const loaded = bundle.current;
			if (!element || !loaded) return;

			inContext(() => {
				for (const tween of revealTweens(want, still)) {
					loaded.gsap.to(element.querySelectorAll(tween.selector), tween.vars);
				}
			});
		},
		[inContext],
	);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const loaded = await loadGsap();
			if (cancelled || !root.current) return;

			bundle.current = loaded;
			context.current = loaded.gsap.context(() => {
				for (const set of initialSets()) {
					loaded.gsap.set(root.current!.querySelectorAll(set.selector), set.vars);
				}
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			context.current?.revert();
			context.current = null;
			// Not the bundle: the loader memo is module-scoped and shared, and
			// clearing this ref would only force a second await on remount.
			applied.current = -1;
		};
	}, []);

	// PHASE 1 — pre-mutation. Nothing has re-rendered for this step yet, so the
	// DOM still shows the nesting the Flip has to animate away FROM.
	useEffect(() => {
		const plan = planStep({
			step,
			applied: applied.current,
			ready,
			separated,
			animate,
			// Read imperatively, exactly as the Svelte original does: this is not
			// reactive there either, so a mid-slide OS change does not retrigger.
			reduced: reducedMotion(),
		});

		if (plan.kind === 'skip') return;
		applied.current = step;

		if (plan.kind === 'reveal') {
			runReveals(plan.want, plan.still);
			return;
		}

		const loaded = bundle.current;
		const element = root.current;
		if (!loaded || !element) return;

		handoff.current = {
			state: plan.capture ? loaded.Flip.getState(element.querySelectorAll('[data-flip-id]')) : null,
			want: plan.want,
			still: plan.still,
		};
		setSeparated(plan.want);
	}, [animate, ready, runReveals, separated, step]);

	// PHASE 2 — post-mutation, pre-paint. The `{#if}` equivalent below has just
	// destroyed and recreated the node; `data-flip-id` is what matches the old
	// position to the new element.
	useIsomorphicLayoutEffect(() => {
		const pending = handoff.current;
		if (!pending) return;
		handoff.current = null;

		const loaded = bundle.current;
		if (loaded && pending.state) {
			inContext(() => loaded.Flip.from(pending.state as FlipState, FLIP_OPTIONS));
		}

		runReveals(pending.want, pending.still);
	}, [inContext, runReveals, separated]);

	return (
		<section className="slide account-separation" ref={root}>
			<header>
				<p className="company">MOBA · 2025 – now</p>
				{/*
					NOT "Splitting the calendar from the user" — the two boxes below are
					literally labelled "User account" and "Calendar account", so the headline
					was reading them out. It was also a stage direction for the Flip rather
					than a claim. What the slide argues is that the coupling was the limit:
					one account each was not a scale decision, it was a consequence of the
					two being the same record.
				*/}
				<h1>Coupling was the cap, not scale</h1>
				<p className="state">
					{separated
						? 'After — one user, many accounts, many calendars'
						: 'Before — the calendar account was the user account'}
				</p>
			</header>

			{/* Fixed columns and a reserved height. The right column is empty at step 1
			    on purpose: the space the accounts will occupy is already allocated, so
			    nothing on the left moves when they arrive. */}
			<div className="board">
				<div className="user-box">
					<span className="box-title">User account</span>

					{!separated ? (
						<div className="account nested" data-flip-id="calendar-account">
							<span className="box-title">Calendar account</span>
							<span className="box-note">one, and only ever one</span>
						</div>
					) : (
						/* The box would otherwise sit empty at its reserved height and read
						   as unfinished rather than as deliberately emptied. */
						<span className="box-note second">
							identity only — nothing calendar-shaped left in it
						</span>
					)}
				</div>

				<div className="accounts">
					{separated && (
						<>
							<div className="account" data-flip-id="calendar-account">
								<span className="box-title">Calendar account</span>
								<div className="chips">
									<span className="chip">Calendar</span>
									<span className="chip">Calendar</span>
									<span className="chip chip-more">…</span>
								</div>
							</div>
							<div className="account second">
								<span className="box-title">Calendar account</span>
								<div className="chips">
									<span className="chip">Calendar</span>
									<span className="chip">Calendar</span>
									<span className="chip chip-more">…</span>
								</div>
							</div>
							{/* Two cards read as a limit of two. The ellipsis under the stack is
							    what makes it a list. */}
							<span className="more second" aria-label="and more calendar accounts">
								…
							</span>
						</>
					)}
				</div>
			</div>

			<ul className="notes">
				{NOTES.map((note) => (
					<li className="note" key={note}>
						{note}
					</li>
				))}
			</ul>
		</section>
	);
}

/** Re-exported so the harness can assert the component and the planner agree
 *  on one duration and one curve rather than two copies of the numbers. */
export { DURATION, EASE };
