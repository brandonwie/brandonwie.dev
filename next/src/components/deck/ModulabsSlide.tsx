'use client';

/**
 * S2 — MODULABS, 2021–2023 (1:00).
 * The React port of `src/routes/talks/my-career/slides/ModulabsSlide.svelte`.
 *
 * One question: what did this codebase look like before, and after.
 *
 * THREE CHANGES, ONE ADVANCE (restructured 2026-07-29 at Brandon's call). The
 * gateway HOC used to own the whole slide, with the TypeScript migration and AUI
 * demoted to text bullets underneath. Both of those are structural changes of the
 * same weight, so all three now get equal visual treatment and swap together on a
 * single advance. Same pattern InfrastructureSlide uses for its four beats.
 *
 * Control — three products each shipped their own user state and routing; a
 * higher-order component took that layer over. Every product kept its own layout,
 * so what converged was CONTROL, not appearance. This is a FRONTEND composition
 * layer, not a backend gateway; getting that wrong in the room invites a question
 * with an awkward correction.
 *
 * Codebase — class-component JavaScript to TypeScript with functional components.
 * The chips carry it as one migration sweeping left to right, which is why the
 * stagger exists: a simultaneous swap would read as a rewrite rather than a
 * migration.
 *
 * Components — per-team UI converging into AUI, the internal Storybook design
 * system. Scattered units settle into alignment inside a frame that appears
 * around them.
 *
 * NO FLIP, NO DOM SWAP for anything animated. Every animated element is in the
 * DOM from first paint and moves only via autoAlpha and transform, so nothing
 * depends on layout measurement and print mode cannot catch a half-built state.
 * The captions are the only thing that swap text, exactly as the old `.state`
 * line did.
 *
 * PORT NOTE (tick): the Svelte original `await tick()`s inside `render()` after
 * assigning `unified`. The port sets `unified` in the same effect that builds
 * the timeline; the tween targets are all in the DOM regardless of `unified`
 * (only caption text depends on it), so the query needs no commit to settle.
 *
 * STRICTMODE. Every set and the one timeline are created inside a
 * `gsap.context()` scoped to the slide root, so the mount cleanup reverts them
 * and the second mount starts clean. The `applied` ref guard makes the
 * double-invoked step effect re-enter safely.
 *
 * DROPPED FROM THE SLIDE 2026-07-29: the JupyterLab-fork TypeScript refactor. It
 * is a fourth item that does not fit a three-change frame, and it is the smallest
 * of the four. Still verified in facts.md § MODULABS and fair game in Q&A.
 *
 * Every claim here has a verified row in facts.md § MODULABS.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import SlideVideo from '@/components/deck/SlideVideo';
import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

// All three call the same AIFFEL APIs. What was shared was never the UI — it
// was user state and routing, which is why the answer was a HOC and not a
// component library. (The component library is the third row.)
const markets = ['B2G', 'B2B', 'B2C'];

// Five is enough to read as "a codebase" without becoming a count the audience
// tries to interpret.
const files = [0, 1, 2, 3, 4];

// Fixed offsets, never random: print mode and a re-render must produce the
// same scatter, or the frozen PDF frame shows a different picture than the
// one that was rehearsed.
const SCATTER = [
	{ x: -13, y: 7, r: -5 },
	{ x: 10, y: -6, r: 4 },
	{ x: -5, y: 9, r: 6 },
	{ x: 15, y: -4, r: -3 },
	{ x: -11, y: -8, r: 5 },
	{ x: 6, y: 6, r: -6 },
	{ x: -8, y: -3, r: 3 },
];

export default function ModulabsSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);

	// This slide's timeline spans ~1.05s — more than twice any other beat,
	// because three segments run in sequence rather than one tween firing.
	// That widens the window where advancing and immediately retreating would
	// leave two timelines writing the same properties until the first one
	// finished, which is a thing rehearsal does constantly. Only `.kill()` is
	// needed off the handle, so it is typed structurally rather than dragging
	// in a GSAP namespace type.
	const running = useRef<{ kill: () => void } | null>(null);
	const videoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [unified, setUnified] = useState(false);
	const [ready, setReady] = useState(false);

	// Held while the three changes run, so only one thing on screen moves.
	const [videoPaused, setVideoPaused] = useState(false);

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
				// Step-0 state, set once. Everything below is already rendered —
				// these only position it, so re-entering step 0 restores rather
				// than rebuilds.
				loaded.gsap.set(element.querySelector('.bar-span'), {
					autoAlpha: 0,
					scaleX: 0.3,
					transformOrigin: 'left center',
				});
				loaded.gsap.set(element.querySelectorAll('.lang-after'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelector('.frame'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelectorAll('.unit'), {
					x: (i: number) => SCATTER[i].x,
					y: (i: number) => SCATTER[i].y,
					rotate: (i: number) => SCATTER[i].r,
				});
				// Only now is it safe to show them — see the `.units` rule.
				loaded.gsap.set(element.querySelector('.units'), { opacity: 1 });
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			running.current?.kill();
			running.current = null;
			if (videoTimer.current) clearTimeout(videoTimer.current);
			context.current?.revert();
			context.current = null;
			applied.current = -1;
		};
	}, []);

	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// Before anything is built. Killing mid-flight leaves elements at their
		// intermediate values, which is correct: the tweens below read current
		// state, so they carry on from wherever the interrupted run got to.
		running.current?.kill();
		if (videoTimer.current) clearTimeout(videoTimer.current);

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = step >= 1;

		setUnified(want);

		if (!still) {
			setVideoPaused(true);
			videoTimer.current = setTimeout(() => setVideoPaused(false), 1250);
		}

		inContext(() => {
			// One timeline, three segments, lightly overlapped. Sequenced rather
			// than simultaneous so the eye is led through them in the order they
			// are narrated; simultaneous would be a flash, not three changes.
			const timeline = loaded.gsap.timeline();
			running.current = timeline;

			// 1 — Control. Three per-product bars give way to one span. The span
			// grows into the width they occupied, so the reduction reads as one
			// motion.
			timeline.to(
				element.querySelectorAll('.bar-own'),
				{ autoAlpha: want ? 0 : 1, duration: DURATION * d, ease: EASE },
				0,
			);
			timeline.to(
				element.querySelector('.bar-span'),
				{
					autoAlpha: want ? 1 : 0,
					scaleX: want ? 1 : 0.3,
					duration: DURATION * d,
					ease: EASE,
				},
				d ? 0.05 : 0,
			);

			// 2 — Codebase. The stagger IS the claim: a migration moving through
			// the files, not an instantaneous rewrite.
			timeline.to(
				element.querySelectorAll('.lang-before'),
				{
					autoAlpha: want ? 0 : 1,
					duration: DURATION * d,
					stagger: 0.05 * d,
					ease: EASE,
				},
				d ? 0.18 : 0,
			);
			timeline.to(
				element.querySelectorAll('.lang-after'),
				{
					autoAlpha: want ? 1 : 0,
					duration: DURATION * d,
					stagger: 0.05 * d,
					ease: EASE,
				},
				d ? 0.21 : 0,
			);

			// 3 — Components. Loose units settle into alignment, then the shared
			// frame appears around them. Frame last: the system is the
			// consequence of the convergence, not the cause of it.
			timeline.to(
				element.querySelectorAll('.unit'),
				{
					x: (i: number) => (want ? 0 : SCATTER[i].x),
					y: (i: number) => (want ? 0 : SCATTER[i].y),
					rotate: (i: number) => (want ? 0 : SCATTER[i].r),
					duration: DURATION * d,
					stagger: 0.04 * d,
					ease: EASE,
				},
				d ? 0.36 : 0,
			);
			timeline.to(
				element.querySelector('.frame'),
				{ autoAlpha: want ? 1 : 0, duration: DURATION * d, ease: EASE },
				d ? 0.52 : 0,
			);
		});
	}, [animate, inContext, ready, step]);

	return (
		<section className="slide modulabs" ref={root}>
			<header>
				<p className="company">MODULABS &middot; 2021 &ndash; 2023</p>
				<h1>Three fixes, none of them a feature</h1>
			</header>

			<div className="body">
				<div className="changes">
					{/* 1 — Control */}
					<div className="change">
						<p className="change-label">Control</p>
						<div className="stage">
							<div className="markets">
								{markets.map((market) => (
									<span className="market" key={market}>
										{market}
									</span>
								))}
							</div>
							<div className="bars">
								{/* Column set inline, per item. Grid auto-placement REFUSES to
								    overlap: an item with a definite row but an auto column, whose
								    columns are already taken by the span, gets pushed into implicit
								    columns 4-6 rather than stacking — which blows the row sideways
								    and is exactly what broke here. Explicitly placed items may share
								    cells, which is what the crossfade needs. */}
								{markets.map((market, i) => (
									<span className="bar bar-own" style={{ gridColumn: i + 1 }} key={market}>
										state &middot; routing
									</span>
								))}
								<span className="bar bar-span">
									Gateway HOC &mdash; user state &middot; route control
								</span>
							</div>
						</div>
						<p className="change-caption">
							{unified
								? 'One HOC. Layouts stay per product.'
								: 'Three copies of state and routing.'}
						</p>
					</div>

					{/* 2 — Codebase */}
					<div className="change">
						<p className="change-label">Codebase</p>
						<div className="stage">
							<div className="chips">
								{files.map((file) => (
									<span className="chip" key={file}>
										<span className="lang lang-before">.js</span>
										<span className="lang lang-after">.ts</span>
									</span>
								))}
							</div>
						</div>
						<p className="change-caption">
							{unified
								? 'TypeScript, functional components. Contracts written down.'
								: "JavaScript, class components. Contracts held in people's heads."}
						</p>
					</div>

					{/* 3 — Components */}
					<div className="change">
						<p className="change-label">Components</p>
						<div className="stage">
							<div className="system">
								<div className="frame" aria-hidden="true" />
								<div className="units">
									{/* Iterating SCATTER only to get its length; the offsets are
									    applied by GSAP, not by markup. */}
									{SCATTER.map((offset, i) => (
										<span className="unit" key={i} />
									))}
								</div>
							</div>
						</div>
						<p className="change-caption">
							{unified
								? 'AUI — one Storybook system, every team.'
								: 'The same components, rebuilt in each product.'}
						</p>
					</div>
				</div>

				{/* The three market labels are abstractions until the audience sees one
				    of the products. This is what "B2G, B2B and B2C" actually shipped
				    as. */}
				<figure className="media">
					<SlideVideo
						src="/talks/my-career/modulabs"
						label="The AIFFEL learning platform: a Python lesson with runnable code blocks"
						paused={videoPaused}
					/>
					<figcaption>AIFFEL &mdash; one of the three products</figcaption>
				</figure>
			</div>
		</section>
	);
}
