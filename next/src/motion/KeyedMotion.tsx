'use client';

import { Component, createRef, type ReactNode } from 'react';

import {
	fadeConfig,
	flipConfig,
	sampleKeyframes,
	scaleConfig,
	type FlipMetrics,
	type MotionBox,
	type MotionConfig,
	type TransitionMetrics,
} from './svelte-motion';

/**
 * The React side of `animate:flip` and `in:` on a keyed list.
 *
 * WHAT SVELTE DOES THAT REACT DOES NOT. In a keyed `{#each}`, Svelte knows
 * which children survived an update, which are new, and where each survivor
 * used to be — so `animate:flip` and `in:scale` are one word each at the call
 * site. React re-renders and tells nobody. This component rebuilds that
 * knowledge the only way it can be rebuilt: measure the marked children on
 * both sides of the DOM mutation, and compare.
 *
 * WHY A CLASS, IN A CODEBASE OF FUNCTION COMPONENTS. `getSnapshotBeforeUpdate`
 * is the only React API that runs AFTER the render and BEFORE the DOM is
 * mutated, which is precisely where FLIP's "First" measurement has to happen.
 * An earlier revision measured in `useLayoutEffect` instead and kept the boxes
 * until the next commit — so the `from` rect could be minutes old, taken at a
 * different scroll offset. Scroll the page, press Insert, and every surviving
 * node animated in from the scroll delta: a slide Svelte never performs,
 * because `measure()` and `apply()` run in the same frame
 * (`svelte/src/internal/client/dom/elements/transitions.js`, `nodes.a`).
 *
 * THE CONTRACT, in the same terms Svelte states it:
 *   - a key present before and after an update is a SURVIVOR -> flip, from its
 *     old box to its new one
 *   - a key present only after is an ENTRY -> the named intro transition
 *   - the initial MOUNT animates nothing. Svelte does not play intros for
 *     items that exist at first render unless the tree is mounted with
 *     `intro: true`, and neither hydration nor SvelteKit's client mount does
 *     that. Playing them would be a visible change on every first paint.
 *
 * ORDER OF OPERATIONS, copied from Svelte rather than invented. `from` is
 * measured while any previous animation is still running, so an interrupted
 * flip starts from where the element visually IS. The abort happens after
 * that, before `to` is measured and before `getComputedStyle` is read, so the
 * "Last" measurement and the transform it is composed onto are both clean.
 * Svelte's `apply()` opens with `animation?.abort()` for exactly this reason,
 * and without it a second update inside the animation window measures a
 * transform-contaminated rect and feeds it forward as the next `from`.
 *
 * HOW A CHILD OPTS IN. Attributes, not props, because the elements are written
 * by the visualizer and read from here, and threading refs for every list item
 * through both would be a second bookkeeping problem:
 *   data-motion-key    required; unique within this container
 *   data-motion-flip   flip duration in ms; absent or "0" means no flip
 *   data-motion-enter  "fade:120" or "scale:160" — transition and duration
 *
 * WHERE REDUCED MOTION LIVES. Nowhere in here. The durations arrive in those
 * attributes already resolved by the component, which is exactly where the
 * Svelte original resolves them — `duration: motion.current ? 0 : 220` is
 * written in the template. A zero duration plays nothing.
 *
 * WHAT THIS DELIBERATELY DOES NOT REPRODUCE.
 *   - Outros. Neither ported visualizer uses `out:`, and honouring one means
 *     holding removed nodes in the DOM past their React unmount — real work,
 *     and unpriced, so it is absent rather than half-present.
 *   - Per-block key scoping. Svelte's keys are scoped to one `{#each}`; these
 *     are scoped to one container. A key that moved between two sibling keyed
 *     lists inside the same container would flip here and re-enter in Svelte.
 *     Neither ported visualizer has two keyed lists in one container, but the
 *     next one to use this component must not.
 */

const NO_ANIMATION_API = typeof Element === 'undefined' || !('animate' in Element.prototype);

function boxOf(element: Element): MotionBox {
	const rect = element.getBoundingClientRect();
	return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** Svelte's `get_zoom`, ported: `currentCSSZoom` when present, else the product up the tree. */
function zoomOf(element: Element): number {
	// Read through a narrower type than `Element`: the DOM lib now declares
	// `currentCSSZoom`, so an `in` check would narrow the fallback to `never`
	// and delete Svelte's parent-walk from the port.
	const own = (element as { currentCSSZoom?: number }).currentCSSZoom;
	if (typeof own === 'number') return own;
	let current: Element | null = element;
	let zoom = 1;
	while (current !== null) {
		zoom *= Number(getComputedStyle(current).zoom);
		current = current.parentElement;
	}
	return zoom;
}

function flipMetricsOf(element: HTMLElement): FlipMetrics {
	const style = getComputedStyle(element);
	return {
		clientWidth: element.clientWidth,
		clientHeight: element.clientHeight,
		transform: style.transform,
		transformOrigin: style.transformOrigin,
		zoom: zoomOf(element),
	};
}

function transitionMetricsOf(element: HTMLElement): TransitionMetrics {
	const style = getComputedStyle(element);
	return { opacity: Number(style.opacity), transform: style.transform };
}

/**
 * A flip whose element did not move is skipped.
 *
 * This is parity, not an optimisation: Svelte guards the same case, running
 * the animation only when `from.left !== to.left || from.right !== to.right ||
 * from.top !== to.top || from.bottom !== to.bottom`. The check here is written
 * against the numbers the formula produced rather than against the raw rects,
 * so a change to the formula cannot slip past it.
 */
function isIdentity(config: MotionConfig): boolean {
	return config.css(0, 1) === config.css(1, 0);
}

/**
 * What this decided to do with one element, as a value.
 *
 * The decisions — flip or entry, is the duration real, did the box actually
 * move — are the part worth checking, and checking them through a browser
 * would mean not checking them. So they are a pure function of the element's
 * attributes and its two boxes, and the component does nothing but measure,
 * call these, and hand the result to the Web Animations API.
 */
export type MotionPlan =
	{ kind: 'none'; why: string } | { kind: 'flip' | 'enter'; config: MotionConfig };

export interface MotionAttributes {
	/** `data-motion-flip` — flip duration in ms. */
	flip?: string;
	/** `data-motion-enter` — `"fade:120"` or `"scale:160"`. */
	enter?: string;
}

export function planFlip(
	attributes: MotionAttributes,
	metrics: FlipMetrics,
	from: MotionBox,
	to: MotionBox,
): MotionPlan {
	const duration = Number(attributes.flip ?? 0);
	if (!Number.isFinite(duration) || duration <= 0) return { kind: 'none', why: 'no flip duration' };
	const config = flipConfig(metrics, from, to, { duration });
	if (isIdentity(config)) return { kind: 'none', why: 'identity transform' };
	return { kind: 'flip', config };
}

export function planEnter(attributes: MotionAttributes, metrics: TransitionMetrics): MotionPlan {
	const spec = attributes.enter;
	if (!spec) return { kind: 'none', why: 'no intro declared' };
	const [kind, rawDuration] = spec.split(':');
	const duration = Number(rawDuration);
	if (!Number.isFinite(duration) || duration <= 0)
		return { kind: 'none', why: 'no intro duration' };
	if (kind === 'fade') return { kind: 'enter', config: fadeConfig(metrics, { duration }) };
	if (kind === 'scale') return { kind: 'enter', config: scaleConfig(metrics, { duration }) };
	return { kind: 'none', why: `unknown intro "${kind}"` };
}

export interface KeyedMotionProps {
	className?: string;
	children: ReactNode;
}

export class KeyedMotion extends Component<KeyedMotionProps> {
	private host = createRef<HTMLDivElement>();
	/** In-flight animations, so the next update can abort them as Svelte does. */
	private running = new Map<string, Animation>();

	private marked(): HTMLElement[] {
		const root = this.host.current;
		if (!root || NO_ANIMATION_API) return [];
		return Array.from(root.querySelectorAll<HTMLElement>('[data-motion-key]'));
	}

	/** "First": the pre-mutation boxes, measured in the same frame as "Last". */
	getSnapshotBeforeUpdate(): Map<string, MotionBox> | null {
		const boxes = new Map<string, MotionBox>();
		for (const element of this.marked()) {
			const key = element.dataset.motionKey;
			if (key !== undefined) boxes.set(key, boxOf(element));
		}
		return boxes;
	}

	componentDidUpdate(
		_previousProps: KeyedMotionProps,
		_previousState: unknown,
		before: Map<string, MotionBox> | null,
	): void {
		if (before === null) return;

		// Abort first, exactly as Svelte's `apply()` does: `to` and the computed
		// transform must not carry a previous animation's applied styles.
		for (const animation of this.running.values()) animation.cancel();
		this.running.clear();

		for (const element of this.marked()) {
			const key = element.dataset.motionKey;
			if (key === undefined) continue;
			const attributes: MotionAttributes = {
				flip: element.dataset.motionFlip,
				enter: element.dataset.motionEnter,
			};
			const previousBox = before.get(key);
			const plan = previousBox
				? planFlip(attributes, flipMetricsOf(element), previousBox, boxOf(element))
				: planEnter(attributes, transitionMetricsOf(element));
			if (plan.kind === 'none') continue;
			// `fill: 'forwards'` matches Svelte's own animate() call. It is only
			// safe because of the abort above — without it the held final frame
			// would be read back as this element's transform next time round.
			const animation = element.animate(sampleKeyframes(plan.config), {
				duration: plan.config.duration,
				delay: plan.config.delay,
				easing: 'linear',
				fill: 'forwards',
			});
			this.running.set(key, animation);
		}
	}

	componentWillUnmount(): void {
		for (const animation of this.running.values()) animation.cancel();
		this.running.clear();
	}

	render(): ReactNode {
		return (
			<div ref={this.host} className={this.props.className}>
				{this.props.children}
			</div>
		);
	}
}
