import { goto } from '$app/navigation';
import { m } from '$lib/paraglide/messages';
import type { PostMetadata } from '$lib/stores/posts';

const GITHUB_REPO_URL = 'https://github.com/brandonwie/brandonwie.dev';
const LINKEDIN_URL = 'https://linkedin.com/in/brandonwie';
const EMAIL = 'brandon@brandonwie.dev';

export type PaletteGroup = 'nav' | 'action' | 'post';

export interface PaletteItem {
	id: string; // unique key (Fuse + {#each} key)
	group: PaletteGroup; // section bucket
	label: string; // primary text (post title / action label)
	description?: string; // secondary line (post description / route hint)
	keywords?: string[]; // extra search terms (post tags+category+slug, action aliases)
	icon?: string; // glyph for nav/action rows
	run: () => void; // the command; the palette is closed by the caller
	meta?: { category?: string; date?: string; tags?: string[] }; // post-only render extras
}

// Whether the current route is the Korean locale.
function isKorean(pathname: string): boolean {
	return pathname === '/ko' || pathname.startsWith('/ko/');
}

// Locale-aware absolute path: '/posts' -> '/ko/posts' on KO routes; '/' -> '/ko'.
function localePath(pathname: string, path: string): string {
	if (!isKorean(pathname)) return path;
	return path === '/' ? '/ko' : `/ko${path}`;
}

// Navigation entries (GO TO). Locale-aware client navigation via goto.
export function buildNavItems(pathname: string): PaletteItem[] {
	const nav = (id: string, path: string, label: string, icon: string): PaletteItem => ({
		id: `nav:${id}`,
		group: 'nav',
		label,
		description: localePath(pathname, path),
		keywords: [id, path],
		icon,
		run: () => goto(localePath(pathname, path)),
	});
	return [
		nav('home', '/', m.palette_nav_home(), '⌂'),
		nav('about', '/about', m.palette_nav_about(), '☻'),
		nav('study', '/study', m.palette_nav_study(), '◫'),
		nav('posts', '/posts', m.palette_nav_posts(), '▤'),
		nav('search', '/search', m.palette_nav_search(), '⌕'),
		nav('system', '/system/3b', m.palette_nav_system(), '◆'),
	];
}

// Action entries (ACTIONS). Side effects only; the caller closes the palette.
// This registry is the natural customization point — see buildActionItems in
// the task plan's "Learning-mode handoff" note.
export function buildActionItems(pathname: string): PaletteItem[] {
	const ko = isKorean(pathname);
	return [
		{
			id: 'action:switch-language',
			group: 'action',
			label: m.palette_action_switch_language(),
			keywords: ['language', 'locale', 'korean', 'english', 'ko', 'en', '한국어'],
			icon: '⇆',
			// Mirror LanguageToggle: strip or add the /ko prefix on the current path.
			run: () => goto(ko ? pathname.replace(/^\/ko/, '') || '/' : `/ko${pathname}`),
		},
		{
			id: 'action:copy-link',
			group: 'action',
			label: m.palette_action_copy_link(),
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
			label: m.palette_action_rss(),
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
			label: m.palette_action_github(),
			keywords: ['github', 'source', 'code', 'repo', 'repository'],
			icon: '↗',
			run: () => window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer'),
		},
		{
			id: 'action:linkedin',
			group: 'action',
			label: m.palette_action_linkedin(),
			keywords: ['linkedin', 'profile', 'connect', 'work'],
			icon: '↗',
			run: () => window.open(LINKEDIN_URL, '_blank', 'noopener,noreferrer'),
		},
		{
			id: 'action:email',
			group: 'action',
			label: m.palette_action_email(),
			keywords: ['email', 'contact', 'mail', 'hire', 'reach'],
			icon: '✉',
			// mailto: is not an SPA route — hard-navigate.
			run: () => {
				window.location.href = `mailto:${EMAIL}`;
			},
		},
	];
}

// Map a post to a palette item (POSTS). Locale-aware goto to the post detail.
export function postToItem(post: PostMetadata, pathname: string): PaletteItem {
	return {
		id: `post:${post.slug}`,
		group: 'post',
		label: post.title,
		description: post.description,
		keywords: [...post.tags, post.category, post.slug],
		run: () => goto(localePath(pathname, `/posts/${post.slug}`)),
		meta: { category: post.category, date: post.date, tags: post.tags },
	};
}

// Full palette item set for the current route: nav + actions + all posts.
// Empty-query default capping + Fuse ranking happen in FuzzyFinder.
export function buildPaletteItems(posts: PostMetadata[], pathname: string): PaletteItem[] {
	return [
		...buildNavItems(pathname),
		...buildActionItems(pathname),
		...posts.map((post) => postToItem(post, pathname)),
	];
}
