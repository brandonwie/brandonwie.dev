/**
 * GSAP loader for deck slides.
 *
 * WHY DYNAMIC: the site prerenders every route (`adapter-static`), so any
 * module that touches `document` at import time breaks the build. Loading GSAP
 * inside `onMount` keeps it strictly client-side.
 *
 * WHY SHARED: plugins must be registered exactly once. Every slide awaits the
 * same promise instead of racing its own registration.
 */

type GsapBundle = {
	gsap: typeof import('gsap').gsap;
	Flip: typeof import('gsap/Flip').Flip;
};

let pending: Promise<GsapBundle> | null = null;

export function loadGsap(): Promise<GsapBundle> {
	if (!pending) {
		pending = (async () => {
			const [core, flip, draw] = await Promise.all([
				import('gsap'),
				import('gsap/Flip'),
				import('gsap/DrawSVGPlugin'),
			]);

			core.gsap.registerPlugin(flip.Flip, draw.DrawSVGPlugin);

			return { gsap: core.gsap, Flip: flip.Flip };
		})();
	}

	return pending;
}

/**
 * One easing curve and one duration ceiling for the whole deck. Slides import
 * these rather than inventing their own, which is what keeps sixteen slides
 * feeling like one artifact.
 */
export const EASE = 'power2.inOut';
export const DURATION = 0.45;

/** Honors the OS reduced-motion setting; slides collapse to instant state. */
export function reducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
