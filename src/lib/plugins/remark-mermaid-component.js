import { visit } from 'unist-util-visit';

/**
 * Remark plugin that transforms ```mermaid code fences into <Mermaid /> Svelte components.
 *
 * Why this exists: mdsvex runs Shiki (syntax highlighter) BEFORE rehype plugins,
 * so ```mermaid blocks get turned into <pre><code> elements before any rehype plugin
 * can intercept them. Remark plugins run BEFORE Shiki, so we can catch and replace
 * mermaid blocks here.
 *
 * @returns {(tree: import('mdast').Root) => void}
 */
export function remarkMermaidComponent() {
	return function (tree) {
		let hasMermaid = false;

		// Transform mermaid code blocks → Mermaid Svelte component
		visit(tree, 'code', (node, index, parent) => {
			if (node.lang !== 'mermaid') return;
			hasMermaid = true;

			// Escape backticks and template literal syntax for Svelte template string
			const escaped = node.value.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

			parent.children[index] = {
				type: 'html',
				value: `<Mermaid code={\`${escaped}\`} />`,
			};
		});

		// Inject Mermaid component import if any mermaid blocks were found
		if (hasMermaid) {
			let injected = false;

			// Try to merge with existing <script> block
			visit(tree, 'html', (node) => {
				if (!injected && /^<script[\s>]/.test(node.value.trim())) {
					if (!node.value.includes('import Mermaid from')) {
						node.value = node.value.replace(
							/(<script[^>]*>)/,
							`$1\nimport Mermaid from '$lib/components/Mermaid.svelte';`,
						);
					}
					injected = true;
				}
			});

			// No existing <script> block — create one
			if (!injected) {
				tree.children.unshift({
					type: 'html',
					value: "<script>\nimport Mermaid from '$lib/components/Mermaid.svelte';\n</script>",
				});
			}
		}
	};
}
