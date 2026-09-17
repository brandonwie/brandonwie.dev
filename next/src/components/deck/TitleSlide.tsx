'use client';

/**
 * S0 — Title (0:15) · never cut.
 * The React port of `src/routes/talks/my-career/slides/TitleSlide.svelte`.
 *
 * Name and one thesis line. Nothing else; the presenter says the rest.
 *
 * THE HEADLINE ADDRESSES THE ROOM, NOT A COMPANY (Brandon, 2026-07-29). It named
 * the employer directly, which pinned the first sentence of the deck to one
 * audience and made the whole thing single-use. "to you" says the same thing to
 * whoever is sitting there, so this deck can be walked again without an edit.
 * It also lands better spoken: it is addressed to the people in the room rather
 * than to their company name.
 *
 * The headline leads with the destination rather than repeating S1's "Four
 * companies, one direction" verbatim two slides running. It is a claim about
 * fit, not a claim of past credit, so it does not trip the downward-correction
 * rule the earlier sections went through.
 *
 * NO SplitText. The storyboard asked for a SplitText line reveal, but SplitText
 * is a Club GreenSock plugin and gsap.ts registers only Flip and DrawSVG.
 * Licensing a plugin the day before the talk buys nothing a per-line stagger
 * does not already read as at this size.
 *
 * steps: 1 — a title slide has no transition to make. `step` stays in the
 * Props contract (the DeckSlide shape requires it) but is never read.
 *
 * STRICTMODE. Every set and tween is created inside a `gsap.context()` scoped
 * to the slide root, so the mount cleanup reverts them and the second mount
 * starts clean.
 *
 * PUBLISH-SAFE: a name and a sentence. Nothing to scrub.
 */

import { useEffect, useRef } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

interface Props {
	step?: number;
	animate?: boolean;
}

export default function TitleSlide({ animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		/** Everything GSAP touches goes through the slide's context, so one
		 *  revert undoes the whole slide on unmount. */
		let context: { revert: () => void } | null = null;

		void (async () => {
			const { gsap } = await loadGsap();
			if (cancelled || !root.current) return;

			context = gsap.context(() => {
				const lines = root.current!.querySelectorAll('.reveal');
				const d = !animate || reducedMotion() ? 0 : 1;

				gsap.set(lines, { autoAlpha: 0, y: 10 });
				gsap.to(lines, {
					autoAlpha: 1,
					y: 0,
					duration: DURATION * d,
					stagger: 0.1 * d,
					ease: EASE,
				});
			}, root);
		})();

		return () => {
			cancelled = true;
			context?.revert();
		};
	}, [animate]);

	return (
		<section className="slide title" ref={root}>
			<p className="who reveal">Seokhyun Wie</p>
			<h1 className="reveal">The layer I'd bring to you</h1>
			<p className="thesis reveal">
				Frontend to full-stack to backend to infrastructure &mdash; four companies, one direction.
			</p>
		</section>
	);
}
