'use client';

import type { StepperCopy } from '../../data/study';

/**
 * Previous / next / reset control row shared by twelve study visualizers.
 *
 * PORT NOTE — `$bindable` becomes a controlled component. The Svelte original
 * declares `step = $bindable(0)` and writes to it directly, so each call site
 * spells `bind:step` and owns nothing else. React has no two-way binding, so
 * the value comes down as `step` and the intent goes up as `onStepChange`.
 *
 * WHY THE CLAMPS STAY HERE. They could move to the caller, and each of the
 * twelve callers would then re-implement `Math.max(0, …)` and
 * `Math.min(length - 1, …)`. Keeping them inside preserves the original's
 * contract — the parent receives a step that is already in range — so the port
 * is one component's shape change rather than twelve components' logic change.
 *
 * `onStepChange` is called with the clamped value even when it equals the
 * current step (pressing Previous at zero). That matches the Svelte version,
 * where the assignment happens unconditionally and Svelte's own equality check
 * decides whether anything re-renders.
 */
export interface StepperProps {
	length: number;
	step: number;
	onStepChange: (step: number) => void;
	labels: StepperCopy;
}

export default function Stepper({ length, step, onStepChange, labels }: StepperProps) {
	const previous = () => onStepChange(Math.max(0, step - 1));
	const next = () => onStepChange(Math.min(length - 1, step + 1));
	const reset = () => onStepChange(0);

	return (
		<div className="mt-4 flex gap-2">
			<button
				className="study-btn"
				type="button"
				onClick={previous}
				aria-label={labels.previousAriaLabel}
			>
				← {labels.previousLabel}
			</button>
			<button className="study-btn" type="button" onClick={next} aria-label={labels.nextAriaLabel}>
				{labels.nextLabel} →
			</button>
			<button
				className="study-btn"
				type="button"
				onClick={reset}
				aria-label={labels.resetAriaLabel}
			>
				↺ {labels.resetLabel}
			</button>
		</div>
	);
}
