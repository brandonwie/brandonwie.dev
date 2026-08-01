import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { Component } from 'svelte';
import socialLinksBySlug from '$lib/data/social-links.json';

interface SocialLink {
	url: string;
	label: string;
}

const socialLinks = socialLinksBySlug as Record<string, SocialLink[]>;

// POST MODULE TYPE
// ----------------
// mdsvex compiles markdown files into Svelte components.
// Each .md file exports:
// - default: The Svelte component (rendered content)
// - metadata: Frontmatter parsed as an object
interface PostModule {
	default: Component; // Svelte component type for proper TypeScript inference
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
	};
}

// Pre-load English post modules
const modules = import.meta.glob('../../../content/posts/en/**/*.md');
const koModules = import.meta.glob('../../../content/posts/ko/**/*.md');

export const load: PageLoad = async ({ params }) => {
	const hasKoreanTranslation = Object.keys(koModules).some((path) =>
		path.endsWith(`/${params.slug}.md`),
	);

	// Find the matching post by slug
	for (const [path, resolver] of Object.entries(modules)) {
		if (path.endsWith(`/${params.slug}.md`)) {
			const post = (await resolver()) as PostModule;
			// Retired posts (draft: true) are already hidden from listings, RSS, and
			// the sitemap. Make the direct URL unreachable too, so retiring a post
			// that failed a content-integrity gate actually withdraws it.
			if (post.metadata.draft) error(404, `Post not found: ${params.slug}`);
			const { headings, ...meta } = post.metadata;
			return {
				content: post.default,
				meta: {
					...meta,
					slug: params.slug,
				},
				headings: headings ?? [],
				hasKoreanTranslation,
				socialLinks: socialLinks[params.slug] ?? [],
			};
		}
	}

	throw new Error(`Post not found: ${params.slug}`);
};
