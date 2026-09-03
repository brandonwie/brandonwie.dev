/**
 * Ports of the three Svelte motion primitives the study visualizers use.
 *
 * WHY THIS FILE EXISTS AT ALL. `animate:flip`, `in:scale` and `in:fade` are
 * Svelte language features with no React equivalent. Four of the seventeen
 * study visualizers use `animate:flip`; twelve use a transition. React ships
 * nothing for either, so the choice was a layout-animation library or a port
 * of the math. This is the port.
 *
 * WHY NOT A LIBRARY. Framer Motion's `layout` prop solves the same problem
 * with different arithmetic — it projects a layout delta and corrects child
 * scale, which is a better general answer and a worse parity answer. The
 * migration's whole claim is that the Next build behaves like the Svelte build;
 * "it also animates, differently" is not that claim. Porting the formula makes
 * the claim checkable: `scripts/assert-slice2-motion.ts` runs Svelte's own
 * `flip`, `fade` and `scale` against the functions below on the same inputs and
 * compares the CSS they produce, character for character. A library would have
 * left the comparison unavailable and the difference unmeasured.
 *
 * WHAT IS DELIBERATELY IDENTICAL. Every formula, every default, and the exact
 * shape of the CSS declaration each one emits, including Svelte's own
 * whitespace. `css()` is not the production path — `style()` is, because the
 * Web Animations API takes properties rather than declaration strings — but
 * `css()` is the form the oracle can be compared against, and the harness also
 * asserts the two agree, so the production path cannot drift away from the
 * checked one.
 *
 * Sources, read from the installed `svelte@5.56.4`:
 *   node_modules/svelte/src/animate/index.js      (flip)
 *   node_modules/svelte/src/transition/index.js   (fade, scale)
 *   node_modules/svelte/src/easing/index.js       (cubicOut, linear)
 */

/** A `DOMRect`, reduced to the four fields the formulas read. */
export interface MotionBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * What `flip` reads off the moving element. Svelte reaches for these through
 * `getComputedStyle(node)` and `node.clientWidth/clientHeight`; taking them as
 * data is what makes the formula testable without a browser.
 */
export interface FlipMetrics {
	clientWidth: number;
	clientHeight: number;
	/** Computed `transform`; `'none'` is treated as empty, as Svelte does. */
	transform: string;
	/** Computed `transform-origin`, e.g. `'24px 12px'`. */
	transformOrigin: string;
	/** Effective CSS zoom. `1` unless a `zoom` is in effect. */
	zoom: number;
}

/** What the two transitions read off the entering element. */
export interface TransitionMetrics {
	/** Computed `opacity`, as a number. */
	opacity: number;
	/** Computed `transform`; `'none'` is treated as empty, as Svelte does. */
	transform: string;
}

/** WAAPI-shaped projection of one frame. */
export interface MotionStyle {
	transform?: string;
	opacity?: string;
}

export interface MotionConfig {
	delay: number;
	duration: number;
	easing: (t: number) => number;
	/** Byte-identical to the Svelte primitive's own `css(t, u)`. */
	css: (t: number, u: number) => string;
	/** The same frame, as properties the Web Animations API accepts. */
	style: (t: number, u: number) => MotionStyle;
}

export function linear(t: number): number {
	return t;
}

export function cubicOut(t: number): number {
	const f = t - 1.0;
	return f * f * f + 1.0;
}

export interface FlipParams {
	delay?: number;
	duration?: number | ((distance: number) => number);
	easing?: (t: number) => number;
}

/**
 * `animate:flip`.
 *
 * Svelte measures the element before and after the DOM update and animates
 * from the old box to the new one — First, Last, Invert, Play. The default
 * duration is distance-derived; both call sites in this port pass an explicit
 * number, but the default is carried anyway so the ported function is the
 * ported function rather than a subset of it.
 */
export function flipConfig(
	metrics: FlipMetrics,
	from: MotionBox,
	to: MotionBox,
	params: FlipParams = {},
): MotionConfig {
	const { delay = 0, duration = (d: number) => Math.sqrt(d) * 120, easing = cubicOut } = params;

	const transform = metrics.transform === 'none' ? '' : metrics.transform;
	const origin = metrics.transformOrigin.split(' ').map(parseFloat);
	const ox = origin[0] / metrics.clientWidth;
	const oy = origin[1] / metrics.clientHeight;

	const sx = metrics.clientWidth / to.width / metrics.zoom;
	const sy = metrics.clientHeight / to.height / metrics.zoom;

	const fx = from.left + from.width * ox;
	const fy = from.top + from.height * oy;
	const tx = to.left + to.width * ox;
	const ty = to.top + to.height * oy;

	const dx = (fx - tx) * sx;
	const dy = (fy - ty) * sy;

	const dsx = from.width / to.width;
	const dsy = from.height / to.height;

	const frame = (t: number, u: number) => ({
		x: u * dx,
		y: u * dy,
		scaleX: t + u * dsx,
		scaleY: t + u * dsy,
	});

	return {
		delay,
		duration: typeof duration === 'function' ? duration(Math.sqrt(dx * dx + dy * dy)) : duration,
		easing,
		css: (t, u) => {
			const f = frame(t, u);
			return `transform: ${transform} translate(${f.x}px, ${f.y}px) scale(${f.scaleX}, ${f.scaleY});`;
		},
		style: (t, u) => {
			const f = frame(t, u);
			return {
				transform: `${transform} translate(${f.x}px, ${f.y}px) scale(${f.scaleX}, ${f.scaleY})`,
			};
		},
	};
}

export interface FadeParams {
	delay?: number;
	duration?: number;
	easing?: (t: number) => number;
}

/** `in:fade` — opacity from zero to the element's computed opacity. */
export function fadeConfig(metrics: TransitionMetrics, params: FadeParams = {}): MotionConfig {
	const { delay = 0, duration = 400, easing = linear } = params;
	const o = metrics.opacity;

	return {
		delay,
		duration,
		easing,
		css: (t) => `opacity: ${t * o}`,
		style: (t) => ({ opacity: `${t * o}` }),
	};
}

export interface ScaleParams {
	delay?: number;
	duration?: number;
	easing?: (t: number) => number;
	start?: number;
	opacity?: number;
}

/**
 * `in:scale` — grows from `start` to full size while fading in.
 *
 * The CSS string reproduces Svelte's template literal exactly, tabs and
 * newlines included. That looks like an odd thing to preserve until you
 * remember what it is for: the harness compares this string to the one Svelte
 * produces, and a comparison that normalizes whitespace first is a weaker
 * comparison for no gain.
 */
export function scaleConfig(metrics: TransitionMetrics, params: ScaleParams = {}): MotionConfig {
	const { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 } = params;

	const targetOpacity = metrics.opacity;
	const transform = metrics.transform === 'none' ? '' : metrics.transform;
	const sd = 1 - start;
	const od = targetOpacity * (1 - opacity);

	const frame = (u: number) => ({
		scale: 1 - sd * u,
		opacity: targetOpacity - od * u,
	});

	return {
		delay,
		duration,
		easing,
		css: (_t, u) => {
			const f = frame(u);
			return `
			transform: ${transform} scale(${f.scale});
			opacity: ${f.opacity}
		`;
		},
		style: (_t, u) => {
			const f = frame(u);
			return {
				transform: `${transform} scale(${f.scale})`,
				opacity: `${f.opacity}`,
			};
		},
	};
}

/**
 * How many samples Svelte takes for a given duration.
 *
 * `Math.ceil(duration / (1000 / 60))` is Svelte's own line, with its own
 * comment: "`n` must be an integer, or we risk missing the `t2` value". The
 * loop runs `i = 0` through `i = n` inclusive, so a 220 ms flip is 15 frames
 * and a 120 ms fade is 9 — not a round number, and not a free choice.
 *
 * An earlier revision sampled a fixed 21 frames regardless of duration. Since
 * the easing is baked into the samples and the browser interpolates linearly
 * between them, that made the port's curve a slightly CLOSER approximation of
 * `cubicOut` than Svelte's own. Better, and therefore wrong: an unrecorded
 * improvement is a divergence like any other, and this one would have been
 * invisible in every comparison the harness makes.
 */
export function frameCount(duration: number): number {
	return Math.max(1, Math.ceil(duration / (1000 / 60)));
}

/**
 * Sample a config into Web Animations API keyframes.
 *
 * Svelte samples its own `css(t, u)` across the duration and hands the result
 * to `element.animate(...)`; this is the same array, built the same way. The
 * easing is baked into the samples rather than passed to the animation, so the
 * curve is the ported `easing` function and not the browser's nearest
 * `cubic-bezier` — which is also why the sample COUNT is part of the port.
 *
 * `u` is `1 - t`, exactly as Svelte defines it for an intro.
 */
export function sampleKeyframes(
	config: MotionConfig,
	steps = frameCount(config.duration),
): Keyframe[] {
	const frames: Keyframe[] = [];
	for (let i = 0; i <= steps; i += 1) {
		const p = i / steps;
		const t = config.easing(p);
		frames.push({ ...config.style(t, 1 - t), offset: p });
	}
	return frames;
}
