import type { LayoutLoad } from './$types';
import type { PostMetadata } from '$lib/stores/posts';
import { effectiveDate } from '$lib/utils/date';

// Prerender all pages for static site generation
export const prerender = true;

// Trailing slashes config
export const trailingSlash = 'never';

// eager: true — resolves all imports at build time (no async waterfall)
// import: 'metadata' — imports only frontmatter, skips heavy compiled Svelte components
const enModules = import.meta.glob('../content/posts/en/**/*.md', {
	import: 'metadata',
	eager: true,
}) as Record<string, PostMetadata>;

const koModules = import.meta.glob('../content/posts/ko/**/*.md', {
	import: 'metadata',
	eager: true,
}) as Record<string, PostMetadata>;

function collectPosts(modules: Record<string, PostMetadata>): PostMetadata[] {
	const posts: PostMetadata[] = [];

	for (const [path, metadata] of Object.entries(modules)) {
		if (metadata.draft) continue;

		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		posts.push({ ...metadata, slug });
	}

	posts.sort(
		(a, b) =>
			new Date(effectiveDate(b.date, b.updated)).getTime() -
			new Date(effectiveDate(a.date, a.updated)).getTime(),
	);

	return posts;
}

// Hydrate the posts store site-wide so the command palette works on every route,
// not just the home page (folds ARCH-1). Locale-aware: /ko routes get Korean posts.
export const load: LayoutLoad = ({ url }) => {
	const posts = collectPosts(url.pathname.startsWith('/ko') ? koModules : enModules);
	return { posts };
};
