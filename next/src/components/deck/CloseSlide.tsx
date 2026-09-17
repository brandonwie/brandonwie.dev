'use client';

/**
 * S15 — Close (0:20) · never cut · ONE STEP.
 * The React port of `src/routes/talks/my-career/slides/CloseSlide.svelte`.
 *
 * GENERALIZED 2026-07-29 (Brandon: the deck is for general use now). This slide
 * used to close on the three scope items from one specific role's outreach
 * message — the single most company-locked thing in the deck. The role's scope
 * lives in the private task folder (projects/3b/actives/playtag-interview/).
 *
 * WHAT WAS DELIBERATELY KEPT. The callback to the S1 arc: the same four
 * capability labels returning, complete, with an open fifth node. That is the
 * payoff S1 spends 45 seconds setting up.
 *
 * THE CALLBACK IS THE ARC. Labels 1-4 come back VERBATIM from ArcSlide.
 * Rewording them here breaks the callback — that is the entire reason this
 * slide exists now.
 *
 * THE FIFTH NODE IS DELIBERATELY EMPTY. Its dot is outlined rather than filled
 * and its capability cell is blank. It used to be a setup for the scope rows;
 * now it is the statement itself — the next slot is open, and the presenter
 * names the company out loud rather than the slide naming it. That is what
 * makes this deck reusable without an edit.
 *
 * ONE STEP, because the advance had nothing left to reveal once the scope rows
 * went. Everything arrives in one sequence: the rail draws, then the five nodes
 * stagger in, and the fifth arriving last IS the callback landing.
 *
 * PUBLISH-SAFE: four past employers already on the submitted CV, and no fifth
 * company named anywhere on the slide.
 *
 * PORT NOTE: persistent DOM, one cancellable timeline. `step` stays in Props
 * for the deck signature but is never read — a one-step slide only ever gets 0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

// Labels 1-4 are verbatim from ArcSlide. Do not reword them here.
// The fifth carries no company name on purpose — see the header note.
const stops = [
	{ company: 'MODULABS', years: '2021 – 2023', gained: 'Frontend web', next: false },
	{ company: 'Moviation', years: '2023', gained: 'Frontend mobile · web', next: false },
	{ company: 'Playtag', years: '2023 – 2025', gained: 'Full-stack', next: false },
	{ company: 'MOBA', years: '2025 – now', gained: 'Lead backend · Infra', next: false },
	// The em dash is load-bearing, not decoration: an empty years cell would
	// collapse its line box and lift the fifth capability slot out of line with
	// the other four.
	{ company: 'Next', years: '—', gained: '', next: true },
];

export default function CloseSlide({ animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	const running = useRef<Array<{ kill: () => void }>>([]);

	const [ready, setReady] = useState(false);

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

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const loaded = await loadGsap();
			if (cancelled || !root.current) return;

			bundle.current = loaded;
			context.current = loaded.gsap.context(() => {
				const element = root.current!;
				loaded.gsap.set(element.querySelector('.rail-line'), {
					scaleX: 0,
					transformOrigin: 'left center',
				});
				loaded.gsap.set(element.querySelectorAll('.stop'), { autoAlpha: 0, y: 8 });
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			killRunning();
			context.current?.revert();
			context.current = null;
			applied.current = -1;
		};
	}, [killRunning]);

	useEffect(() => {
		// Single step: the source's `target` exists only to match the shared
		// signature; this slide applies once on arrival.
		if (!ready || applied.current === 0) return;
		applied.current = 0;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		const d = !animate || reducedMotion() ? 0 : 1;

		killRunning();

		inContext(() => {
			const timeline = track(loaded.gsap.timeline());

			timeline.to(element.querySelector('.rail-line'), {
				scaleX: 1,
				duration: 0.6 * d,
				ease: EASE,
			});

			// The fifth node arrives last in the stagger — the callback landing.
			timeline.to(
				element.querySelectorAll('.stop'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.08 * d, ease: EASE },
				d ? '-=0.25' : 0,
			);
		});
	}, [animate, inContext, killRunning, ready, track]);

	return (
		<section className="slide close-slide" ref={root}>
			{/*
				The bookend with S1's "Four companies, one direction" is deliberate and the
				cadence is kept — same sentence, companies become layers. The open fifth
				slot IS this slide's statement, so the clause is added rather than the
				line replaced.
			*/}
			<h1>Four layers, and the next one is open</h1>

			<div className="rail">
				<div className="rail-line" aria-hidden="true" />

				<ol className="stops">
					{stops.map((stop) => (
						<li className={`stop${stop.next ? ' next' : ''}`} key={stop.company}>
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
