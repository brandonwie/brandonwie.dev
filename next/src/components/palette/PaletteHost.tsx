'use client';

/**
 * The palette's open state and the window-level chord handler — the React side
 * of the parts of `src/routes/+layout.svelte` that own the palette
 * (`:108-121` the chords, `:147` the window binding, `:124-127` the select
 * handler) plus `src/lib/stores/palette.ts`.
 *
 * The ten-line Svelte store becomes one `useState` here, which is the whole
 * reason it can be one component: the store existed because two unrelated
 * Svelte files needed to agree on a boolean, and in React the same two
 * concerns are the parent and child of a single subtree.
 *
 * The chord decisions themselves are NOT in this file. They are in
 * `@/palette/shortcuts`, where they can be asserted without a DOM; this
 * component only translates the decision into an effect.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import FuzzyFinder from '@/components/palette/FuzzyFinder';
import {
	buildPaletteItems,
	type PaletteItem,
	type PaletteLocale,
	type PalettePost,
} from '@/palette/items';
import { planGlobalChord } from '@/palette/shortcuts';

interface Props {
	posts: PalettePost[];
	pathname: string;
	locale: PaletteLocale;
	/** Injected so the spike route can record navigations instead of performing
	 *  them; the real shell passes `useRouter().push`. */
	navigate: (href: string) => void;
}

export default function PaletteHost({ posts, pathname, locale, navigate }: Props) {
	const [open, setOpen] = useState(false);

	// Memoized because it is the sole dependency of the child's Fuse index. Rebuilt
	// per render, it re-indexes 167 posts on every parent render. Latent on this
	// fixture route, where the host only re-renders on open/close; live in the
	// shell mount, where `pathname` comes from `usePathname()`.
	//
	// What it does NOT do is keep `fuse` aligned with the `results` on screen:
	// `results` is seeded once by a useState initializer and thereafter only
	// reassigned on input. Svelte builds both in `onMount` and never rebuilds
	// either (FuzzyFinder.svelte:92-99), so that is parity, not an oversight.
	const items = useMemo(
		() => buildPaletteItems(posts, pathname, navigate, locale),
		[locale, navigate, pathname, posts],
	);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const plan = planGlobalChord(event, {
				pathname,
				targetTag: target?.tagName ?? '',
				targetEditable: Boolean(target?.isContentEditable),
			});

			if (plan.kind === 'ignore') return;
			// Cmd+P prints and Cmd+F opens the browser find bar otherwise.
			event.preventDefault();
			if (plan.kind === 'open-palette') setOpen(true);
			else navigate(plan.href);
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [navigate, pathname]);

	// Close the palette, then run the selected item's command. Each PaletteItem
	// carries its own run().
	const handleSelect = useCallback((item: PaletteItem) => {
		setOpen(false);
		item.run();
	}, []);

	// Stable, or the child's window-listener effect re-registers every render.
	// Latent on this fixture route for the same reason the memo above is: the host
	// re-renders only on open/close, and either edge mounts or unmounts the child.
	const handleClose = useCallback(() => setOpen(false), []);

	if (!open) return null;

	return (
		<FuzzyFinder items={items} onSelect={handleSelect} onClose={handleClose} locale={locale} />
	);
}
