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
import type { Element, Root as HastRoot } from 'hast';
import type { ReactElement } from 'react';
import { EXIT, SKIP, visit } from 'unist-util-visit';
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
 * which `rehypeCodeFrame` reads for the bar above the block.
 *
 * `this.options.lang` is the language Shiki actually highlighted with: the
 * fence id as written (`ts`, `typescript`, `bash`, ...) or, for a fence whose
 * language is not in SHIKI_LANGS, the `text` fallback. A fence with NO
 * language is never highlighted (no `defaultLanguage`), so it has no language
 * to show.
 */
// Typed through the plugin's own options: `shiki` and `@shikijs/rehype` resolve
// different `@shikijs/types` patch versions, whose transformer types disagree.
const preLanguageAttribute: NonNullable<RehypeShikiOptions['transformers']>[number] = {
	name: 'pre-data-language',
	pre(node) {
		node.properties['data-language'] = this.options.lang;
	},
};

/** Each h2 to h4 links to itself, so a reader can copy the address of a section. */
function rehypeHeadingLinks() {
	return (tree: HastRoot) => {
		visit(tree, 'element', (node) => {
			if (!/^h[234]$/.test(node.tagName) || typeof node.properties.id !== 'string') return;
			// A link inside a link is invalid HTML: a heading that already has one stays as it is.
			let hasLink = false;
			visit(node, 'element', (inner) => {
				if (inner.tagName !== 'a') return;
				hasLink = true;
				return EXIT;
			});
			if (hasLink) return;
			node.children = [
				{
					type: 'element',
					tagName: 'a',
					properties: { href: `#${node.properties.id}` },
					children: node.children,
				},
			];
		});
	};
}

/**
 * Wraps each code block in a figure with a bar above it: the language and a
 * copy button. The button is server-rendered; `CodeCopy` gives it its action.
 */
function rehypeCodeFrame({ copyLabel }: { copyLabel: string }) {
	return (tree: HastRoot) => {
		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'pre' || !parent || index === undefined) return;
			const language = node.properties['data-language'];
			const frame: Element = {
				type: 'element',
				tagName: 'figure',
				properties: { className: ['code'] },
				children: [
					{
						type: 'element',
						tagName: 'figcaption',
						properties: {},
						children: [
							{
								type: 'element',
								tagName: 'span',
								properties: {},
								children: [{ type: 'text', value: typeof language === 'string' ? language : '' }],
							},
							{
								type: 'element',
								tagName: 'button',
								properties: { type: 'button', className: ['code__copy'] },
								children: [{ type: 'text', value: copyLabel }],
							},
						],
					},
					node,
				],
			};
			parent.children[index] = frame;
			// The `pre` is now inside the frame: do not visit it again.
			return SKIP;
		});
	};
}

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
	{ copyLabel = 'Copy' }: { copyLabel?: string } = {},
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
		} satisfies RehypeShikiOptions)
		.use(rehypeHeadingLinks)
		.use(rehypeCodeFrame, { copyLabel });

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
