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

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og/default.png`;

/** Root-relative fallback cover used when a post has no generated image yet. */
export const DEFAULT_COVER = '/og/default.png';

/** Root-relative cover (1200x630) for in-page <img> on cards. */
export function coverImage(slug: string): string {
	return `/og/${slug}.png`;
}

/** Root-relative wide hero (2000x800, 5:2) shown atop a post. */
export function heroImage(slug: string): string {
	return `/hero/${slug}.png`;
}

export function absoluteUrl(path = '/'): string {
	if (path === '' || path === '/') return SITE_URL;
	return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function localeCode(locale: 'en' | 'ko'): string {
	return locale === 'ko' ? 'ko_KR' : 'en_US';
}
