import { sourceDate } from './article-contract';
import { listPublishedPosts, type Locale, type PublishedPost } from './posts';

/**
 * Newest first by publish date. `listPublishedPosts` returns path order and the
 * sort is stable, so posts of the same day keep path order.
 */
function newestFirst<T extends PublishedPost>(posts: readonly T[]): T[] {
	const time = (post: T) => new Date(sourceDate(post.frontmatter.date) ?? '').getTime();
	return [...posts].sort((a, b) => time(b) - time(a));
}

/** A published post plus the locale its source file came from. */
export interface LocalizedPost extends PublishedPost {
	/** `lang` in `src/routes/ko/posts/+page.ts`; absent from the other loaders. */
	lang: Locale;
}

/** Every published post in a locale, newest first. */
export function listPostsForLocale(locale: Locale): PublishedPost[] {
	return newestFirst(listPublishedPosts(locale));
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

	return newestFirst<LocalizedPost>([
		...korean.map((post) => ({ ...post, lang: 'ko' as const })),
		...english.map((post) => ({ ...post, lang: 'en' as const })),
	]);
}

/**
 * Published Korean post titles, keyed by slug.
 *
 * Ports `src/routes/ko/system/3b/+page.ts:16-21`, the seventeenth glob call
 * site. The Korean `/system/b3` page localizes its blog-series titles from the
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
