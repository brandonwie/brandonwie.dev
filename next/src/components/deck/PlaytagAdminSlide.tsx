'use client';

/**
 * S4 — Playtag, 2023–2025 (0:45).
 * The React port of `src/routes/talks/my-career/slides/PlaytagAdminSlide.svelte`.
 *
 * DELIBERATELY THE SHORTEST COMPANY SLIDE. The section is a credibility anchor,
 * not a proof, so depth costs stage time without buying anything. Originally
 * written for a room that had worked with Brandon here, where any wording above
 * what they remembered would have read as overclaiming — but the brevity holds
 * for any audience, because the beat after this one carries the actual turn.
 *
 * The one beat that earns its animation is the TensorFlow.js auto-crop: computer
 * vision shipped into a real operator workflow, and the closest prior art in the
 * deck to applied-AI product work generally. If the room happens to build
 * something adjacent, say so out loud; the slide does not assume it.
 *
 * PORT NOTE (phases): same arrangement as the PushSlide port. The `.stage-swap`
 * node is conditionally rendered, so the step effect only computes `want`/
 * `still` and moves the state; the layout effect that follows the commit sees
 * the fresh `.stage-swap` nodes and plays the source's fromTo cross-fade
 * pre-paint. The reveal-only path (step re-applied with the stage already
 * right) runs the reveals straight from phase 1, exactly where the Svelte
 * original runs them unconditionally after its ticks.
 *
 * STRICTMODE. Every set and tween is created inside a `gsap.context()` scoped
 * to the slide root, so the mount cleanup reverts them and the second mount
 * starts clean. The `applied` ref guard makes the double-invoked phase-1
 * effect re-enter safely.
 *
 * Every line is at CV wording. See facts.md § Playtag, and note C3 in
 * particular: do NOT claim ownership of the Spring repository or service
 * layers, or that the migration removed the yearly class-data reset.
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

// Two flows, same shape: something arrives, an operator used to do the work
// by hand, the result ships. Only the middle stage changes on advance.
const flows = [
	{
		id: 'photos',
		input: 'Photo captured',
		before: { title: 'Manual cropping', note: 'in Figma, one photo at a time' },
		// Short enough not to wrap, and it reads as a direct swap for the line
		// above it: manual cropping becomes automatic cropping.
		after: { title: 'Automatic cropping', note: 'TensorFlow.js face detection' },
		// The tool RETURNS cropped files — it does not upload or publish them.
		// An earlier draft said "Published to parents", which invented a delivery
		// step that never existed (facts.md, 2026-07-26).
		output: 'Cropped images returned',
	},
	{
		id: 'roster',
		input: 'Class roster',
		before: { title: 'Entered one by one', note: 'in the admin CMS' },
		after: { title: 'One spreadsheet upload', note: 'a whole class in a single file' },
		output: 'Teachers and children registered',
	},
];

const notes = [
	'React + Vite admin; Next.js customer web',
	'Prototyped the StoryLine teachers app',
	// Was "Added observability with Sentry logging" — two unfamiliar words in
	// five, and "observability ... logging" says one thing twice.
	'Added Sentry error logging',
	'Led the migration from GitLab to GitHub',
];

export default function PlaytagAdminSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	/** Phase-1 → phase-2 handoff. A ref, not state: writing it must not
	 *  schedule the very render whose commit phase 2 waits for. */
	const handoff = useRef<{ want: boolean; still: boolean } | null>(null);

	const [automated, setAutomated] = useState(false);
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

	// PHASE 1 — decide. Nothing animates here; a stage swap schedules the
	// render whose commit phase 2 waits for, and the stage-already-right path
	// reveals straight away.
	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const want = step >= 1;

		if (want !== automated) {
			handoff.current = { want, still };
			setAutomated(want);
			return;
		}

		runReveals(want, still);
	}, [animate, automated, ready, runReveals, step]);

	// PHASE 2 — post-mutation, pre-paint. The conditional below has just
	// swapped the middle stages; the fromTo cross-fades the fresh nodes in.
	useIsomorphicLayoutEffect(() => {
		const pending = handoff.current;
		if (!pending) return;
		handoff.current = null;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		if (!pending.still) {
			const swapped = element.querySelectorAll('.stage-swap');
			if (swapped.length) {
				inContext(() => {
					loaded.gsap.fromTo(
						swapped,
						{ autoAlpha: 0, scale: 0.94 },
						{ autoAlpha: 1, scale: 1, duration: DURATION, stagger: 0.08, ease: EASE },
					);
				});
			}
		}

		runReveals(pending.want, pending.still);
	}, [inContext, automated, runReveals]);

	return (
		<section className="slide playtag-admin" ref={root}>
			<header>
				<p className="company">Playtag &middot; 2023 &ndash; 2025</p>
				{/*
					NOT "The admin tool operators ran the day on" — descriptive, and its
					definite article assumed the room already knew which tool. It also
					repeated "operators" from the line directly beneath it.

					The `.state` line is gone with it. Every clause in it restated a box
					in the pipeline below — "face detection in the browser" against
					"Automatic cropping / TensorFlow.js face detection", "a whole class in
					one upload" against "One spreadsheet upload", and so on. It was
					scaffolding, not a claim, so nothing in the ledger goes with it.
				*/}
				<h1>Removed the step, not sped it up</h1>
			</header>

			{/* Both flows keep the same three stages; only the middle one changes. The
			    input arrives and the result ships either way — what changed is who
			    does the work in between. */}
			<div className="flows">
				{flows.map((flow) => (
					<div className="pipeline" key={flow.id}>
						<div className="stage">
							<span className="stage-title">{flow.input}</span>
						</div>

						<span className="arrow" aria-hidden="true">
							&rarr;
						</span>

						{automated ? (
							<div className="stage stage-swap is-auto">
								<span className="stage-title">{flow.after.title}</span>
								<span className="stage-note">{flow.after.note}</span>
							</div>
						) : (
							<div className="stage stage-swap">
								<span className="stage-title">{flow.before.title}</span>
								<span className="stage-note">{flow.before.note}</span>
							</div>
						)}

						<span className="arrow" aria-hidden="true">
							&rarr;
						</span>

						<div className="stage">
							<span className="stage-title">{flow.output}</span>
						</div>
					</div>
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
