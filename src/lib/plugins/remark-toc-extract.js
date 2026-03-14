import { toString } from 'mdast-util-to-string';
import GithubSlugger from 'github-slugger';
import { visit } from 'unist-util-visit';

export function remarkTocExtract() {
	/**
	 * @param {import('mdast').Root} tree
	 * @param {import('vfile').VFile} vFile
	 */
	return function (tree, vFile) {
		const slugger = new GithubSlugger();
		/** @type {Array<{ text: string; depth: number; id: string }>} */
		const headings = [];

		visit(tree, 'heading', (node) => {
			// Only collect h2 and h3 for ToC
			if (node.depth === 2 || node.depth === 3) {
				const text = toString(node);
				const id = slugger.slug(text);
				headings.push({ text, depth: node.depth, id });
			}
		});

		const fm = /** @type {Record<string, unknown>} */ (vFile.data.fm ?? {});
		fm.headings = headings;
		vFile.data.fm = fm;
	};
}
