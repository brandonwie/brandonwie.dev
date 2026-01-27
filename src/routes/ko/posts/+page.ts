import type { PageLoad } from './$types';

interface PostModule {
	metadata: {
		title: string;
		description: string;
		date: string;
		updated?: string;
		tags: string[];
		category: string;
		draft?: boolean;
		lang?: string;
	};
}

export interface PostEntry {
	slug: string;
	title: string;
	description: string;
	date: string;
	updated?: string;
	tags: string[];
	category: string;
	draft?: boolean;
	lang?: string;
}

// Load Korean posts, with fallback to English
const koModules = import.meta.glob('../../../content/posts/ko/**/*.md');
const enModules = import.meta.glob('../../../content/posts/en/**/*.md');

export const load: PageLoad = async () => {
	const posts: PostEntry[] = [];
	const koSlugs = new Set<string>();

	// First, load Korean posts
	for (const [path, resolver] of Object.entries(koModules)) {
		const post = (await resolver()) as PostModule;
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';

		if (post.metadata.draft) continue;

		koSlugs.add(slug);
		posts.push({
			slug,
			...post.metadata,
			lang: 'ko'
		});
	}

	// Then, load English posts that don't have Korean translations
	for (const [path, resolver] of Object.entries(enModules)) {
		const post = (await resolver()) as PostModule;
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';

		if (post.metadata.draft) continue;
		if (koSlugs.has(slug)) continue; // Skip if Korean translation exists

		posts.push({
			slug,
			...post.metadata,
			lang: 'en' // Mark as English fallback
		});
	}

	// Sort by date (newest first)
	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return { posts };
};
