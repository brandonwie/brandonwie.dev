'use client';

/**
 * S1 — The arc (0:45).
 * The React port of `src/routes/talks/my-career/slides/ArcSlide.svelte`.
 *
 * The spine of the talk: four companies, one direction. Drawn once so no later
 * slide feels like a detour.
 *
 * Motion carries exactly two facts: the timeline is continuous (the line draws
 * left to right), and each stop added a capability (labels appear beneath).
 * Nothing else moves.
 *
 * PORT NOTE (tick): the Svelte original `await tick()`s inside `render()` before
 * querying. React needs no equivalent — the DOM here is persistent (nothing is
 * conditionally rendered on step), so the post-commit effect already sees the
 * final nodes.
 *
 * PORT NOTE (timeline): the source rebuilds the whole timeline per step; the
 * port kills the prior run first so a rapid advance-then-retreat cannot leave
 * two timelines writing the same properties — the same guard the Modulabs and
 * Moviation sources carry inline.
 *
 * STRICTMODE. Every set and every timeline is created inside a
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

const stops = [
	{ company: 'MODULABS', years: '2021 – 2023', gained: 'Frontend web' },
	{ company: 'Moviation', years: '2023', gained: 'Frontend mobile · web' },
	{ company: 'Playtag', years: '2023 – 2025', gained: 'Full-stack' },
	{ company: 'MOBA', years: '2025 – now', gained: 'Lead backend · Infra' },
];

export default function ArcSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	// Tracks the last rendered step without re-triggering effects.
	const applied = useRef(-1);
	const running = useRef<{ kill: () => void } | null>(null);

	const [ready, setReady] = useState(false);

	/** Everything GSAP touches goes through the slide's context, so one revert
	 *  undoes the whole slide on unmount. */
	const inContext = useCallback((body: () => void) => {
		const ctx = context.current;
		if (ctx) ctx.add(body);
		else body();
	}, []);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const loaded = await loadGsap();
			if (cancelled || !root.current) return;

			bundle.current = loaded;
			context.current = loaded.gsap.context(() => {
				const element = root.current!;
				// Resting state before anything is revealed.
				loaded.gsap.set(element.querySelector('.rail-line'), {
					scaleX: 0,
					transformOrigin: 'left center',
				});
				loaded.gsap.set(element.querySelectorAll('.stop'), { autoAlpha: 0, y: 8 });
				loaded.gsap.set(element.querySelectorAll('.gained'), { autoAlpha: 0, y: 6 });
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			running.current?.kill();
			running.current = null;
			context.current?.revert();
			context.current = null;
			// Not the bundle: the loader memo is module-scoped and shared, and
			// clearing this ref would only force a second await on remount.
			applied.current = -1;
		};
	}, []);

	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// Killing mid-flight leaves elements at their intermediate values, which
		// is correct: the tweens below read current state, so they carry on from
		// wherever the interrupted run got to.
		running.current?.kill();

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;

		inContext(() => {
			const timeline = loaded.gsap.timeline();
			running.current = timeline;

			timeline.to(element.querySelector('.rail-line'), {
				scaleX: 1,
				duration: 0.6 * d,
				ease: EASE,
			});

			timeline.to(
				element.querySelectorAll('.stop'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.08 * d, ease: EASE },
				d ? '-=0.25' : 0,
			);

			// Step 1 reveals what each stop added. Kept separate so the presenter
			// can say the four company names before the capability claim lands.
			timeline.to(
				element.querySelectorAll('.gained'),
				{
					autoAlpha: step >= 1 ? 1 : 0,
					y: step >= 1 ? 0 : 6,
					duration: DURATION * d,
					stagger: 0.06 * d,
					ease: EASE,
				},
				d ? '-=0.2' : 0,
			);
		});
	}, [animate, inContext, ready, step]);

	return (
		<section className="slide arc" ref={root}>
			<h1>Four companies, one direction</h1>

			{/* The rail is CSS, not SVG. An SVG viewBox cannot track a CSS grid's gaps
			    across breakpoints, so the dots drifted away from the labels they mark.
			    Anchoring each dot inside its own grid cell keeps them aligned at every
			    width for free. */}
			<div className="rail">
				<div className="rail-line" aria-hidden="true" />

				<ol className="stops">
					{stops.map((stop) => (
						<li className="stop" key={stop.company}>
							<span className="dot" aria-hidden="true" />
							<span className="company">{stop.company}</span>
							<span className="years">{stop.years}</span>
							<span className="gained">{stop.gained}</span>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
