'use client';

/**
 * S5 — Playtag, the backend seat (0:45).
 * The React port of `src/routes/talks/my-career/slides/PlaytagBackendSlide.svelte`.
 *
 * The second half of the Playtag section, and the pivot point of the whole arc:
 * this is where frontend became full-stack, because the backend seat opened and
 * Brandon was the one already writing JavaScript.
 *
 * THE ANIMATION CARRIES THE TURN, NOT A TASK. An earlier version made the hero
 * beat a connection-pool tuning; that is a task, and burying the pivot under it
 * wasted the one slide where the arc actually bends. The pool work is a note now.
 *
 * The filled seat spans both rows — deliberately the same visual idea as the
 * MODULABS gateway, so the audience reads it without being taught it twice.
 *
 * Note the slide shows the FACT (seat empty, then filled, no gap). The readiness
 * behind it — being prepared and waiting for the chance — is Brandon's to say
 * out loud; as a printed claim about himself it would be weak.
 *
 * The connection-pool work was cut entirely (2026-07-26). It was a task, not a
 * turn, and it carried the deck's only soft number. It stays in facts.md for
 * Q&A; do not re-add it here.
 *
 * Do NOT claim ownership of the Spring repository or service layers (facts.md
 * C3). Brandon took part in that migration; he did not lead it. "Led" appears
 * exactly once on this slide, on the GitLab to GitHub migration, and that is
 * what makes the other verbs read as deliberate rather than modest.
 *
 * PORT NOTE (phases): same arrangement as the PlaytagAdminSlide port. The
 * `.filled` seat is conditionally rendered, so the step effect only computes
 * `want`/`still` and moves the state; the layout effect that follows the
 * commit sees the fresh `.filled` node and plays the source's fromTo
 * pre-paint. The reveal-only path (step re-applied with the seats already
 * right) runs the reveals straight from phase 1, exactly where the Svelte
 * original runs them unconditionally after its ticks.
 *
 * STRICTMODE. Every set and tween is created inside a `gsap.context()` scoped
 * to the slide root, so the mount cleanup reverts them and the second mount
 * starts clean. The `applied` ref guard makes the double-invoked phase-1
 * effect re-enter safely.
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

const notes = [
	// "Participated", not "contributed": Brandon gave opinions on the schema
	// but did not own the design. Below CV wording on purpose — going under
	// what the CV claims is always safe, going over never is.
	// Both lines became noun phrases 2026-07-29. They were written-CV sentences
	// with trailing subordinate clauses; the hedge is preserved by keeping the
	// scope word ("part of", not "led"), so shortening them costs no accuracy
	// and stops the diffidence reading as a full spoken sentence.
	'Part of the schema redesign for grade and class transitions — full history preserved',
	// Not "led" — see facts.md C3. Hands-on in the migration, not assisting
	// from the side, and not owning it either.
	'Part of the Kotlin and Spring Boot migration — NestJS kept serving production',
	'Infrastructure management, EFK logging, GitHub CI/CD',
];

export default function PlaytagBackendSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	/** Phase-1 → phase-2 handoff. A ref, not state: writing it must not
	 *  schedule the very render whose commit phase 2 waits for. */
	const handoff = useRef<{ want: boolean; still: boolean } | null>(null);

	const [parallel, setParallel] = useState(false);
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
				// The Svelte original issues this tween unconditionally, so a rapid
				// 0→1→0 reversal leaves the delayed reveal pending and it fires
				// after the hide — notes visible in the Before state. Kill first:
				// no effect at presentation speed; the accepted PushSlide template.
				loaded.gsap.killTweensOf(element.querySelectorAll('.note'));
				loaded.gsap.to(element.querySelectorAll('.note'), {
					autoAlpha: want ? 1 : 0,
					y: want ? 0 : 6,
					duration: DURATION * d,
					stagger: 0.07 * d,
					ease: EASE,
					delay: want ? DURATION * 0.6 * d : 0,
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

	// PHASE 1 — decide. Nothing animates here; a seat swap schedules the render
	// whose commit phase 2 waits for, and the seats-already-right path reveals
	// straight away.
	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const want = step >= 1;

		if (want !== parallel) {
			handoff.current = { want, still };
			setParallel(want);
			return;
		}

		runReveals(want, still);
	}, [animate, parallel, ready, runReveals, step]);

	// PHASE 2 — post-mutation, pre-paint. The conditional below has just
	// swapped the seat DOM; the fromTo grows the fresh `.filled` seat in.
	useIsomorphicLayoutEffect(() => {
		const pending = handoff.current;
		if (!pending) return;
		handoff.current = null;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		if (pending.want && !pending.still) {
			// The filled seat grows into the space the vacancy left, so the change
			// reads as one motion closing a gap rather than two boxes swapping.
			const seat = element.querySelector('.filled');
			if (seat) {
				inContext(() => {
					loaded.gsap.fromTo(
						seat,
						{ autoAlpha: 0, scaleY: 0.7 },
						{
							autoAlpha: 1,
							scaleY: 1,
							duration: DURATION,
							ease: EASE,
							transformOrigin: 'top center',
						},
					);
				});
			}
		}

		runReveals(pending.want, pending.still);
	}, [inContext, parallel, runReveals]);

	return (
		<section className="slide playtag-backend" ref={root}>
			<header>
				<p className="company">Playtag &middot; 2023 &ndash; 2025</p>
				{/*
					NOT "Taking the empty backend seat" — the row label below says "Backend"
					and the seat box says "Unfilled", so the headline was captioning its own
					diagram. It also dropped the half that matters: he did not move seats, he
					took a second one. The box spanning both rows is that claim; the headline
					now says it too.
				*/}
				<h1>I widened instead of switching</h1>
				<p className="state">
					{parallel
						? 'After — both seats, and the frontend kept'
						: 'Before — frontend, and the main JavaScript writer'}
				</p>
			</header>

			{/* The span is the whole slide: one engineer covering both rows where
			    there used to be a gap. Deliberately the same visual idea as the
			    MODULABS gateway, so the audience reads it without being taught it
			    twice. */}
			<div className="seats">
				<span className="role" style={{ gridRow: 1 }}>
					Frontend
				</span>
				<span className="role" style={{ gridRow: 2 }}>
					Backend
				</span>

				{/* The label carries the change as much as the geometry does: the same
				    person, renamed by what he now covers. */}
				{parallel ? (
					<div className="seat filled">
						<span className="seat-title">Full-stack Brandon</span>
						<span className="seat-note">core maintainer of the NestJS service</span>
					</div>
				) : (
					<>
						<div className="seat" style={{ gridRow: 1 }}>
							<span className="seat-title">Frontend Brandon</span>
						</div>
						<div className="seat vacant" style={{ gridRow: 2 }}>
							<span className="seat-title">Unfilled</span>
							<span className="seat-note">a TypeScript service with no one to run it</span>
						</div>
					</>
				)}
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
