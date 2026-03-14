import type { PageLoad } from './$types';
import type { Component } from 'svelte';

/**
 * Korean Post Loader with English Fallback
 *
 * Attempts to load Korean translation first.
 * Falls back to English content if Korean doesn't exist.
 */

interface PostModule {
	default: Component;
	metadata: {
		title: string;
		description: string;
		date: string;
		updated?: string;
		tags: string[];
		category: string;
		draft?: boolean;
		readingTime?: number;
		headings?: Array<{ text: string; depth: number; id: string }>;
		lang?: string;
	};
}

// Pre-load all post modules for both languages
const koModules = import.meta.glob('../../../../content/posts/ko/**/*.md');
const enModules = import.meta.glob('../../../../content/posts/en/**/*.md');

export const load: PageLoad = async ({ params }) => {
	const { slug } = params;

	// Try Korean first
	for (const [path, resolver] of Object.entries(koModules)) {
		if (path.endsWith(`/${slug}.md`)) {
			const post = (await resolver()) as PostModule;
			const { headings, ...meta } = post.metadata;
			return {
				content: post.default,
				meta: {
					...meta,
					slug,
					lang: 'ko',
				},
				headings: headings ?? [],
				isFallback: false,
				requestedLang: 'ko',
			};
		}
	}

	// Fallback to English
	for (const [path, resolver] of Object.entries(enModules)) {
		if (path.endsWith(`/${slug}.md`)) {
			const post = (await resolver()) as PostModule;
			const { headings: enHeadings, ...enMeta } = post.metadata;
			return {
				content: post.default,
				meta: {
					...enMeta,
					slug,
					lang: 'en',
				},
				headings: enHeadings ?? [],
				isFallback: true,
				requestedLang: 'ko',
			};
		}
	}

	throw new Error(`Post not found: ${slug}`);
};
