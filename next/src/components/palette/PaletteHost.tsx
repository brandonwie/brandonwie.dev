'use client';

/**
 * The palette's presentation: the item registry for the current route and the
 * modal that renders it. The React side of `src/lib/components/palette` plus
 * `src/lib/stores/palette.ts`.
 *
 * OPEN STATE LIVES IN THE CONTROLLER. The ten-line Svelte store existed because
 * two unrelated Svelte files had to agree on a boolean. Here the header button
 * and the Cmd/Ctrl+K chord are both handled by `ShellPalette`, which owns
 * `open` and passes it down — one owner for one piece of state, and this
 * component stays free of window listeners.
 *
 * `navigate` is injected rather than imported: `useRouter()` is a hook and
 * cannot be called from a plain module, and the harness passes a recorder to
 * read back the exact href each item would visit. The shell passes a
 * full-document navigation, which is the shell's recorded decision until PR 2d
 * changes it.
 */

import { useCallback, useMemo } from 'react';

import FuzzyFinder from '@/components/palette/FuzzyFinder';
import {
	buildPaletteItems,
	type PaletteItem,
	type PaletteLocale,
	type PalettePost,
} from '@/palette/items';

interface Props {
	posts: PalettePost[];
	pathname: string;
	locale: PaletteLocale;
	navigate: (href: string) => void;
	/** Owned by `ShellPalette`; this component never sets it. */
	open: boolean;
	onClose: () => void;
	/** Opener element captured by ShellPalette for A11Y-1 focus restoration. */
	opener?: HTMLElement | null;
}

export default function PaletteHost({
	posts,
	pathname,
	locale,
	navigate,
	open,
	onClose,
	opener,
}: Props) {
	// Memoized because it is the sole dependency of the child's Fuse index. Rebuilt
	// per render, it re-indexes 167 posts on every parent render — live in the
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

	// Close the palette, then run the selected item's command. Each PaletteItem
	// carries its own run().
	const handleSelect = useCallback(
		(item: PaletteItem) => {
			onClose();
			item.run();
		},
		[onClose],
	);

	if (!open) return null;

	return (
		<FuzzyFinder
			items={items}
			onSelect={handleSelect}
			onClose={onClose}
			locale={locale}
			opener={opener}
		/>
	);
}
