import { sourceDate } from './article-contract';
import { listPublishedPosts, type Locale, type PublishedPost } from './posts';

/** A published post plus the locale its source file came from. */
export interface LocalizedPost extends PublishedPost {
	lang: Locale;
	/** Publish date as `YYYY-MM-DD`. */
	date: string;
}

function localized(post: PublishedPost, lang: Locale): LocalizedPost {
	return { ...post, lang, date: (sourceDate(post.frontmatter.date) ?? '').slice(0, 10) };
}

/**
 * Every post a locale shows, newest first by publish date.
 *
 * Korean shows the Korean posts, then the English post for each slug that has
 * no translation. The fallback is keyed by SLUG, not by path: a Korean post
 * filed under a different category still replaces its English twin.
 *
 * `listPublishedPosts` returns path order and the sort is stable, so posts of
 * the same day keep path order.
 */
export function listPosts(locale: Locale): LocalizedPost[] {
	const english = listPublishedPosts('en').map((post) => localized(post, 'en'));
	if (locale === 'en') return english.sort(newestFirst);

	const korean = listPublishedPosts('ko').map((post) => localized(post, 'ko'));
	const translated = new Set(korean.map((post) => post.slug));
	return [...korean, ...english.filter((post) => !translated.has(post.slug))].sort(newestFirst);
}

function newestFirst(a: LocalizedPost, b: LocalizedPost): number {
	return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * Published Korean post titles, keyed by slug.
 *
 * The Korean `/system/b3` page localizes its blog-series titles from the
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
