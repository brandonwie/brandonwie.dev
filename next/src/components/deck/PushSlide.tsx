'use client';

/**
 * S8 — Sync: polling → push (0:45) · cut-3.
 * The React port of `src/routes/talks/my-career/slides/PushSlide.svelte`.
 *
 * THE SLIDE'S ARGUMENT IS UNCHANGED and the prose comments that carry it stay
 * with the markup below. What changed is the machinery underneath.
 *
 * NO FLIP ON THIS SLIDE. The header comment's "BOTH ARROWS FLIP" is prose, not
 * a call — there is no `Flip.getState`/`Flip.from` here (verified: the only
 * `Flip` mention in the original is that comment). The connectors cross-fade
 * in place via `gsap.fromTo`; the nodes never move. That makes this slide an
 * ordinary-cohort port: no capture/play split, no targets question.
 *
 * PORT NOTE (tick): Svelte's `render()` assigns `pushed`, `await tick()`s, then
 * queries the fresh nodes. React has no `tick()` — a state update lands in the
 * commit that follows, and the layout effect below runs after that commit, so
 * the swap query already sees the fresh `.link-swap` nodes. No tick needed.
 *
 * PORT NOTE (phases): the account-separation port splits capture and play
 * across two phases because Flip state must be taken pre-mutation. This slide
 * captures nothing, so phase 1 only computes `want`/`still` and moves the
 * state; phase 2 (layout, pre-paint — the fromTo must not flash un-animated)
 * plays the swap and the note reveals. The reveal-only path (step re-applied
 * with the nesting already right) runs the reveals straight from phase 1,
 * exactly where the Svelte original runs them unconditionally after its ticks.
 *
 * STRICTMODE. Same arrangement as the account-separation port: every tween
 * and every `set` is created inside a `gsap.context()` scoped to the slide
 * root, so the cleanup reverts them and the second mount starts clean. The
 * `applied` guard makes the double-invoked phase-1 effect re-enter safely.
 *
 * GOOGLE ONLY. facts.md § Do not say is explicit: the push mechanism is
 * Google-only. Apple-originated events are normalized into a Google-centric
 * model, which is a different claim and does not belong on this slide. Do NOT
 * write "Apple push" here or anywhere in the deck.
 *
 * The WebSocket-over-SSE line is Brandon's own design reasoning rather than a
 * CV claim, which facts.md permits stating as a decision. Keep it phrased as a
 * choice he made, not as a benchmark he measured.
 *
 * PUBLISH-SAFE: webhook plus WebSocket is the shape already described on the
 * submitted CV, with no internal detail beyond it. Keep it that way — the repo
 * this lives in is public.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

/** A layout effect on the client and a passive one during the static export,
 *  which is the standard way to keep React from warning about
 *  `useLayoutEffect` in a render that has no layout to read. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Props {
	step?: number;
	animate?: boolean;
}

// Note 1's trailing clause was the headline and the state line said a third
// time; note 2's "chosen for ... scalability" was scaffolding around the
// reason. SSE stays spelled out — an unexpanded acronym on a slide is a word
// the presenter has to stop and translate.
const NOTES = [
	'Polling removed entirely',
	'WebSocket over server-sent events — realtime notes scale better',
];

export default function PushSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	/** Phase-1 → phase-2 handoff. A ref, not state: writing it must not
	 *  schedule the very render whose commit phase 2 waits for. */
	const handoff = useRef<{ want: boolean; still: boolean } | null>(null);

	const [pushed, setPushed] = useState(false);
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

			const d = still ? 0 : 1;
			inContext(() => {
				// PORT NOTE (divergence, Claude R1 + Devin): the Svelte
				// original issues this tween unconditionally, so a rapid
				// 0→1→0 reversal leaves the delayed reveal pending and it
				// fires after the hide — notes visible in the Before state
				// (reproduced live). Kill first: standard practice, no effect
				// at presentation speed, and the template for ordinary slides.
				loaded.gsap.killTweensOf(element.querySelectorAll('.note'));
				loaded.gsap.to(element.querySelectorAll('.note'), {
					autoAlpha: want ? 1 : 0,
					y: want ? 0 : 6,
					duration: DURATION * d,
					stagger: 0.07 * d,
					ease: EASE,
					delay: want ? DURATION * 0.9 * d : 0,
				});
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
				loaded.gsap.set(root.current!.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
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

	// PHASE 1 — decide. Nothing animates here; a nesting change schedules the
	// render whose commit phase 2 waits for, and the nesting-already-right
	// path reveals straight away.
	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const want = step >= 1;

		if (want !== pushed) {
			handoff.current = { want, still };
			setPushed(want);
			return;
		}

		runReveals(want, still);
	}, [animate, pushed, ready, runReveals, step]);

	// PHASE 2 — post-mutation, pre-paint. The conditional below has just
	// swapped the connectors; the fromTo cross-fades the fresh nodes in place.
	useIsomorphicLayoutEffect(() => {
		const pending = handoff.current;
		if (!pending) return;
		handoff.current = null;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// The arrows cross-fade in place rather than sliding. A connector that
		// travels would suggest something moved through the system; what
		// actually changed is which end starts the conversation.
		if (!pending.still) {
			const links = element.querySelectorAll('.link-swap');
			if (links.length) {
				inContext(() => {
					loaded.gsap.fromTo(
						links,
						{ autoAlpha: 0, scale: 0.9 },
						{ autoAlpha: 1, scale: 1, duration: DURATION, stagger: 0.1, ease: EASE },
					);
				});
			}
		}

		runReveals(pending.want, pending.still);
	}, [inContext, pushed, runReveals]);

	return (
		<section className="slide push" ref={root}>
			<header>
				<p className="company">MOBA &middot; 2025 &ndash; now</p>
				<h1>From asking to being told</h1>
				<p className="state">
					{pushed
						? 'After — Google announces the change, and it reaches the client as it happens'
						: 'Before — the client asked on a timer, and nothing existed between asks'}
				</p>
			</header>

			{/* Five fixed columns: three nodes and two connectors. The nodes never move;
			    only the connectors change direction and label. */}
			<div className="chain">
				<div className="node">
					<span className="node-title">Google Calendar</span>
				</div>

				{pushed ? (
					<div className="link link-swap">
						<span className="glyph">&rarr;</span>
						<span className="link-label">webhook</span>
					</div>
				) : (
					<div className="link link-swap">
						<span className="glyph">&larr;</span>
						<span className="link-label">fetched on request</span>
					</div>
				)}

				<div className="node">
					<span className="node-title">Server</span>
				</div>

				{pushed ? (
					<div className="link link-swap">
						<span className="glyph">&rarr;</span>
						<span className="link-label">WebSocket push</span>
					</div>
				) : (
					<div className="link link-swap">
						<span className="glyph">&larr;</span>
						<span className="link-label">polled on a timer</span>
					</div>
				)}

				<div className="node">
					<span className="node-title">Client</span>
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

/** Re-exported so the harness can assert the component and the Svelte original
 *  agree on one duration and one curve rather than two copies of the numbers. */
export { DURATION, EASE };
