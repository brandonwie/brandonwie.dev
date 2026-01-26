import { writable, derived } from 'svelte/store';

export interface PostMetadata {
	slug: string;
	title: string;
	description: string;
	date: string;
	updated?: string;
	tags: string[];
	category: string;
	draft?: boolean;
}

export interface Post extends PostMetadata {
	content: string;
}

// All posts metadata
export const posts = writable<PostMetadata[]>([]);

// Posts organized by category
export const postsByCategory = derived(posts, ($posts) => {
	const grouped: Record<string, PostMetadata[]> = {};

	for (const post of $posts) {
		if (!grouped[post.category]) {
			grouped[post.category] = [];
		}
		grouped[post.category].push(post);
	}

	// Sort posts within each category by date (newest first)
	for (const category of Object.keys(grouped)) {
		grouped[category].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}

	return grouped;
});

// All unique categories
export const categories = derived(posts, ($posts) => {
	const cats = new Set<string>();
	for (const post of $posts) {
		cats.add(post.category);
	}
	return Array.from(cats).sort();
});

// All unique tags
export const allTags = derived(posts, ($posts) => {
	const tags = new Set<string>();
	for (const post of $posts) {
		for (const tag of post.tags) {
			tags.add(tag);
		}
	}
	return Array.from(tags).sort();
});

// Search posts by query
export function searchPosts(query: string, postList: PostMetadata[]): PostMetadata[] {
	const lowerQuery = query.toLowerCase();
	return postList.filter(
		(post) =>
			post.title.toLowerCase().includes(lowerQuery) ||
			post.description.toLowerCase().includes(lowerQuery) ||
			post.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
			post.category.toLowerCase().includes(lowerQuery)
	);
}
