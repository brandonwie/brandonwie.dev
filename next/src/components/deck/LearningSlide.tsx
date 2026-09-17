'use client';

/**
 * S16 — Never stopped learning (0:30) · cut-1 · ONE STEP.
 * The React port of `src/routes/talks/my-career/slides/LearningSlide.svelte`.
 *
 * Added 2026-07-29 at Brandon's request. The claim is NOT "I study" — every
 * candidate says that. The claim is that all six credentials were earned
 * INSIDE the MOBA period (joined Mar 2025), while leading backend and shipping
 * the sync engine the previous nine slides described. Every row carries a
 * date: the dates are what make the claim falsifiable.
 *
 * EVERY ROW HAS A VERIFIED LEDGER ENTRY. facts.md § Continuous learning while
 * at MOBA. The AWS AI Practitioner is on neither the submitted CV nor
 * LinkedIn — the exam was passed 2026-07-24 and the CV went out on the 22nd.
 * Verified against personal/goals/aws-ai-practitioner.md:19.
 *
 * SAY "PASSED THE EXAM", NOT A CREDENTIAL ID, for the AI Practitioner — the
 * credential is still pending issue, so the date on the slide is the honest
 * form.
 *
 * NO COURSE CODES. The CV writes these as CS1332xI–xIV — an edX/Georgia Tech
 * catalogue identifier, the class of thing removed from S13. "Data Structures
 * & Algorithms I through IV" is the same information without the decoder ring.
 *
 * OMSCS IS DELIBERATELY ABSENT. The four courses are OMSCS prerequisites —
 * announcing a Master's plan mid-interview raises a future-availability
 * question this slide is not the place to open. Off-slide by default; honest
 * if asked.
 *
 * REVEAL ONLY, NO DEPICTIVE MOTION. Nothing structural changes — it is a list
 * and then the reading of the list, so there is no Flip, no draw, no scale.
 *
 * PUBLISH-SAFE: Brandon's own credentials and public course names. Nothing
 * employer-internal.
 *
 * PORT NOTE: persistent DOM, one cancellable timeline. `step` stays in Props
 * for the deck signature but is never read — a one-step slide only ever gets
 * 0, and the staggered order does the work an advance used to do.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

// Dates are load-bearing, not decoration: they are what places every row
// inside the MOBA period and makes the headline checkable.
const certifications = [
	{ name: 'AWS Certified Cloud Practitioner', when: 'Sep 2025' },
	{ name: 'AWS Certified AI Practitioner', when: 'Jul 2026' },
];

const coursework = [
	{ name: 'Data Structures & Algorithms I', when: 'Apr 2026' },
	{ name: 'Data Structures & Algorithms II', when: 'May 2026' },
	{ name: 'Data Structures & Algorithms III', when: 'Jul 2026' },
	{ name: 'Data Structures & Algorithms IV', when: 'Jul 2026' },
];

export default function LearningSlide({ animate = true }: Props) {
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
				// Step-0 resting state. Everything is in the DOM from first paint;
				// these only hide it, so returning restores rather than rebuilds.
				loaded.gsap.set(element.querySelectorAll('.item'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelectorAll('.group-label'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelector('.point'), { autoAlpha: 0, y: 8 });
				loaded.gsap.set(element.querySelector('.detail'), { autoAlpha: 0, y: 6 });
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
		// Single step (changed 2026-07-29 at Brandon's instruction). Nothing is
		// gated on `step`: the whole slide arrives in one sequence on arrival —
		// labels, then the rows under them, then the reading of the list.
		if (!ready || applied.current === 0) return;
		applied.current = 0;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		const d = !animate || reducedMotion() ? 0 : 1;

		killRunning();

		inContext(() => {
			const timeline = track(loaded.gsap.timeline());

			// Labels first, so the two groups are distinguishable before rows
			// start arriving under them.
			timeline.to(element.querySelectorAll('.group-label'), {
				autoAlpha: 1,
				duration: DURATION * d,
				stagger: 0.06 * d,
				ease: EASE,
			});

			timeline.to(
				element.querySelectorAll('.item'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.05 * d, ease: EASE },
				d ? '-=0.3' : 0,
			);

			// The reading of it. The list alone invites "so you collect
			// certificates"; these two lines are the answer, and they arrive
			// last so the room has read the evidence first.
			timeline.to(
				element.querySelector('.point'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, ease: EASE },
				d ? '-=0.05' : 0,
			);

			timeline.to(
				element.querySelector('.detail'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, ease: EASE },
				d ? '-=0.25' : 0,
			);
		});
	}, [animate, inContext, killRunning, ready, track]);

	return (
		<section className="slide learning" ref={root}>
			<header>
				<p className="company">MOBA &middot; 2025 &ndash; now</p>
				{/*
					NOT "Six credentials, all while leading backend" — that headline was a
					caption for its own table. The promoted body line is the only
					falsifiable version, and "credentials" also stretched (four of the
					six are courses).
				*/}
				<h1>None of it happened between jobs</h1>
			</header>

			<div className="groups">
				<div className="group">
					<p className="group-label">Certifications</p>
					<ul className="items">
						{certifications.map((row) => (
							<li className="item" key={row.name}>
								<span className="name">{row.name}</span>
								<span className="when">{row.when}</span>
							</li>
						))}
					</ul>
				</div>

				<div className="group">
					<p className="group-label">Georgia Tech, via edX</p>
					<ul className="items">
						{coursework.map((row) => (
							<li className="item" key={row.name}>
								<span className="name">{row.name}</span>
								<span className="when">{row.when}</span>
							</li>
						))}
					</ul>
				</div>
			</div>

			<p className="point">Both certificates came out of the work in this talk.</p>

			<p className="detail">
				AWS on the infrastructure, AI on the data work. The four courses were fundamentals, not
				frameworks.
			</p>
		</section>
	);
}
