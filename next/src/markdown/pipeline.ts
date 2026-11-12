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
import { educateSource } from './plugins/remark-smart-typography';
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
	headings: Heading[];
}

export type ParsedMarkdownSource = Pick<matter.GrayMatterFile<string>, 'data' | 'content'>;

/** Languages the build highlights. A fence in any other language renders as plain text. */
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
 * One theme per colour scheme. With `defaultColor: false` Shiki writes both
 * colours on every token as `--shiki-light` and `--shiki-dark`, and
 * `src/app.css` picks one with `light-dark()`.
 */
export const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const;

/**
 * Stamps the fence language onto each highlighted `<pre>` as `data-language`,
 * so the client `CodeCopy` frame label can read `<language> · <n> lines`.
 *
 * `this.options.lang` is the language Shiki actually highlighted with: the
 * fence id as written (`ts`, `typescript`, `bash`, ...) or, for a fence whose
 * language is not in SHIKI_LANGS, the `text` fallback. A fence with NO
 * language is never highlighted (no `defaultLanguage`), so it has no `.shiki`
 * `<pre>` and no frame label either. The attribute sits on `<pre>`, outside
 * `<code>`, so copied text is unaffected.
 */
// Typed through the plugin's own options: `shiki` and `@shikijs/rehype` resolve
// different `@shikijs/types` patch versions, whose transformer types disagree.
const preLanguageAttribute: NonNullable<RehypeShikiOptions['transformers']>[number] = {
	name: 'pre-data-language',
	pre(node) {
		node.properties['data-language'] = this.options.lang;
	},
};

/**
 * Markdown to React elements.
 *
 * Order matters twice over:
 *
 *  1. Frontmatter is parsed BEFORE the tree is built, and seeded into
 *     `vFile.data.fm`, because `remark-toc-extract` reads and extends that
 *     object.
 *  2. `remarkMermaidNode` runs at the REMARK stage, so the highlighter never
 *     sees a mermaid fence.
 *
 * The result is HAST converted to React elements. Serializing to an HTML string
 * and using `dangerouslySetInnerHTML` would be simpler and would make the
 * mermaid client component impossible to hydrate.
 */
export async function renderMarkdown(
	source: string | ParsedMarkdownSource,
): Promise<RenderedMarkdown> {
	const { data: frontmatter, content: raw } = typeof source === 'string' ? matter(source) : source;
	// Typography is applied to the SOURCE, before this pipeline parses it, with
	// text nodes found by this pipeline's own parser configuration -- see
	// `plugins/remark-smart-typography.ts`. Everything downstream, the heading
	// list included, therefore sees the typeset text.
	const content = educateSource(raw);

	const processor = unified()
		.use(remarkParse)
		.use(remarkMermaidNode)
		// `singleTilde` defaults to true and turns a lone `~` between two inline
		// code spans into <del>, so Korean prose like `T00`~`T24` rendered
		// struck-through. GFM only needs the standard `~~` form for real
		// strikethrough.
		.use(remarkGfm, { singleTilde: false })
		.use(remarkTocExtract)
		.use(remarkRehype, {
			// Raw HTML stays fail-closed: raw HTML nodes in posts are dropped, never
			// rendered.
			allowDangerousHtml: false,
		})
		.use(rehypeSlug)
		.use(rehypeShiki, {
			themes: SHIKI_THEMES,
			defaultColor: false,
			langs: SHIKI_LANGS,
			fallbackLanguage: 'text',
			transformers: [preLanguageAttribute],
		} satisfies RehypeShikiOptions);

	// Frontmatter is seeded onto the vfile BEFORE the transformers run, because
	// remark-toc-extract reads `data.fm` and extends it.
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
		headings: (data.headings as Heading[]) ?? [],
	};
}
