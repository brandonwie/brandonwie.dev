import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeShiki, { type RehypeShikiOptions } from '@shikijs/rehype';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import matter from 'gray-matter';
import type { ReactElement } from 'react';
import { VFile } from 'vfile';
import type { BundledLanguage } from 'shiki';

import { remarkMermaidNode } from './plugins/remark-mermaid-node';
import { remarkSmartTypography } from './plugins/remark-smart-typography';
// Framework-neutral and shared with the SvelteKit app rather than copied, so
// the two stacks cannot drift while both exist. They move into this package
// when SvelteKit is removed and `next/` collapses into the repository root.
import { remarkReadingTime } from '../../../src/lib/plugins/remark-reading-time.js';
import { remarkTocExtract } from '../../../src/lib/plugins/remark-toc-extract.js';
import Mermaid from '../components/Mermaid';

export interface Heading {
	text: string;
	depth: number;
	id: string;
}

export interface RenderedMarkdown {
	/** React elements, not an HTML string: Mermaid has to be a real component. */
	content: ReactElement;
	/** Frontmatter, parsed separately and merged with what the plugins compute. */
	frontmatter: Record<string, unknown>;
	readingTime: number;
	headings: Heading[];
}

/**
 * Languages the SvelteKit build highlights (`svelte.config.js` getHighlighter).
 * Kept identical so a code block that highlighted before still highlights, and
 * one that fell back to plain text still falls back.
 */
export const SHIKI_LANGS: BundledLanguage[] = [
	'javascript',
	'typescript',
	'python',
	'bash',
	'json',
	'yaml',
	'markdown',
	'sql',
	'go',
	'rust',
	'css',
	'html',
	'svelte',
	'jsx',
	'tsx',
	'dockerfile',
	'hcl',
	'terraform',
	'toml',
	'ini',
];

/**
 * `text` appears in the SvelteKit highlighter's language list but is not a
 * bundled Shiki grammar -- it is the special plain-text language, always
 * available. It is the fallback below rather than a loaded grammar, which
 * preserves the existing behavior: an unknown language renders as plain text.
 */

export const SHIKI_THEME = 'github-dark';

/**
 * mdsvex replacement (plan.md Open Decision 6).
 *
 * Order matters twice over:
 *
 *  1. Frontmatter is parsed BEFORE the tree is built, and seeded into
 *     `vFile.data.fm`, because `remark-reading-time` and `remark-toc-extract`
 *     read and extend that object. They are the two plugins that ported
 *     unchanged from the SvelteKit pipeline.
 *  2. `remarkMermaidNode` runs at the REMARK stage, so the highlighter never
 *     sees a mermaid fence. In the Svelte pipeline mdsvex ran Shiki before
 *     rehype; here `@shikijs/rehype` runs after `remark-rehype`. Either way the
 *     fence is gone before highlighting.
 *
 * The result is HAST converted to React elements. Serializing to an HTML string
 * and using `dangerouslySetInnerHTML` would be simpler and would make the
 * mermaid client component impossible to hydrate.
 */
export async function renderMarkdown(source: string): Promise<RenderedMarkdown> {
	const { data: frontmatter, content } = matter(source);

	const processor = unified()
		.use(remarkParse)
		// Before every ported plugin, exactly where mdsvex registers its own
		// smartypants transformer: reading time and the heading list are computed
		// from the typeset text, not the raw source.
		.use(remarkSmartTypography)
		.use(remarkMermaidNode)
		.use(remarkGfm)
		.use(remarkReadingTime)
		.use(remarkTocExtract)
		.use(remarkRehype, { allowDangerousHtml: false })
		.use(rehypeSlug)
		.use(rehypeShiki, {
			theme: SHIKI_THEME,
			langs: SHIKI_LANGS,
			fallbackLanguage: 'text',
		} satisfies RehypeShikiOptions);

	// Frontmatter is seeded onto the vfile BEFORE the transformers run, because
	// remark-reading-time and remark-toc-extract read `data.fm` and extend it.
	const vfile = new VFile({ value: content });
	vfile.data.fm = { ...frontmatter };

	const hast = await processor.run(processor.parse(vfile), vfile);
	const data = (vfile.data.fm ?? {}) as Record<string, unknown>;

	const element = toJsxRuntime(hast, {
		Fragment,
		jsx,
		jsxs,
		components: { 'mermaid-diagram': Mermaid },
		passKeys: true,
		passNode: false,
	});

	return {
		content: element,
		frontmatter: data,
		readingTime: Number(data.readingTime ?? 0),
		headings: (data.headings as Heading[]) ?? [],
	};
}
