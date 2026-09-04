/**
 * Palette item registry — the React side of `src/lib/palette/items.ts`.
 *
 * TWO THINGS CHANGED, both forced, and both are cost this spike is here to
 * measure.
 *
 * 1. NAVIGATION IS INJECTED. The Svelte original closes over SvelteKit's
 *    `goto` at module scope (`items.ts:1`), so importing the module binds it
 *    to one router. `useRouter()` is a hook and cannot be called from a plain
 *    module, so every builder here takes a `navigate` function instead. The
 *    upside is that the whole registry became testable without a router: the
 *    harness passes a recorder and reads back the exact href each item would
 *    have pushed.
 *
 * 2. POSTS ARRIVE AS DATA. `listPublishedPosts` reads the filesystem, so it
 *    can only run on the server, and `PaletteItem.run` is a function, which a
 *    Server Component cannot pass to a Client Component. The page therefore
 *    maps its posts down to the serializable `PalettePost` below and the
 *    client builds the closures. This is the same boundary finding PR 2
 *    recorded for the study copy, hit a second time from the other direction:
 *    there the copy held functions, here the items must GROW functions on the
 *    client side of the line.
 *
 * The message calls pass an explicit locale. Under `output: 'export'` there is
 * no request context for Paraglide's ambient locale to live in, and the route
 * group already knows which locale it is, so passing it is both correct and
 * statically analyzable.
 */

import * as m from '@/paraglide/messages';

export type PaletteLocale = 'en' | 'ko';

const GITHUB_REPO_URL = 'https://github.com/brandonwie/brandonwie.dev';
const LINKEDIN_URL = 'https://linkedin.com/in/brandonwie';
const EMAIL = 'brandon@brandonwie.dev';

export type PaletteGroup = 'nav' | 'action' | 'post';

/** The serializable half of a post: what crosses the Server/Client boundary. */
export interface PalettePost {
	slug: string;
	title: string;
	description: string;
	date: string;
	tags: string[];
	category: string;
}

export interface PaletteItem {
	id: string; // unique key (Fuse + React list key)
	group: PaletteGroup; // section bucket
	label: string; // primary text (post title / action label)
	description?: string; // secondary line (post description / route hint)
	keywords?: string[]; // extra search terms (post tags+category+slug, action aliases)
	icon?: string; // glyph for nav/action rows
	run: () => void; // the command; the palette is closed by the caller
	meta?: { category?: string; date?: string; tags?: string[] }; // post-only render extras
}

/** Client navigation, injected. `useRouter().push` in the app, a recorder in
 *  the harness. */
export type Navigate = (href: string) => void;

// Whether the current route is the Korean locale.
export function isKorean(pathname: string): boolean {
	return pathname === '/ko' || pathname.startsWith('/ko/');
}

// Locale-aware absolute path: '/posts' -> '/ko/posts' on KO routes; '/' -> '/ko'.
export function localePath(pathname: string, path: string): string {
	if (!isKorean(pathname)) return path;
	return path === '/' ? '/ko' : `/ko${path}`;
}

// Navigation entries (GO TO). Locale-aware client navigation via `navigate`.
export function buildNavItems(
	pathname: string,
	navigate: Navigate,
	locale: PaletteLocale,
): PaletteItem[] {
	const nav = (id: string, path: string, label: string, icon: string): PaletteItem => ({
		id: `nav:${id}`,
		group: 'nav',
		label,
		description: localePath(pathname, path),
		keywords: [id, path],
		icon,
		run: () => navigate(localePath(pathname, path)),
	});
	const at = { locale };
	return [
		nav('home', '/', m.palette_nav_home({}, at), '⌂'),
		nav('about', '/about', m.palette_nav_about({}, at), '☻'),
		nav('study', '/study', m.palette_nav_study({}, at), '◫'),
		nav('posts', '/posts', m.palette_nav_posts({}, at), '▤'),
		nav('tags', '/tags', m.palette_nav_tags({}, at), '#'),
		nav('projects', '/projects', m.palette_nav_projects({}, at), '◇'),
		nav('contact', '/contact', m.palette_nav_contact({}, at), '✉'),
		nav('search', '/search', m.palette_nav_search({}, at), '⌕'),
		nav('system', '/system/3b', m.palette_nav_system({}, at), '◆'),
	];
}

// Action entries (ACTIONS). Side effects only; the caller closes the palette.
// This registry is the natural customization point — see buildActionItems in
// the task plan's "Learning-mode handoff" note.
export function buildActionItems(
	pathname: string,
	navigate: Navigate,
	locale: PaletteLocale,
): PaletteItem[] {
	const ko = isKorean(pathname);
	const at = { locale };
	return [
		{
			id: 'action:switch-language',
			group: 'action',
			label: m.palette_action_switch_language({}, at),
			keywords: ['language', 'locale', 'korean', 'english', 'ko', 'en', '한국어'],
			icon: '⇆',
			// Mirror LanguageToggle: strip or add the /ko prefix on the current path.
			run: () => navigate(ko ? pathname.replace(/^\/ko/, '') || '/' : `/ko${pathname}`),
		},
		{
			id: 'action:copy-link',
			group: 'action',
			label: m.palette_action_copy_link({}, at),
			keywords: ['copy', 'link', 'url', 'share'],
			icon: '⧉',
			run: () => {
				// Clipboard API can reject (permissions / insecure context); copy is a
				// best-effort convenience with no recovery path here, so ignore failures.
				if (typeof navigator !== 'undefined' && navigator.clipboard) {
					navigator.clipboard.writeText(window.location.href).catch(() => {});
				}
			},
		},
		{
			id: 'action:rss',
			group: 'action',
			label: m.palette_action_rss({}, at),
			keywords: ['rss', 'feed', 'subscribe', 'atom'],
			icon: '»',
			// rss.xml is a prerendered endpoint, not an SPA route — hard-navigate.
			run: () => {
				window.location.href = localePath(pathname, '/rss.xml');
			},
		},
		{
			id: 'action:github',
			group: 'action',
			label: m.palette_action_github({}, at),
			keywords: ['github', 'source', 'code', 'repo', 'repository'],
			icon: '↗',
			run: () => window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer'),
		},
		{
			id: 'action:linkedin',
			group: 'action',
			label: m.palette_action_linkedin({}, at),
			keywords: ['linkedin', 'profile', 'connect', 'work'],
			icon: '↗',
			run: () => window.open(LINKEDIN_URL, '_blank', 'noopener,noreferrer'),
		},
		{
			id: 'action:email',
			group: 'action',
			label: m.palette_action_email({}, at),
			keywords: ['email', 'contact', 'mail', 'hire', 'reach'],
			icon: '✉',
			// mailto: is not an SPA route — hard-navigate.
			run: () => {
				window.location.href = `mailto:${EMAIL}`;
			},
		},
	];
}

// Map a post to a palette item (POSTS). Locale-aware navigation to the detail.
export function postToItem(post: PalettePost, pathname: string, navigate: Navigate): PaletteItem {
	return {
		id: `post:${post.slug}`,
		group: 'post',
		label: post.title,
		description: post.description,
		keywords: [...post.tags, post.category, post.slug],
		run: () => navigate(localePath(pathname, `/posts/${post.slug}`)),
		meta: { category: post.category, date: post.date, tags: post.tags },
	};
}

// Full palette item set for the current route: nav + actions + all posts.
// Empty-query default capping + Fuse ranking happen in FuzzyFinder.
export function buildPaletteItems(
	posts: PalettePost[],
	pathname: string,
	navigate: Navigate,
	locale: PaletteLocale,
): PaletteItem[] {
	return [
		...buildNavItems(pathname, navigate, locale),
		...buildActionItems(pathname, navigate, locale),
		...posts.map((post) => postToItem(post, pathname, navigate)),
	];
}
