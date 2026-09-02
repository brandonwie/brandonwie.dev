import type { Locale } from './posts';

export const SLICE_1_ARTICLE_SLUG = 'giscus-sveltekit-integration';

export function articlePath(slug: string, locale: Locale): string {
	return locale === 'ko' ? `/ko/posts/${slug}` : `/posts/${slug}`;
}

export function sourceDate(value: string | Date | undefined): string | undefined {
	if (value === undefined) return undefined;
	return value instanceof Date ? value.toISOString() : String(value);
}
