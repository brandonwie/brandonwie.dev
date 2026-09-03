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

function play(element: HTMLElement, config: MotionConfig) {
	if (config.duration <= 0) return;
	element.animate(sampleKeyframes(config), {
		duration: config.duration,
		delay: config.delay,
		easing: 'linear',
		fill: 'none',
	});
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

function playFlip(element: HTMLElement, from: MotionBox, to: MotionBox) {
	const duration = Number(element.dataset.motionFlip ?? 0);
	if (!Number.isFinite(duration) || duration <= 0) return;
	const config = flipConfig(flipMetricsOf(element), from, to, { duration });
	if (isIdentity(config)) return;
	play(element, config);
}

function playEnter(element: HTMLElement) {
	const spec = element.dataset.motionEnter;
	if (!spec) return;
	const [kind, rawDuration] = spec.split(':');
	const duration = Number(rawDuration);
	if (!Number.isFinite(duration) || duration <= 0) return;
	const metrics = transitionMetricsOf(element);
	if (kind === 'fade') play(element, fadeConfig(metrics, { duration }));
	else if (kind === 'scale') play(element, scaleConfig(metrics, { duration }));
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
			const previousBox = before.get(key);
			if (previousBox) playFlip(element, previousBox, box);
			else playEnter(element);
		}

		previous.current = next;
	});
}
