/**
 * The AccountSeparation slide's decisions and tween arithmetic, as pure
 * functions of their inputs.
 *
 * WHY THIS FILE EXISTS. The Svelte original keeps all of this inline in
 * `render()` (`AccountSeparationSlide.svelte:61-108`), where it is reachable
 * only by driving a real GSAP timeline in a real browser. Two of the three
 * things a port of it can get silently wrong are arithmetic:
 *
 *   1. The `d` factor. `d` is `0` under reduced motion and `1` otherwise, and
 *      it multiplies EVERY duration, stagger and delay. Dropping it from one
 *      of the eleven places it appears leaves a slide that still animates,
 *      still looks right to the porter, and ignores the OS setting on exactly
 *      one of its three reveals.
 *   2. The delay ladder. `.second` at `DURATION * 0.8`, `.chip` at
 *      `DURATION * 1.05`, `.note` at `DURATION * 1.3` is the sequencing that
 *      makes the slide read as one move followed by its consequences. Any of
 *      the three transcribed a step out of order still plays; it just stops
 *      arguing what it was written to argue.
 *
 * Extracted, both are checkable against an independently written expectation
 * with no browser and no GSAP — which is what `scripts/assert-slice2-gsap-
 * palette.ts` group T does.
 *
 * The third thing a port can get wrong is ORDERING — capturing the Flip state
 * after the DOM already moved. That is NOT in this file, because it is not a
 * value: it is which React lifecycle phase the capture runs in. `planStep`
 * names the phase, and the component is what honors it; see the "What is not
 * proven" section of the contract.
 */

import { DURATION, EASE } from './gsap';

export interface SlideStepInput {
	/** The step the deck is on. */
	step: number;
	/** The last step `render` ran for; `-1` before the first. */
	applied: number;
	/** GSAP loaded and the initial `set` calls applied. */
	ready: boolean;
	/** The separated/nested state currently rendered. */
	separated: boolean;
	/** The slide's `animate` prop. */
	animate: boolean;
	/** `prefers-reduced-motion: reduce`. */
	reduced: boolean;
}

export type SlidePlan =
	/** Nothing to do; `reason` distinguishes the two guards for the R rows. */
	| { kind: 'skip'; reason: 'not-ready' | 'already-applied' }
	/**
	 * The nesting changes. `capture` says whether a Flip state must be taken
	 * BEFORE the DOM mutation, and `want` is the state to move to.
	 */
	| { kind: 'toggle'; want: boolean; still: boolean; capture: boolean }
	/** The nesting is already right; only the reveals run. */
	| { kind: 'reveal'; want: boolean; still: boolean };

/**
 * Mirrors `render()`'s first eight lines plus the `$effect` guard above it.
 *
 * The `applied` guard is load-bearing under React in a way it is not under
 * Svelte: an effect that re-runs for an unchanged `step` would re-enter the
 * whole sequence, and in StrictMode development every effect runs twice by
 * construction. Svelte's `$effect` has the same guard for the same reason,
 * which is why this is a port of an existing check and not a new one.
 */
export function planStep(input: SlideStepInput): SlidePlan {
	if (!input.ready) return { kind: 'skip', reason: 'not-ready' };
	if (input.step === input.applied) return { kind: 'skip', reason: 'already-applied' };

	const still = !input.animate || input.reduced;
	const want = input.step >= 1;

	if (want !== input.separated) {
		// `still ? null : Flip.getState(...)` in the original: a still slide takes
		// no state, so there is nothing to play from.
		return { kind: 'toggle', want, still, capture: !still };
	}

	return { kind: 'reveal', want, still };
}

/** One `gsap.to` call, as data. `selector` is scoped to the slide root. */
export interface TweenSpec {
	selector: string;
	vars: {
		autoAlpha: number;
		y?: number;
		duration: number;
		stagger?: number;
		ease: string;
		delay: number;
	};
}

/**
 * The three reveals, in the order the original issues them.
 *
 * `d` is the reduced-motion collapse factor: every duration, stagger and delay
 * is multiplied by it, so a still slide lands on its end state in one frame
 * rather than skipping the tween. `autoAlpha` and `y` are NOT multiplied —
 * they are the destination, not the travel.
 */
export function revealTweens(want: boolean, still: boolean): TweenSpec[] {
	const d = still ? 0 : 1;
	const alpha = want ? 1 : 0;

	return [
		{
			selector: '.second',
			vars: {
				autoAlpha: alpha,
				duration: DURATION * d,
				ease: EASE,
				delay: want ? DURATION * 0.8 * d : 0,
			},
		},
		{
			selector: '.chip',
			vars: {
				autoAlpha: alpha,
				duration: DURATION * 0.8 * d,
				stagger: 0.06 * d,
				ease: EASE,
				delay: want ? DURATION * 1.05 * d : 0,
			},
		},
		{
			selector: '.note',
			vars: {
				autoAlpha: alpha,
				y: want ? 0 : 6,
				duration: DURATION * d,
				stagger: 0.07 * d,
				ease: EASE,
				delay: want ? DURATION * 1.3 * d : 0,
			},
		},
	];
}

/**
 * The `onMount` starting state. Chips, the second account and the notes are
 * hidden before the first reveal; the notes also start 6px low so their entry
 * has somewhere to travel from.
 */
export function initialSets(): { selector: string; vars: { autoAlpha: number; y?: number } }[] {
	return [
		{ selector: '.note', vars: { autoAlpha: 0, y: 6 } },
		{ selector: '.chip, .second', vars: { autoAlpha: 0 } },
	];
}

/** Flip's own options, shared so the component and the harness read one source. */
export const FLIP_OPTIONS = { duration: DURATION, ease: EASE, absolute: true } as const;
