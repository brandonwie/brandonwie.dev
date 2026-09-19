import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import type { Root, Html } from 'mdast';
import type { VFile } from 'vfile';

/**
 * Reading-time parity with the Svelte pipeline.
 *
 * The shared `remarkReadingTime` counts `toString(tree)` words. The baseline's
 * tree differed from this pipeline's in two ways, and both inflated its count:
 *
 * 1. FRONTMATTER. mdsvex ran the remark plugins on the source WITH the `---`
 *    frontmatter block still attached, so title/description/tags text counted
 *    as words (~60-80 per post). Reproduced against the built baseline:
 *    `a-harness-that-fixes-itself` needs 1043 words for its displayed 6 min,
 *    reachable only when the fm block is parsed and counted. The pipeline
 *    seeds the educated fm block onto `vfile.data.fmRaw`; this plugin parses
 *    it the way the baseline's single-tree parse saw it and adds the words.
 *
 * 2. MERMAID LITERALS. `remarkMermaidComponent` replaced each ```mermaid fence
 *    with an `html` node whose literal was
 *    `<Mermaid code={\`...escaped source...\`} />`, so the diagram source and
 *    wrapper tokens counted (~500 words on the AWS architecture posts, a 2-3
 *    minute swing). Posts with mermaid also gained the plugin's injected
 *    `<script>import Mermaid ...</script>` block (6 words, or 4 when merged
 *    into an existing script block). The port's `remarkMermaidNode` emits an
 *    empty `mermaid-diagram` paragraph, so none of that is visible to
 *    `toString`; the baseline-equivalent literals are counted back here.
 *
 * This plugin replaces `remarkReadingTime` in the candidate pipeline. It
 * writes frontmatter only; the tree is untouched.
 */
export function remarkReadingTime() {
	return function transform(tree: Root, vFile: VFile): void {
		let extra = 0;

		const fmRaw = typeof vFile.data.fmRaw === 'string' ? vFile.data.fmRaw : '';
		if (fmRaw) {
			const fmTree = unified().use(remarkParse).parse(fmRaw);
			extra += toString(fmTree).split(/\s+/).filter(Boolean).length;
		}

		let hasMermaid = false;
		visit(tree, 'paragraph', (node) => {
			if (node.data?.hName !== 'mermaid-diagram') return;
			hasMermaid = true;
			const code = String(node.data.hProperties?.code ?? '');
			const escaped = code.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
			extra += `<Mermaid code={\`${escaped}\`} />`.split(/\s+/).filter(Boolean).length;
		});
		if (hasMermaid) {
			let hasScriptBlock = false;
			visit(tree, 'html', (node: Html) => {
				if (/^<script[\s>]/.test(node.value.trim())) hasScriptBlock = true;
			});
			extra += hasScriptBlock ? 4 : 6;
		}

		const words = toString(tree).split(/\s+/).filter(Boolean).length;
		const fm = (vFile.data.fm ?? {}) as Record<string, unknown>;
		fm.readingTime = Math.max(1, Math.ceil((words + extra) / 200));
		vFile.data.fm = fm;
	};
}
