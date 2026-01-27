/**
 * +page.ts - Home Page Data Loader
 *
 * Loads all English blog posts for the FuzzyFinder search.
 * This runs during both SSR and client-side navigation.
 */
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
}

export const load: PageLoad = async () => {
	// Load only English posts
	const modules = import.meta.glob('../content/posts/en/**/*.md');
	const posts: PostEntry[] = [];

	for (const [path, resolver] of Object.entries(modules)) {
		const post = (await resolver()) as PostModule;
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';

		// Skip drafts in production
		if (post.metadata.draft) continue;

		posts.push({
			slug,
			...post.metadata
		});
	}

	// Sort by date (newest first)
	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return { posts };
};
