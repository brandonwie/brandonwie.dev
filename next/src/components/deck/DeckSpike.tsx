'use client';

/**
 * Spike host for the GSAP slide. Scaffolding: Slice 4 deletes it along with
 * the route.
 *
 * The real deck (`src/lib/components/deck/Deck.svelte`) owns step state,
 * keyboard navigation, a print mode and sixteen slides. None of that is
 * ported here — Slice 2 buys a per-component cost for ONE slide, and hosting
 * it behind two buttons is enough to drive every branch the slide has. The
 * deck runtime itself is `impl.deck` and stays assigned to Slice 4.
 *
 * The `--deck-*` type scale lives on `.deck` in the real deck's scoped styles,
 * so the wrapper below carries the same class name and `globals.css` defines
 * the variables on it.
 */

import { useState } from 'react';

import AccountSeparationSlide from '@/components/deck/AccountSeparationSlide';

const LAST_STEP = 1;

export default function DeckSpike() {
	const [step, setStep] = useState(0);

	return (
		<div className="deck-spike deck">
			<div className="deck-spike__controls">
				<button
					className="study-btn"
					type="button"
					onClick={() => setStep((value) => Math.max(0, value - 1))}
				>
					← Previous
				</button>
				<button
					className="study-btn"
					type="button"
					onClick={() => setStep((value) => Math.min(LAST_STEP, value + 1))}
				>
					Next →
				</button>
				<button className="study-btn" type="button" onClick={() => setStep(0)}>
					↺ Reset
				</button>
				<span className="deck-spike__step" data-deck-step={step}>
					{step + 1}/{LAST_STEP + 1}
				</span>
			</div>

			<div className="deck-spike__stage">
				<AccountSeparationSlide step={step} />
			</div>
		</div>
	);
}
