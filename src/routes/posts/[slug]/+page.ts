import type { PageLoad } from './$types';

interface PostModule {
	default: unknown;
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

// Pre-load all post modules
const modules = import.meta.glob('../../../content/posts/**/*.md');

export const load: PageLoad = async ({ params }) => {
	// Find the matching post by slug
	for (const [path, resolver] of Object.entries(modules)) {
		if (path.endsWith(`/${params.slug}.md`)) {
			const post = (await resolver()) as PostModule;
			return {
				content: post.default,
				meta: {
					...post.metadata,
					slug: params.slug
				}
			};
		}
	}

	throw new Error(`Post not found: ${params.slug}`);
};
