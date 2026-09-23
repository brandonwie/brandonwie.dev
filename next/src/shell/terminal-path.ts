import { NAV_ITEMS, activeKey, base, stripLocale, type NavKey } from '@/data/nav';
import type { Locale } from '@/i18n/locale';

/**
 * Pure path logic for the Phosphor Fade terminal shell: the title-bar cwd (D2)
 * and the tmux status-line windows (D3). No DOM and no messages, so the
 * assertion script can exercise every rule directly.
 *
 * D2 — the cwd is the real URL path: `/ko/projects` shows `~/ko/projects`.
 * D3 — the fixed windows are `0:home 1:posts 2:study 3:3b 4:about`; any other
 * route appends a temporary `5:<first segment>*` window.
 */

export type WindowKey = 'home' | NavKey;

export interface StatusWindow {
	readonly key: WindowKey;
	readonly index: number;
	/** tmux window name. Chrome, not copy: identical in both locales. */
	readonly label: string;
}

/** Fixed windows in status-line order. Hrefs resolve through `@/data/nav`. */
export const STATUS_WINDOWS: readonly StatusWindow[] = [
	{ key: 'home', index: 0, label: 'home' },
	{ key: 'posts', index: 1, label: 'posts' },
	{ key: 'study', index: 2, label: 'study' },
	{ key: 'system', index: 3, label: '3b' },
	{ key: 'about', index: 4, label: 'about' },
];

/** Index shown on the temporary window an off-nav route appends. */
export const EXTRA_WINDOW_INDEX = STATUS_WINDOWS.length;

export interface StatusState {
	/** The fixed window to mark, or null when the route is off-nav. */
	readonly active: WindowKey | null;
	/** Name of the temporary window for an off-nav route, or null. */
	readonly extra: string | null;
}

/** Decodes percent-escapes for display; a malformed escape is shown raw. */
function decodeForDisplay(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** Pathname without a trailing slash (root stays `/`). */
export function normalizePathname(pathname: string): string {
	if (!pathname) return '/';
	const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	return trimmed || '/';
}

/**
 * Title-bar and prompt cwd for a pathname.
 *
 * @example cwdFor('/') === '~'
 * @example cwdFor('/ko/projects') === '~/ko/projects'
 */
export function cwdFor(pathname: string): string {
	const path = normalizePathname(pathname);
	return path === '/' ? '~' : `~${decodeForDisplay(path)}`;
}

/** Locale-aware href for a fixed window. */
export function windowHref(key: WindowKey, locale: Locale): string {
	if (key === 'home') return base(locale) || '/';
	const item = NAV_ITEMS.find((candidate) => candidate.key === key);
	if (!item) throw new Error(`terminal-path: no NAV_ITEMS entry for window '${key}'`);
	return `${base(locale)}${item.path}`;
}

/**
 * Which status-line window a pathname marks.
 *
 * Home is `/` or `/ko`. Nav sections reuse `activeKey()`, so `/system` and
 * `/system/3b` both light `3:3b`. Everything else appends a temporary window
 * named after its first path segment (`/talks/my-career` → `talks`).
 */
export function statusWindowFor(pathname: string): StatusState {
	const path = stripLocale(normalizePathname(pathname));
	if (path === '/') return { active: 'home', extra: null };

	const key = activeKey(path);
	if (key) return { active: key, extra: null };

	const first = path.split('/')[1] ?? '';
	return { active: null, extra: first ? decodeForDisplay(first) : null };
}
