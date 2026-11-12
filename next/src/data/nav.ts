import type { Locale } from '../i18n/locale';

/**
 * Top-level navigation: the link set, locale-aware hrefs and the active-section
 * matcher. Pure path logic; labels come from `shellCopy(locale).nav`.
 */

export type NavKey = 'posts' | 'study' | 'system' | 'about';

export interface NavItem {
	key: NavKey;
	/** Canonical (en) path, without the locale prefix. */
	path: string;
	/** Single-key shortcut, shown beside the label in the header. */
	hotkey: string;
}

/** Canonical nav, in header order. Posts are the home page. */
export const NAV_ITEMS: readonly NavItem[] = [
	{ key: 'posts', path: '/', hotkey: 'p' },
	{ key: 'study', path: '/study', hotkey: 's' },
	{ key: 'system', path: '/system/b3', hotkey: 'b' },
	{ key: 'about', path: '/about', hotkey: 'a' },
];

/** Matches `/ko` as a path segment, so `/koala` is not treated as Korean. */
const KO_PREFIX = /^\/ko(?:\/|$)/;

/** Locale inferred from a pathname (`/ko` segment → ko, else en). */
export function localeOf(pathname: string): Locale {
	return KO_PREFIX.test(pathname) ? 'ko' : 'en';
}

/** Path prefix for a locale: '' for en, '/ko' for ko. */
export function base(locale: Locale): string {
	return locale === 'ko' ? '/ko' : '';
}

/** Remove a locale prefix from a pathname while preserving full path segments. */
export function stripLocale(pathname: string): string {
	return pathname.replace(KO_PREFIX, '/') || '/';
}

/** Convert the current pathname to the requested locale. */
export function pathForLocale(pathname: string, locale: Locale): string {
	const path = stripLocale(pathname);
	return `${base(locale)}${path === '/' ? '' : path}` || '/';
}

// Talks are delivered in one language, so they have no Korean twin.
const ENGLISH_ONLY_PREFIXES = ['/talks', '/_not-found'] as const;

/** Whether a pathname has a counterpart in every locale. */
export function hasLocaleVariant(pathname: string): boolean {
	const path = stripLocale(pathname);
	return !ENGLISH_ONLY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Locale-aware home href: the post index. */
export function homeHref(locale: Locale): string {
	return base(locale) || '/';
}

/** Locale-aware href for a nav item. */
export function hrefFor(item: NavItem, locale: Locale): string {
	return item.path === '/' ? homeHref(locale) : `${base(locale)}${item.path}`;
}

/** Locale-aware href of one post. */
export function postHref(slug: string, locale: Locale): string {
	return `${base(locale)}/posts/${slug}`;
}

/**
 * Active nav section for a path, matched on full path segments: the home page
 * and every `/posts/*` page are `posts`; `/postscript` matches nothing.
 */
export function activeKey(pathname: string): NavKey | null {
	const p = stripLocale(pathname);
	if (p === '/' || /^\/posts(?:\/|$)/.test(p)) return 'posts';
	if (/^\/study(?:\/|$)/.test(p)) return 'study';
	if (/^\/system(?:\/|$)/.test(p)) return 'system';
	if (/^\/about(?:\/|$)/.test(p)) return 'about';
	return null;
}
