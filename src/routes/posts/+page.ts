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
	const modules = import.meta.glob('../../content/posts/**/*.md');
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
