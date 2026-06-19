import { onMount } from 'svelte';

/**
 * Reactively tracks the user's `prefers-reduced-motion` setting.
 *
 * `matchMedia` is read inside `onMount` so this is safe under SSR / static
 * prerender (adapter-static) — `window` is never touched on the server. Returns
 * a getter object; read `motion.current` wherever a transition duration is set,
 * e.g. `duration: motion.current ? 0 : 220`.
 */
export function useReducedMotion() {
	let reduced = $state(false);

	onMount(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduced = query.matches;
		const onChange = (event: MediaQueryListEvent) => {
			reduced = event.matches;
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	return {
		get current() {
			return reduced;
		},
	};
}
