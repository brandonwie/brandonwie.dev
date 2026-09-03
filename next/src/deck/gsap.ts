/**
 * GSAP loader for deck slides — the React side of
 * `src/lib/components/deck/gsap.ts`.
 *
 * WHY DYNAMIC (unchanged from the Svelte original): every route is exported as
 * static HTML (`output: 'export'`), so a module that touches `document` at
 * import time runs during the export and breaks the build. The dynamic import
 * keeps GSAP strictly client-side.
 *
 * WHY SHARED (unchanged): `registerPlugin` must run exactly once. Every slide
 * awaits the same promise instead of racing its own registration. The memo is
 * module-scoped, which is also what makes React's StrictMode double-invoke
 * harmless here: two mounts of the same slide await one registration rather
 * than registering twice.
 *
 * WHAT CHANGED: the import specifier of the caller, and nothing else. This
 * module is framework-agnostic in both stacks, which is why PR 3 reports its
 * lines against the `impl.lib-ts` rate rather than the slide rate.
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
