import { retext } from 'retext';
import retextSmartypants from 'retext-smartypants';
import { visit } from 'unist-util-visit';
import type { Root, Text } from 'mdast';

/**
 * mdsvex's smart-typography step, ported.
 *
 * mdsvex enables `smartypants: true` BY DEFAULT (`defaults` in its bundle), so
 * every post in the baseline is already typeset: `--` became an em dash 11
 * times in the representative article alone, and straight quotes became curly
 * ones. The first port of that article omitted this entirely and shipped ASCII
 * punctuation -- a difference in the rendered prose of every one of the 334
 * posts, which the page-level text hash reported as one line of noise about
 * character counts.
 *
 * This is deliberately mdsvex's exact mechanism rather than `remark-smartypants`
 * (https://github.com/silvenon/remark-smartypants), which processes the tree as
 * one stream so that a quote can be educated across an inline-element boundary.
 * That is the better algorithm and it is the WRONG one here: the target is the
 * baseline's output, not the best available typography, and mdsvex runs retext
 * over each text node in isolation with default options. Adopting the smarter
 * package would silently change the prose of posts whose quotes straddle a
 * `<code>` or `<em>` span.
 *
 * Position in the pipeline matters and mirrors mdsvex: its transformer is
 * registered BEFORE the user's `remarkPlugins`, so `remark-reading-time` counts
 * and `remark-toc-extract` reads heading text AFTER the substitutions, not
 * before.
 *
 * Code is untouched: `code` and `inlineCode` are their own mdast node types, so
 * visiting `text` never reaches them.
 */
export function remarkSmartTypography() {
	const processor = retext().use(retextSmartypants);
	return (tree: Root) => {
		visit(tree, 'text', (node: Text) => {
			node.value = String(processor.processSync(node.value));
		});
	};
}
