import { visit } from 'unist-util-visit';
import type { Root, Code, Parent, Paragraph } from 'mdast';

/**
 * `remark-rehype` reads `data.hName` / `data.hProperties` to build the hast
 * element for a node. Those fields are declared by `mdast-util-to-hast`, whose
 * package.json exports a bare `./index.js` with no types condition, so
 * TypeScript 6 does not resolve the augmentation through an import (TypeScript
 * 7 does). Declaring exactly the two fields this plugin relies on keeps the
 * contract explicit and local; `hProperties` stays assignable to hast
 * `Properties` so both compilers accept the merge.
 */
declare module 'mdast' {
	interface ParagraphData {
		hName?: string;
		hProperties?: Record<string, string>;
	}
}

/**
 * Replace ```mermaid fences with a NEUTRAL AST node, before Shiki runs.
 *
 * This is the one plugin that could not be ported. The SvelteKit original
 * (`src/lib/plugins/remark-mermaid-component.js`) emits a Svelte component, a
 * Svelte template expression, and a `$lib/components/Mermaid.svelte` import --
 * all three are framework-specific, so it is rewritten rather than reused.
 *
 * Ordering is load-bearing and matches the Svelte pipeline's reason for
 * existing: the highlighter must never see a mermaid fence. There it was mdsvex
 * running Shiki before rehype; here it is `@shikijs/rehype`. Either way this
 * plugin runs at the remark stage, so by the time the highlighter looks, the
 * fence is no longer a code node.
 *
 * The emitted node carries `data.hName` / `data.hProperties`, which
 * `remark-rehype` turns into `<mermaid-diagram code="...">`. That element is
 * then mapped to the React client component by the renderer -- a real component
 * boundary, which is why the pipeline returns React elements instead of an HTML
 * string.
 */
export function remarkMermaidNode() {
	return function transform(tree: Root): void {
		visit(tree, 'code', (node: Code, index: number | undefined, parent: Parent | undefined) => {
			if (node.lang !== 'mermaid' || parent == null || index == null) return;
			const replacement: Paragraph = {
				type: 'paragraph',
				children: [],
				data: {
					hName: 'mermaid-diagram',
					hProperties: { code: node.value },
				},
			};
			parent.children[index] = replacement;
		});
	};
}
