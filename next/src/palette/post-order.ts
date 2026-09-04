import { sourceDate } from '@/content/article-contract';
import { effectiveDate } from '@/content/feeds';

/**
 * Palette post ordering — the contract, not a convenience.
 *
 * WHY THIS IS A MODULE AND NOT A SORT AT THE CALL SITE. The Svelte root layout
 * hands the palette its posts already sorted by `effectiveDate(date, updated)`
 * descending (`src/routes/+layout.ts:34-38`); `listPublishedPosts` returns them
 * in `relativePath` order (`next/src/content/posts.ts:201-203`). Both stacks'
 * `defaultResults` then sort by `date` ALONE with a STABLE sort, so every tie
 * resolves to whatever order it arrived in — and the palette's first screen came
 * out ordered differently. Same eight slugs, different order.
 *
 * No comparator row can see this: the palette renders only on a chord, so the
 * ordering never reaches the exported HTML the harness diffs. It has to be
 * asserted directly, which is why the ordering is a function with a row of its
 * own (I7) rather than a sort inlined into a fixture page that Slice 4 deletes.
 * The Slice 3 palette port inherits the identical setup and this module with it.
 */
export interface OrderablePost {
	frontmatter: { date: string | Date; updated?: string | Date };
}

/** The sort key both stacks order by: `updated` when it is newer, else `date`. */
export function paletteOrderKey(post: OrderablePost): number {
	return new Date(
		effectiveDate(sourceDate(post.frontmatter.date) ?? '', sourceDate(post.frontmatter.updated)),
	).getTime();
}

/** A new array in the order the Svelte layout hands the palette. */
export function orderPostsForPalette<T extends OrderablePost>(posts: readonly T[]): T[] {
	return [...posts].sort((a, b) => paletteOrderKey(b) - paletteOrderKey(a));
}
