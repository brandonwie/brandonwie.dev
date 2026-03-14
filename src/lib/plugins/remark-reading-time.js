import { toString } from 'mdast-util-to-string';

export function remarkReadingTime() {
	/**
	 * @param {import('mdast').Root} tree
	 * @param {import('vfile').VFile} vFile
	 */
	return function (tree, vFile) {
		const text = toString(tree);
		const words = text.split(/\s+/).filter(Boolean).length;
		const minutes = Math.max(1, Math.ceil(words / 200));
		const fm = /** @type {Record<string, unknown>} */ (vFile.data.fm ?? {});
		fm.readingTime = minutes;
		vFile.data.fm = fm;
	};
}
