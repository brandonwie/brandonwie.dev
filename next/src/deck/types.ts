import type { ComponentType } from 'react';

/**
 * One beat of a talk — the React side of
 * `src/lib/components/deck/types.ts`.
 *
 * WHAT CHANGED: `Component<{step, animate}>` (Svelte) becomes
 * `ComponentType<{step, animate}>` (React). No runtime code; the union,
 * the comments, and the deck-never-reaches-inside contract are unchanged.
 */

/**
 * One beat of a talk.
 *
 * `steps` is what lets a single architecture diagram morph between states
 * instead of becoming two near-identical slides. The slide body receives the
 * current step and animates itself; the deck never reaches inside.
 */
export type DeckSlide = {
	/** Stable id, used for the progress rail and deep links. */
	id: string;
	/** Short label shown in the progress rail. */
	label: string;
	/**
	 * Before and after — never more.
	 *
	 * A slide answers one question, so it gets one transition. Anything that
	 * needs a third state is really two slides, or it is choreography that
	 * belongs inside the single advance (stagger and delay, not another step).
	 *
	 * Typed as a union rather than documented as a convention, because a third
	 * step is easy to add under deadline and hard to notice in review.
	 */
	steps?: 1 | 2;
	/** Slide body. Receives `step` and `animate`. */
	component: ComponentType<{ step: number; animate: boolean }>;
};
