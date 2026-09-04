import type { Metadata } from 'next';

import DeckSpike from '@/components/deck/DeckSpike';

/**
 * Slice 2 GSAP-slide spike route — scaffolding, deleted at Slice 4.
 *
 * WHY A SPIKE ROUTE AND NOT `/talks/my-career`. The real deck route mounts a
 * sixteen-slide runtime with its own keyboard navigation, print mode and
 * video; `behavior-matrix.md` assigns all of it to Slice 4. Shipping it now
 * would pull twenty slides and the deck runtime forward to host the one slide
 * this PR exists to price.
 *
 * WHY THIS SLIDE. Five of the twenty slides use GSAP's `Flip`, and `Flip` is
 * the only part of the deck whose port is not a transcription: the Svelte code
 * captures `Flip.getState()` and then awaits `tick()` so the capture is
 * guaranteed to precede the DOM change, and React has no `tick()` in that
 * position. `AccountSeparationSlide` is 356 lines against a 335-line cohort
 * mean, so it exercises the hard part at close to the average size — calibrat-
 * ing on `TitleSlide` (101 lines, no Flip) would have flattered the rate.
 *
 * WHY IT IS LEDGERED AND NOT SKIPPED. Same reason as the study and mermaid
 * fixtures: a skip hides pages from the comparator, a ledger entry is visible
 * and goes stale the moment Slice 4 deletes the route.
 */
export const metadata: Metadata = {
	title: 'Slice 2 deck spike',
	description: 'Slice 2 verification fixture: one GSAP Flip slide from the talk deck.',
	robots: { index: false, follow: false },
};

export default function DeckSpikePage() {
	return (
		<main>
			<h1>Slice 2 deck spike</h1>
			<DeckSpike />
		</main>
	);
}
