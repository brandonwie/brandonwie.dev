/**
 * nav.ts — single source of truth for top-level site navigation.
 *
 * Drives the global `SiteHeader` (and footer): the canonical link set, their
 * locale-aware hrefs, and the active-section matcher. Keeping hrefs + active
 * state here means every route inherits the same chrome from one place instead
 * of each page hand-rolling its own header.
 */
import { m } from '$lib/paraglide/messages';

export type Locale = 'en' | 'ko';
export type NavKey = 'about' | 'posts' | 'study' | 'system';

export interface NavItem {
	key: NavKey;
	/**
	 * Label for an explicit locale. The locale is passed in (from `localeOf` on the
	 * pathname) instead of read from Paraglide's ambient `getLocale()`, so nav text
	 * follows the URL. On a static site a persisted language cookie can pin
	 * `getLocale()` to the wrong locale, which would render the bar in the wrong
	 * language even though the route is correct.
	 */
	label: (locale: Locale) => string;
	/** Canonical (en) path, without the locale prefix. */
	path: string;
}

/** Canonical nav, in bar order. `system` points at the real 3B destination. */
export const NAV_ITEMS: readonly NavItem[] = [
	{ key: 'about', label: (locale) => m.nav_about({}, { locale }), path: '/about' },
	{ key: 'posts', label: (locale) => m.nav_posts({}, { locale }), path: '/posts' },
	{ key: 'study', label: (locale) => m.nav_study({}, { locale }), path: '/study' },
	{ key: 'system', label: (locale) => m.nav_system({}, { locale }), path: '/system/3b' },
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

/** Locale-aware href for a nav item. */
export function hrefFor(item: NavItem, locale: Locale): string {
	return `${base(locale)}${item.path}`;
}

/** Locale-aware home href (logo target). */
export function homeHref(locale: Locale): string {
	return base(locale) || '/';
}

/** Locale-aware posts-list href (in-page back affordance). */
export function postsHref(locale: Locale): string {
	return `${base(locale)}/posts`;
}

/** Locale-aware search href (header action). */
export function searchHref(locale: Locale): string {
	return `${base(locale)}/search`;
}

/**
 * Active nav section for a path. Locale-stripped, then matched on full path
 * segments so list + detail routes share a section (`/posts` and `/posts/x` →
 * posts; `/study/*` → study; `/system` and `/system/3b` → system) while
 * unrelated routes (`/postscript`, `/studyguide`) do not match. Home/search → null.
 */
export function activeKey(pathname: string): NavKey | null {
	const p = stripLocale(pathname);
	if (/^\/posts(?:\/|$)/.test(p)) return 'posts';
	if (/^\/study(?:\/|$)/.test(p)) return 'study';
	if (/^\/system(?:\/|$)/.test(p)) return 'system';
	if (/^\/about(?:\/|$)/.test(p)) return 'about';
	return null;
}
