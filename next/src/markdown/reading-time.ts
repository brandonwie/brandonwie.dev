import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

// GFM, so a table counts its cell text and not its pipes and rules.
const parser = unified().use(remarkParse).use(remarkGfm, { singleTilde: false });

const HANGUL = /[가-힣]/g;

/**
 * Minutes to read a Markdown body: 200 words a minute, and 500 syllables a
 * minute for Hangul, which whitespace does not split into comparable words.
 * Never less than one minute.
 */
export function readingMinutes(markdown: string): number {
	const tree = parser.parse(markdown) as Root;
	// A diagram is looked at, not read: its source does not count.
	visit(tree, 'code', (node, index, parent) => {
		if (node.lang !== 'mermaid' || !parent || index === undefined) return;
		parent.children.splice(index, 1);
		return [SKIP, index];
	});

	const text = toString(tree);
	const syllables = text.match(HANGUL)?.length ?? 0;
	const words = text.replace(HANGUL, ' ').split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.ceil(words / 200 + syllables / 500));
}
