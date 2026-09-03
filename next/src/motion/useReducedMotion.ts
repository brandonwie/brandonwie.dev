'use client';

import { useEffect, useState } from 'react';

/**
 * Reactively tracks the user's `prefers-reduced-motion` setting.
 *
 * PORT NOTE. The Svelte original (`src/lib/useReducedMotion.svelte.ts`) reads
 * `matchMedia` inside `onMount` and returns a getter object so `motion.current`
 * stays reactive. React's equivalent is state plus an effect: the effect body
 * runs only on the client, so `window` is never touched during the static
 * export, exactly as `onMount` guaranteed under adapter-static.
 *
 * THE INITIAL VALUE IS FALSE IN BOTH STACKS. Neither implementation can know
 * the media state while rendering on the server, so both paint the
 * motion-enabled markup first and correct it after mount. Returning `true`
 * here would be a behavior change, not a safety improvement: a reduced-motion
 * user would see the same first frame either way, and a normal user would lose
 * the first animation after hydration.
 *
 * `addEventListener('change')` on the MediaQueryList (not the deprecated
 * `addListener`) matches the Svelte version's subscription, and the cleanup
 * removes it on unmount.
 */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		setReduced(query.matches);
		const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}, []);

	return reduced;
}
