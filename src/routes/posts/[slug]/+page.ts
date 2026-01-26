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

export const load: PageLoad = async ({ params }) => {
	try {
		// Dynamic import of markdown file
		const post = (await import(`../../../content/posts/**/${params.slug}.md`)) as PostModule;

		return {
			content: post.default,
			meta: {
				...post.metadata,
				slug: params.slug
			}
		};
	} catch {
		// Try to find in any category directory
		const modules = import.meta.glob('../../../content/posts/**/*.md');

		for (const path of Object.keys(modules)) {
			if (path.endsWith(`/${params.slug}.md`)) {
				const post = (await modules[path]()) as PostModule;
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
	}
};
