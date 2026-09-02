import type { Locale } from './posts';

export function articlePath(slug: string, locale: Locale): string {
	return locale === 'ko' ? `/ko/posts/${slug}` : `/posts/${slug}`;
}
