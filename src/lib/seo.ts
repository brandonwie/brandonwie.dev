export const SITE_URL = 'https://brandonwie.dev';
export const SITE_NAME = 'Brandon Wie';
export const SITE_AUTHOR = 'Brandon Seokhyun Wie';

/** Public profiles and the contact address. */
export const SOCIAL = {
	github: 'https://github.com/brandonwie',
	linkedin: 'https://linkedin.com/in/brandonwie',
	x: 'https://x.com/BrandonWie',
	email: 'brandon@brandonwie.dev',
} as const;

/**
 * The one share card (1200x630) every page points at. The site has no other
 * image: a post is text, code and diagrams.
 */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og.png`;

export function absoluteUrl(path = '/'): string {
	if (path === '' || path === '/') return SITE_URL;
	return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function localeCode(locale: 'en' | 'ko'): string {
	return locale === 'ko' ? 'ko_KR' : 'en_US';
}
