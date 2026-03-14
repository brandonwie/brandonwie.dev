import Fuse from 'fuse.js';
import type { PostMetadata } from './stores/posts';

export interface FuzzyResult {
	item: PostMetadata;
	score: number;
	matches?: ReadonlyArray<{
		indices: ReadonlyArray<readonly [number, number]>;
		key?: string;
		value?: string;
	}>;
}

// Create Fuse instance for posts
export function createPostsFuse(posts: PostMetadata[]): Fuse<PostMetadata> {
	return new Fuse(posts, {
		keys: [
			{ name: 'title', weight: 0.4 },
			{ name: 'description', weight: 0.2 },
			{ name: 'tags', weight: 0.2 },
			{ name: 'category', weight: 0.1 },
			{ name: 'slug', weight: 0.1 },
		],
		threshold: 0.4,
		includeScore: true,
		includeMatches: true,
		minMatchCharLength: 2,
	});
}

// Search posts with fuzzy matching
export function fuzzySearch(fuse: Fuse<PostMetadata>, query: string): FuzzyResult[] {
	if (!query.trim()) {
		return [];
	}

	const results = fuse.search(query);
	return results.map((result) => ({
		item: result.item,
		score: result.score ?? 1,
		matches: result.matches,
	}));
}

// Highlight matched characters in text
export function highlightMatches(
	text: string,
	indices: ReadonlyArray<readonly [number, number]>,
): { text: string; highlighted: boolean }[] {
	if (!indices || indices.length === 0) {
		return [{ text, highlighted: false }];
	}

	const result: { text: string; highlighted: boolean }[] = [];
	let lastIndex = 0;

	for (const [start, end] of indices) {
		// Add non-highlighted text before match
		if (start > lastIndex) {
			result.push({ text: text.slice(lastIndex, start), highlighted: false });
		}
		// Add highlighted match
		result.push({ text: text.slice(start, end + 1), highlighted: true });
		lastIndex = end + 1;
	}

	// Add remaining text
	if (lastIndex < text.length) {
		result.push({ text: text.slice(lastIndex), highlighted: false });
	}

	return result;
}
