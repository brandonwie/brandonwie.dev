/**
 * What the palette shows before you type, and how it groups what you do type.
 *
 * Both are pure list transforms in the Svelte original too
 * (`FuzzyFinder.svelte:56-73`); they are only extracted here because a React
 * component body is a worse place to reach them from than a module is. Two
 * properties are easy to lose in transcription and are worth asserting:
 *
 *   - The empty-query list is NOT the item list. Nav and actions appear in
 *     full, posts are sorted newest-first and capped at eight. A port that
 *     dropped the cap would dump every post into the default view, which is
 *     the exact thing UX-3 changed.
 *   - Grouping is a STABLE sort by section. Fuse rank survives inside each
 *     section only because `Array.prototype.sort` is stable, which it has been
 *     required to be since ES2019. Re-implementing it as a bucket-and-concat
 *     would also work; re-implementing it as a comparator that tie-breaks on
 *     anything would silently discard the ranking.
 */

import type { FuzzyResult } from './fuzzy';
import type { PaletteGroup, PaletteItem } from './items';

// UX-3: cap the default (empty-query) POSTS section instead of dumping all posts.
export const DEFAULT_POST_LIMIT = 8;

// Section ordering for grouped display. Stable-sort by this so Fuse rank is
// preserved within each group.
export const GROUP_ORDER: Record<PaletteGroup, number> = { nav: 0, action: 1, post: 2 };

/**
 * Default list shown before the user types: nav + actions in full, then the
 * most-recent posts capped at DEFAULT_POST_LIMIT (UX-3). `items` is already
 * ordered nav → action → post by buildPaletteItems.
 */
export function defaultResults(items: PaletteItem[]): FuzzyResult[] {
	const navAction = items
		.filter((item) => item.group !== 'post')
		.map((item) => ({ item, score: 0 }));
	const recentPosts = items
		.filter((item) => item.group === 'post')
		.slice()
		.sort((a, b) => new Date(b.meta?.date ?? 0).getTime() - new Date(a.meta?.date ?? 0).getTime())
		.slice(0, DEFAULT_POST_LIMIT)
		.map((item) => ({ item, score: 0 }));
	return [...navAction, ...recentPosts];
}

/**
 * Group Fuse results into sections (nav → action → post) while keeping rank
 * order within each group. Array.prototype.sort is stable.
 */
export function groupResults(list: FuzzyResult[]): FuzzyResult[] {
	return [...list].sort((a, b) => GROUP_ORDER[a.item.group] - GROUP_ORDER[b.item.group]);
}

/** True when row `i` starts a new section and needs a header above it. */
export function startsSection(results: FuzzyResult[], index: number): boolean {
	return index === 0 || results[index - 1].item.group !== results[index].item.group;
}
