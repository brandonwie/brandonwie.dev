import type { Component } from 'svelte';

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
	component: Component<{ step: number; animate: boolean }>;
};
