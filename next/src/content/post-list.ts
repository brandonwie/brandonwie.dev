import { orderPostsForPalette } from '../palette/post-order';
import { listPublishedPosts, type Locale, type PublishedPost } from './posts';

/**
 * The list shape five SvelteKit loaders build by hand from `import.meta.glob`.
 *
 * `src/routes/+layout.ts`, `src/routes/+page.ts`, `src/routes/ko/+page.ts`,
 * `src/routes/posts/+page.ts` and `src/routes/ko/posts/+page.ts` each open the
 * same two globs and then repeat the same four steps inline: drop drafts,
 * derive the slug from the file's basename, keep Vite's path-ascending key
 * order, and sort by `effectiveDate(date, updated)` descending. Seven of the
 * seventeen C5 call sites are those five files.
 *
 * The steps are not re-implemented here. `listPublishedPosts` already drops
 * drafts, derives the slug and returns path-ascending order -- it was written
 * for the feeds, which depend on that order -- and `orderPostsForPalette`
 * already carries the date comparator. `Array.prototype.sort` is stable in
 * every engine this ships to, so path order survives as the tie-break exactly
 * as it does in the Svelte loaders, where the glob key order plays the same
 * role.
 *
 * WHY THE ORDER FUNCTION LIVES UNDER `palette/`. It was extracted when the
 * palette's first screen came out ordered differently from Svelte's, and its
 * own docblock names the source of that order: the root layout. The layout is
 * also the first call site here, so this is the same contract seen from the
 * other end, not a second copy of it.
 */

/** A published post plus the locale its source file came from. */
export interface LocalizedPost extends PublishedPost {
	/** `lang` in `src/routes/ko/posts/+page.ts`; absent from the other loaders. */
	lang: Locale;
}

/**
 * Every published post in a locale, newest activity first.
 *
 * Ports `collectPosts` in `src/routes/+layout.ts:24-41` and the identical
 * inline bodies of `src/routes/+page.ts:18-34`, `src/routes/ko/+page.ts:16-32`
 * and `src/routes/posts/+page.ts:10-26`. The layout picks the locale from the
 * pathname (`localeOf`); under the App Router the route group already fixes it,
 * so the locale is a parameter instead.
 */
export function listPostsForLocale(locale: Locale): PublishedPost[] {
	return orderPostsForPalette(listPublishedPosts(locale));
}

/**
 * Korean posts, then the English posts that have no Korean translation.
 *
 * Ports `src/routes/ko/posts/+page.ts:20-49`. Two details are load-bearing and
 * easy to lose:
 *
 *   - The fallback is keyed by SLUG, not by path. A Korean post filed under a
 *     different category still suppresses its English twin.
 *   - Korean entries are pushed FIRST and the sort runs once over the joined
 *     array. Sorting each language separately, or concatenating after sorting,
 *     changes which of two same-date entries comes first.
 */
export function listKoreanPostsWithEnglishFallback(): LocalizedPost[] {
	const korean = listPublishedPosts('ko');
	const koreanSlugs = new Set(korean.map((post) => post.slug));
	const english = listPublishedPosts('en').filter((post) => !koreanSlugs.has(post.slug));

	return orderPostsForPalette<LocalizedPost>([
		...korean.map((post) => ({ ...post, lang: 'ko' as const })),
		...english.map((post) => ({ ...post, lang: 'en' as const })),
	]);
}

/**
 * Published Korean post titles, keyed by slug.
 *
 * Ports `src/routes/ko/system/3b/+page.ts:16-21`, the seventeenth glob call
 * site. The Korean `/system/3b` page localizes its blog-series titles from the
 * Korean corpus rather than from the snapshot overlay, because the series
 * entries ARE posts: the Korean title of a translated post is the Korean title
 * of that series entry. Drafts are skipped for the same reason the lists skip
 * them -- an unpublished translation must not surface its title on a page that
 * links to it.
 */
export function koreanTitleBySlug(): Record<string, string> {
	const titles: Record<string, string> = {};
	for (const post of listPublishedPosts('ko')) titles[post.slug] = post.frontmatter.title;
	return titles;
}
