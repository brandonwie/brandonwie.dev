export const SITE_URL = 'https://brandonwie.dev';
export const SITE_NAME = 'Brandon Wie';
export const SITE_AUTHOR = 'Brandon Seokhyun Wie';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og/default.png`;

export function absoluteUrl(path = '/'): string {
	if (path === '' || path === '/') return SITE_URL;
	return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function localeCode(locale: 'en' | 'ko'): string {
	return locale === 'ko' ? 'ko_KR' : 'en_US';
}
