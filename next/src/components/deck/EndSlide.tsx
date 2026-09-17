'use client';

/**
 * S17 — FINE (0:10) · never cut · ONE STEP.
 * The React port of `src/routes/talks/my-career/slides/EndSlide.svelte`.
 *
 * Added 2026-07-29 at Brandon's request: an end card with a thank-you to the
 * room.
 *
 * "FINE" IS SPELLED THAT WAY ON PURPOSE. It is the Italian end title — the
 * card that closes the film — and Brandon's degree is a B.A. in Theater &
 * Film, Film Directing (Hanyang University; on the submitted CV). Left exactly
 * as he wrote it. Do NOT "correct" it to FIN, THE END, or anything else.
 *
 * IT IS ALSO THE SLIDE THAT STAYS UP THROUGH Q&A — on screen longer than any
 * other beat, which is why it carries the invitation to ask and must look
 * composed rather than busy. Nothing moves after it lands.
 *
 * PRICED AT 0:10, NOT 0:00. "thank you — happy to take questions" is a spoken
 * sentence; a card is not free just because it is small.
 *
 * PUBLISH-SAFE: a name and a thank-you. Nothing else on it.
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

export default function EndSlide({ animate = true }: Props) {
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
				loaded.gsap.set(element.querySelector('.fine'), { autoAlpha: 0, y: 10 });
				loaded.gsap.set(element.querySelectorAll('.line'), { autoAlpha: 0, y: 6 });
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
		// signature; this card applies once on arrival.
		if (!ready || applied.current === 0) return;
		applied.current = 0;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		const d = !animate || reducedMotion() ? 0 : 1;

		killRunning();

		inContext(() => {
			const timeline = track(loaded.gsap.timeline());

			// The card sets, then the thanks. Slower than the deck default —
			// this is the one place where arriving unhurried is the point.
			timeline.to(element.querySelector('.fine'), {
				autoAlpha: 1,
				y: 0,
				duration: DURATION * 1.3 * d,
				ease: EASE,
			});

			timeline.to(
				element.querySelectorAll('.line'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.12 * d, ease: EASE },
				d ? '-=0.15' : 0,
			);
		});
	}, [animate, inContext, killRunning, ready, track]);

	return (
		<section className="slide end-slide" ref={root}>
			<p className="fine">FINE</p>

			<p className="line thanks">Thank you for your time.</p>
			<p className="line ask">Happy to take questions.</p>

			<p className="line who">Seokhyun Wie</p>
		</section>
	);
}
