import type { Component } from 'svelte';

/**
 * One beat of a talk.
 *
 * `steps` is what lets a single architecture diagram morph through several
 * states instead of becoming several near-identical slides. The slide body
 * receives the current step and animates itself; the deck never reaches inside.
 */
export type DeckSlide = {
	/** Stable id, used for the progress rail and future deep links. */
	id: string;
	/** Short label shown in the progress rail. */
	label: string;
	/** Number of discrete states within this slide. Defaults to 1. */
	steps?: number;
	/** Slide body. Receives `step` and `animate`. */
	component: Component<{ step: number; animate: boolean }>;
};
