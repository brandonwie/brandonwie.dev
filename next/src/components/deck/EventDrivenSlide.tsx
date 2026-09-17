'use client';

/**
 * S7 — Sync: coupling → event-driven (0:45).
 * The React port of `src/routes/talks/my-career/slides/EventDrivenSlide.svelte`.
 *
 * The single most important morph in the deck, and the beat where the
 * reasoning gets stated rather than just the outcome.
 *
 * The animation carries exactly one change: the queue module leaves the block
 * module. Everything else on screen holds still so the audience knows where to
 * look. That is the whole design rule.
 *
 * THE SYNC CALL, ADDED 2026-07-29 (Brandon, mid-walk). Decoupling alone was
 * the smaller half of this beat. The optimistic update was unreliable, so
 * every request forced a full sync as insurance — the heaviest module in the
 * system, one Google round trip per request, and users meeting Google's rate
 * limits as a result. Correcting the optimistic update removed the call
 * entirely. That is a root-cause story rather than a refactor, and it is the
 * strongest thing on this slide.
 *
 * IT IS TWO BOXES, NOT A SENTENCE (Brandon, 2026-07-29). The call sat in the
 * block module AND in the queue module. A line of text states the cost;
 * nested boxes state that it had to be removed from two places, which is the
 * part that makes it structural rather than a tidy-up. The boxes carry where,
 * and the line underneath carries what it cost.
 *
 * SYNC DID NOT DISAPPEAR — its trigger changed (Brandon, 2026-07-29). An
 * earlier version of this slide said "no sync call at all", which is not
 * survivable in a room that thinks for two seconds: a calendar sync engine
 * that never syncs raises the question immediately. What actually changed is
 * that sync stopped being on the request path and now runs when an
 * integration is connected. So the after-state has a Sync box of its own,
 * outside both modules, on its own trigger. The separation IS the claim,
 * which is why it is a box and not a note attached to somebody else's.
 *
 * THE OPTIMISTIC UPDATE LIVES IN THE BLOCK MODULE (Brandon, 2026-07-29). It
 * is the cause; the forced sync was insurance against it being wrong. Putting
 * it in the module that owns it — and above the call it caused — is what lets
 * the two be read together. Its border tells the story on its own: dashed
 * while it is unreliable, solid once it is correct, so the fix needs no
 * adjective.
 *
 * Its verified row is facts.md § Sync engine — force-sync from Google on every
 * request, hitting rate limits → correct optimistic updates survive without a
 * Google round trip. The row existed the whole time and had no beat; it was
 * the storyboard that was incomplete, not the ledger.
 *
 * DO NOT attribute the forced sync to a person on stage, in any wording. The
 * ledger row describes a mechanism and so does this slide. "The optimistic
 * update was unreliable, so every request forced a sync" is the whole story,
 * and naming who wrote it adds nothing except a way to look bad in a room of
 * engineers.
 *
 * It crossfades in one grid cell rather than getting a second Flip. One
 * expensive morph per slide is the budget, and this slide already spends it
 * on the queue.
 *
 * Claims here are at CV wording (see facts.md). No throughput number on this
 * slide — that belongs to S9. Error rate stays off it too: C4 locks that to
 * "near-zero" and it belongs with the recurring-event work.
 *
 * PORT NOTE (phases): same two-phase arrangement as the AccountSeparation
 * port. `Flip.getState()` runs in the step effect while the DOM still shows
 * the old nesting; `setDecoupled` schedules the render; the layout effect
 * after the commit plays the Flip and then the choreography. Svelte's
 * `await tick()` between capture and play has no direct equivalent, so the
 * port splits it across the two phases React actually has.
 *
 * PORT NOTE (S60): the `{#if}` destroys and recreates the queue node, so the
 * captured state references a detached element. `Flip.from` re-measures its
 * input for the end state; without explicit live `targets` it measures the
 * dead node, classifies the pair as leaving, and returns an empty timeline —
 * the detached/leaving defect S60 documents. Phase 2 re-queries
 * `[data-flip-id]` on the live DOM after the commit and passes them as
 * `targets`, exactly as prescribed.
 *
 * STRICTMODE. Every set, tween and delayedCall is created inside a
 * `gsap.context()` scoped to the slide root and retained in `running`, so the
 * mount cleanup reverts them and no stale callback can overwrite a reversal.
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

// Trimmed 2026-07-29. Note 1's trailing clause repeated the `.response` line
// below the diagram, and note 2 restated both halves of the sync-call caption.
// The picture and the caption already carry those; a note that says them again
// is the third telling, not reinforcement.
const notes = ['Fire and forget', 'A future service split stays possible'];

export default function EventDrivenSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	/** Phase-1 → phase-2 handoff: the Flip state captured pre-mutation, waiting
	 *  for the post-commit phase to play it. A ref, not state: writing it must
	 *  not schedule the very render it is trying to measure. */
	const handoff = useRef<{
		state: FlipState | null;
		want: boolean;
		still: boolean;
		target: number;
	} | null>(null);
	/** Every killable handle the choreography issues, so a reversal can cancel
	 *  delayed work whose stale callback would overwrite the restored state. */
	const running = useRef<Array<{ kill: () => void }>>([]);

	const [decoupled, setDecoupled] = useState(false);
	const [ready, setReady] = useState(false);

	// TWO STEPS: before and after. Deck-wide rule — no slide gets a third.
	//
	// A slide answers one question, so it has one transition. Everything after
	// the single advance is choreographed inside that one step: the queue
	// lands, the event channel draws into the gap, then the response and its
	// reasons arrive. Sequenced, but one input.
	// Derived from `decoupled` rather than `step` so the after-state DOM
	// arrives in the same commit the Flip state was captured for.
	const showChannel = decoupled;
	const respondsImmediately = decoupled;

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

	const runChoreography = useCallback(
		(target: number, still: boolean) => {
			const element = root.current;
			const loaded = bundle.current;
			if (!element || !loaded) return;

			const d = still ? 0 : 1;

			inContext(() => {
				// A rapid reversal must not leave a delayed reveal pending: the
				// source issues these unconditionally, so kill the prior targets
				// before creating their replacements. Retained handles die in
				// phase 1 — killing them here would also kill the Flip timeline
				// phase 2 tracks immediately before this runs.
				loaded.gsap.killTweensOf(
					element.querySelectorAll(
						'.sync-call, .sync-module, .sync-before, .sync-after, .note, .channel-line, .channel-head',
					),
				);

				// Draw the channel only on the advance that introduces it.
				// Re-running the draw on every later step would re-animate a line
				// that is already there, which reads as a glitch rather than a
				// change.
				const introducingChannel = target === 1 || (still && target >= 1);

				if (introducingChannel) {
					// Delayed past the Flip so the two reads as cause and effect —
					// the box leaves, then the channel fills the gap — rather than
					// as two things moving at once.
					const channel = element.querySelector('.channel-line');
					if (channel) {
						track(
							loaded.gsap.fromTo(
								channel,
								{ drawSVG: '0%' },
								{
									drawSVG: '100%',
									duration: 0.4 * d,
									ease: EASE,
									delay: DURATION * 0.7 * d,
								},
							),
						);
					}

					const head = element.querySelector('.channel-head');
					if (head) {
						track(
							loaded.gsap.fromTo(
								head,
								{ autoAlpha: 0 },
								{
									autoAlpha: 0.65,
									duration: 0.2 * d,
									ease: EASE,
									delay: (DURATION * 0.7 + 0.35) * d,
								},
							),
						);
					}
				}

				// Both sync-call boxes leave with the Flip, not after it. They are
				// what the advance is about, so they cannot wait their turn behind
				// the box that moves. No delay, and no initial hide in onMount
				// either: they are visible at step 0 by default, which is the
				// state that needs no help.
				track(
					loaded.gsap.to(element.querySelectorAll('.sync-call'), {
						autoAlpha: target >= 1 ? 0 : 1,
						duration: DURATION * d,
						ease: EASE,
					}),
				);

				// Sync itself arrives last of the diagram elements, after the calls
				// have gone and the channel has drawn. Order is the argument: the
				// call had to stop being on the request path before sync could be
				// a thing with its own trigger. Arriving first would read as a
				// fourth module appearing.
				track(
					loaded.gsap.to(element.querySelector('.sync-module'), {
						autoAlpha: target >= 1 ? 1 : 0,
						duration: DURATION * d,
						ease: EASE,
						delay: target >= 1 ? (DURATION * 0.7 + 0.15) * d : 0,
					}),
				);

				// The consequence line follows the channel, because it is the
				// result of the change rather than part of it: the calls go, the
				// event replaces them, and only then does the round trip stop
				// being necessary.
				const syncDelay = (DURATION * 0.7 + 0.3) * d;
				track(
					loaded.gsap.to(element.querySelector('.sync-before'), {
						autoAlpha: target >= 1 ? 0 : 0.75,
						duration: DURATION * d,
						ease: EASE,
						delay: target >= 1 ? syncDelay : 0,
					}),
				);
				track(
					loaded.gsap.to(element.querySelector('.sync-after'), {
						autoAlpha: target >= 1 ? 1 : 0,
						duration: DURATION * d,
						ease: EASE,
						delay: target >= 1 ? syncDelay : 0,
					}),
				);

				// Last in the sequence: the reasoning only makes sense once the
				// diagram and the response have both settled.
				track(
					loaded.gsap.to(element.querySelectorAll('.note'), {
						autoAlpha: target >= 1 ? 1 : 0,
						y: target >= 1 ? 0 : 6,
						duration: DURATION * d,
						stagger: 0.07 * d,
						ease: EASE,
						delay: target >= 1 ? (DURATION * 0.7 + 0.45) * d : 0,
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
				// Pin the resting state before the first render pass. Without this
				// the notes mount visible and only get faded out once GSAP loads,
				// so entering the slide flashed the final step's text.
				loaded.gsap.set(element.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelector('.sync-after'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelector('.sync-module'), { autoAlpha: 0 });
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

	// PHASE 1 — pre-mutation. Nothing has re-rendered for this step yet, so the
	// DOM still shows the nesting the Flip has to animate away FROM.
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

		// Cancel every retained handle BEFORE this step's work: a stale settle
		// callback or reveal tween surviving a reversal would overwrite the
		// restored state. This must run in phase 1, not the choreography —
		// phase 2 tracks the Flip timeline just before the choreography runs.
		killRunning();

		if (want !== decoupled) {
			// Capture geometry BEFORE React moves the node, then let the layout
			// phase animate the delta after the commit.
			handoff.current = {
				state: still ? null : loaded.Flip.getState(element.querySelectorAll('[data-flip-id]')),
				want,
				still,
				target: step,
			};
			setDecoupled(want);
			return;
		}

		runChoreography(step, still);
	}, [animate, decoupled, ready, runChoreography, step]);

	// PHASE 2 — post-mutation, pre-paint. The `{#if}` equivalent below has just
	// destroyed and recreated the queue node, so the captured state references
	// a detached element — and `Flip.from` re-measures its input for the end
	// state. Without explicit `targets` it measures the dead node, classifies
	// the pair as leaving, and returns an empty timeline that touches neither
	// node (the S60 detached/leaving defect). Re-query post-commit so the end
	// state measures the live replacement; `data-flip-id` is what pairs the
	// old position to it.
	useIsomorphicLayoutEffect(() => {
		const pending = handoff.current;
		if (!pending) return;
		handoff.current = null;

		const loaded = bundle.current;
		const element = root.current;
		if (loaded && element && pending.state) {
			const targets = element.querySelectorAll('[data-flip-id]');
			inContext(() =>
				track(
					loaded.Flip.from(pending.state as FlipState, {
						duration: DURATION,
						ease: EASE,
						absolute: true,
						targets,
					}),
				),
			);
		}

		runChoreography(pending.target, pending.still);
	}, [decoupled, inContext, runChoreography, track]);

	return (
		<section className="slide event-driven" ref={root}>
			<header>
				<p className="company">MOBA &middot; 2025 &ndash; now</p>
				{/*
					NOT "Decoupling the sync queue". That named the box labels rendered
					directly below it AND advertised the smaller half of the beat — the
					header above says so outright: the root cause is the strongest thing
					on this slide, and decoupling is what followed from fixing it. "A bad
					guess" is also the plain-language gloss of "optimistic update", which
					is the one term on this slide a non-specialist cannot decode.
				*/}
				<h1>Every request paid for a bad guess</h1>
				{/*
					The subtitle must not outrun the diagram. "Fire and forget" is only
					true once the response no longer waits, so it appears at that step
					and not when the box first moves.
				*/}
				<p className={`state${decoupled ? ' after' : ''}`}>
					{respondsImmediately
						? 'After — event-driven, and sync runs on connect'
						: 'Before — every request forces a sync'}
				</p>
			</header>

			<div className={`diagram${decoupled ? ' is-decoupled' : ''}`}>
				<div className="column">
					<div className="box block" data-flip-id="block">
						<span className="box-title">Block module</span>

						{/*
							The cause sits above the symptom, in the module that owns it. The
							forced sync was insurance against this box being wrong, so the two
							have to be readable together or the slide shows a cost with no
							reason.
						*/}
						{/*
							NOT `class:fixed` — and in React, not a `fixed` className either. A
							global utility `.fixed { position: fixed }` exists in the app
							stylesheet, and neither Svelte's scoping nor this port's
							namespacing protects against an unscoped global rule matching the
							same element. This box tore itself out of the block module and
							sat on top of the title until the class was renamed.
						*/}
						<span className={`box optimistic${decoupled ? ' is-correct' : ''}`}>
							Optimistic update
							<span className="box-note">{decoupled ? 'correct' : 'unreliable'}</span>
						</span>

						{/*
							Two sync-call boxes, not one. The call sat in the block module AND
							in the queue module, and a single box would show the cost without
							showing that it had to be removed from two places. That is the
							whole reason this is a box and not a sentence.
						*/}
						<span className="box sync-call">Sync call</span>

						{!decoupled && (
							<div className="box queue" data-flip-id="queue">
								<span className="box-title">Google queue module</span>
								<span className="box-note">dependency-injected</span>
								<span className="box sync-call">Sync call</span>
							</div>
						)}
					</div>
				</div>

				<div className="column channel" aria-hidden="true">
					{showChannel && (
						<>
							<svg viewBox="0 0 120 24" preserveAspectRatio="xMidYMid meet">
								<line className="channel-line" x1="2" y1="12" x2="108" y2="12" />
								{/* Direction matters: the block emits, the queue consumes. The
								    head fades in after the line lands so it never floats
								    detached. */}
								<polyline className="channel-head" points="103,7.5 111,12 103,16.5" />
							</svg>
							<span className="channel-label">event</span>
						</>
					)}
				</div>

				<div className="column lane">
					{decoupled && (
						<div className="box queue" data-flip-id="queue">
							<span className="box-title">Google queue module</span>
							<span className="box-note">own lifecycle</span>
							{/*
								Rendered and hidden rather than omitted, so the queue box keeps
								the same height across the Flip. Omitting it would make the box
								resize mid-morph, which reads as the diagram settling rather
								than as the call being removed.
							*/}
							<span className="box sync-call">Sync call</span>
						</div>
					)}
				</div>
			</div>

			{/*
				Sync did not go away — it is the product. What changed is its
				trigger. It sits BELOW the block-to-queue row rather than inside it,
				because that row is the request path and this is no longer on it.
				An engine that never runs would raise the obvious question the
				moment anyone thought about it; an engine drawn inside the request
				path would answer the wrong one.
			*/}
			<div className="box sync-module">
				<span className="box-title">Sync</span>
				<span className="box-note">runs when an integration is connected</span>
			</div>

			{/*
				The sync call, crossfading in one grid cell. Both states are in the
				DOM from first paint and neither is placed automatically, which is
				what lets them share a cell — the same mechanic ModulabsSlide and
				MoviationSlide use, and deliberately NOT another Flip. One
				expensive morph per slide is the budget.
			*/}
			{/*
				CUT TO HALF, 2026-07-29. These were the only two prose paragraphs
				in the deck, and between them they said the trigger change three
				times — the state line, the Sync box note, and here. "each time"
				restated "on every request"; "during normal use" was a defensive
				hedge; the whole second sentence of the after-state repeated what
				the Sync box already says.
			*/}
			<div className="synccall">
				<span className="sync-state sync-before">
					Every request &mdash; the heaviest module in the system, one Google round trip. Users hit
					Google&rsquo;s rate limits.
				</span>
				<span className="sync-state sync-after">
					Correct updates hold on their own &mdash; no Google round trip.
				</span>
			</div>

			<p className="response">
				Response to the caller:{' '}
				<strong>{respondsImmediately ? 'immediate' : 'waits for the queue'}</strong>
			</p>

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
