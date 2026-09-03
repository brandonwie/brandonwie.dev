'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

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
 * site. React re-renders and tells nobody. This hook rebuilds that knowledge
 * the only way it can be rebuilt: measure the marked children after every
 * commit, and compare against the measurements from the previous commit.
 *
 * THE CONTRACT, in the same terms Svelte states it:
 *   - a key seen in the previous pass and this one is a SURVIVOR -> flip, from
 *     its old box to its new one
 *   - a key seen only in this pass is an ENTRY -> the named intro transition
 *   - the FIRST pass animates nothing. Svelte does not play intros for items
 *     that exist at initial mount unless the tree is mounted with `intro: true`,
 *     and neither hydration nor a client-side mount does that here. Playing them
 *     would be a visible behavior change on every first paint.
 *
 * HOW A CHILD OPTS IN. Attributes, not props, because the elements are written
 * by the visualizer and read by the hook, and threading refs for every list
 * item through both would be a second bookkeeping problem:
 *   data-motion-key    required; unique within the container
 *   data-motion-flip   flip duration in ms; absent or "0" means no flip
 *   data-motion-enter  "fade:120" or "scale:160" — transition and duration
 *
 * WHERE REDUCED MOTION LIVES. Nowhere in this hook. The durations arrive in
 * those attributes already resolved by the component, which is exactly where
 * the Svelte original resolves them — `duration: motion.current ? 0 : 220` is
 * written in the template. A zero duration plays nothing.
 *
 * WHAT THIS DELIBERATELY DOES NOT REPRODUCE. Outros. Neither ported visualizer
 * uses `out:`, and honouring one would mean holding removed nodes in the DOM
 * past their React unmount — real work, and unpriced work, so it is absent
 * rather than half-present.
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
 * An identity flip is skipped rather than played.
 *
 * A survivor whose box did not move produces `translate(0px, 0px) scale(1, 1)`
 * for every frame — Svelte runs that animation, this does not, and no frame
 * differs. The check is written against the numbers the formula produced, not
 * against the raw rects, so a change to the formula cannot slip past it.
 */
function isIdentity(config: MotionConfig): boolean {
	return config.css(0, 1) === config.css(1, 0);
}

/**
 * What the hook decided to do with one element, as a value.
 *
 * The decisions — is this a flip or an entry, does its duration mean anything,
 * is the movement real — are the part worth checking, and checking them
 * through a browser would mean not checking them. So they are a pure function
 * of the element's attributes and its two boxes, and the effect below does
 * nothing but measure, call this, and hand the result to the Web Animations
 * API.
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

function run(element: HTMLElement, plan: MotionPlan) {
	if (plan.kind === 'none') return;
	element.animate(sampleKeyframes(plan.config), {
		duration: plan.config.duration,
		delay: plan.config.delay,
		easing: 'linear',
		fill: 'none',
	});
}

export function useKeyedMotion(containerRef: RefObject<HTMLElement | null>): void {
	const previous = useRef<Map<string, MotionBox> | null>(null);

	// No dependency array on purpose: the hook has to measure after EVERY
	// commit, because any of them may be the one that moved a keyed child.
	useLayoutEffect(() => {
		const root = containerRef.current;
		if (!root || NO_ANIMATION_API) return;

		const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-key]'));
		const seeding = previous.current === null;
		const before = previous.current;
		const next = new Map<string, MotionBox>();

		for (const element of elements) {
			const key = element.dataset.motionKey;
			if (key === undefined) continue;
			const box = boxOf(element);
			next.set(key, box);
			if (seeding || before === null) continue;
			const attributes: MotionAttributes = {
				flip: element.dataset.motionFlip,
				enter: element.dataset.motionEnter,
			};
			const previousBox = before.get(key);
			run(
				element,
				previousBox
					? planFlip(attributes, flipMetricsOf(element), previousBox, box)
					: planEnter(attributes, transitionMetricsOf(element)),
			);
		}

		previous.current = next;
	});
}
