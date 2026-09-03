/**
 * Fuse.js wrapper for the command palette — the React side of `src/lib/fuzzy.ts`.
 *
 * WHAT CHANGED: the import specifier of `PaletteItem`, and nothing else. Fuse
 * is framework-agnostic, the weights and thresholds are the ranking contract,
 * and `highlightMatches` is a pure string split. A port that "improved" any of
 * the four Fuse options here would change which results come back and in what
 * order, on a surface whose whole job is which results come back and in what
 * order, so the numbers are transcribed rather than reconsidered.
 */

import Fuse from 'fuse.js';

import type { PaletteItem } from './items';

export interface FuzzyResult {
	item: PaletteItem;
	score: number;
	matches?: ReadonlyArray<{
		indices: ReadonlyArray<readonly [number, number]>;
		key?: string;
		value?: string;
	}>;
}

// Create a Fuse instance over palette items (nav, actions, posts).
export function createPaletteFuse(items: PaletteItem[]): Fuse<PaletteItem> {
	return new Fuse(items, {
		keys: [
			{ name: 'label', weight: 0.5 },
			{ name: 'keywords', weight: 0.3 },
			{ name: 'description', weight: 0.2 },
		],
		threshold: 0.4,
		includeScore: true,
		includeMatches: true,
		minMatchCharLength: 2,
	});
}

// Search palette items with fuzzy matching
export function fuzzySearch(fuse: Fuse<PaletteItem>, query: string): FuzzyResult[] {
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
