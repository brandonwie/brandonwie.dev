import type { Locale } from './posts';

export function articlePath(slug: string, locale: Locale): string {
	return locale === 'ko' ? `/ko/posts/${slug}` : `/posts/${slug}`;
}

export function sourceDate(value: string | Date | undefined): string | undefined {
	if (value === undefined) return undefined;
	return value instanceof Date ? value.toISOString() : String(value);
}
