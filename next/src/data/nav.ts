import type { Locale } from '../i18n/locale';

/**
 * nav.ts — single source of truth for top-level site navigation.
 *
 * A port of `src/lib/data/nav.ts`. Drives the global `SiteHeader` and `Footer`:
 * the canonical link set, their locale-aware hrefs, and the active-section
 * matcher. Keeping hrefs and active state here means every route inherits the
 * same chrome from one place instead of each page hand-rolling its own header.
 *
 * WHY THE LABELS ARE NOT HERE. The Svelte original stores
 * `label: (locale) => m.nav_about({}, { locale })` on each item. This port
 * keeps the messages out: `i18n/copy.ts`'s header states that it is "the only
 * place messages are read", because under `output: 'export'` every message call
 * must carry an explicit `{ locale }` and letting a second module read them
 * invites a call site that forgets. Labels resolve through
 * `shellCopy(locale).nav`, keyed by `NavKey`, and this module stays pure path
 * logic — which is also what lets the chrome suite assert `activeKey()` and
 * `pathForLocale()` without a DOM or a locale.
 *
 * Placed at `src/data/` beside `study.ts` and `system-snapshot.ts` rather than
 * the `src/lib/data/` the Svelte tree uses: this package has no `src/lib/`, and
 * inventing one for a single file would leave two conventions for data modules.
 */

export type NavKey = 'about' | 'posts' | 'study' | 'system';

export interface NavItem {
	key: NavKey;
	/** Canonical (en) path, without the locale prefix. */
	path: string;
}

/** Canonical nav, in bar order. `system` points at the real 3B destination. */
export const NAV_ITEMS: readonly NavItem[] = [
	{ key: 'about', path: '/about' },
	{ key: 'posts', path: '/posts' },
	{ key: 'study', path: '/study' },
	{ key: 'system', path: '/system/3b' },
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

/**
 * Route prefixes that exist in English only.
 *
 * Talks are delivered in one language, so they have no Korean twin. The Svelte
 * root layout emits hidden locale links so its crawler can reach every locale
 * variant, and pointing that crawler at a `/ko` path that does not exist fails
 * the build under `prerender.handleHttpError: 'fail'`. The Next candidate has
 * no crawler, so nothing here fails a build — but `LanguageToggle` still reads
 * this to avoid offering a switch to a page that does not exist.
 */
const ENGLISH_ONLY_PREFIXES = ['/talks'] as const;

/** Whether a pathname has a counterpart in every locale. */
export function hasLocaleVariant(pathname: string): boolean {
	const path = stripLocale(pathname);
	return !ENGLISH_ONLY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Locale-aware href for a nav item. */
export function hrefFor(item: NavItem, locale: Locale): string {
	return `${base(locale)}${item.path}`;
}

/** Locale-aware home href (logo target). */
export function homeHref(locale: Locale): string {
	return base(locale) || '/';
}

/**
 * Active nav section for a path. Locale-stripped, then matched on full path
 * segments so list and detail routes share a section (`/posts` and `/posts/x`
 * → posts; `/study/*` → study; `/system` and `/system/3b` → system) while
 * unrelated routes (`/postscript`, `/studyguide`) do not match. Home and search
 * → null.
 */
export function activeKey(pathname: string): NavKey | null {
	const p = stripLocale(pathname);
	if (/^\/posts(?:\/|$)/.test(p)) return 'posts';
	if (/^\/study(?:\/|$)/.test(p)) return 'study';
	if (/^\/system(?:\/|$)/.test(p)) return 'system';
	if (/^\/about(?:\/|$)/.test(p)) return 'about';
	return null;
}
