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
// Framework-neutral and shared with the SvelteKit app rather than copied, so
// the two stacks cannot drift while both exist. They move into this package
// when SvelteKit is removed and `next/` collapses into the repository root.
// remarkReadingTime is the exception: the Svelte-side plugin's word count
// depends on remarkMermaidComponent's html-literal output, which this pipeline
// does not produce -- see plugins/remark-reading-time.ts for the parity shim.
import { remarkReadingTime } from './plugins/remark-reading-time';
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

export type ParsedMarkdownSource = Pick<matter.GrayMatterFile<string>, 'data' | 'content'> & {
	/** The raw `---...---` frontmatter block, when the source had one. The
	 * baseline's reading-time count included its words (mdsvex never stripped
	 * fm before the remark chain); the parity plugin counts it from here. */
	fmRaw?: string;
};

/**
 * The raw frontmatter block: an opening `---` at offset 0 through a closing
 * `---` on its own line (optionally at EOF). Anchoring the close to a line
 * start keeps a `key: ---` block scalar from terminating the block early,
 * and the `$` alternative keeps a delimiter at EOF without a trailing
 * newline in the match.
 */
export function frontmatterRaw(source: string): string {
	return source.match(/^---\r?\n[\s\S]*?\n---(?:\r?\n|$)/)?.[0] ?? '';
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
export async function renderMarkdown(
	source: string | ParsedMarkdownSource,
): Promise<RenderedMarkdown> {
	const { data: frontmatter, content: raw } = typeof source === 'string' ? matter(source) : source;
	// Typography is applied to the SOURCE, before this pipeline parses it, and
	// the segmentation is remark-parse 8's rather than micromark's -- see
	// `plugins/remark-smart-typography.ts` for why the boundary has to come from
	// mdsvex's own parser. Everything downstream, reading time and the heading
	// list included, therefore sees the typeset text, which is the order mdsvex
	// used when it ran smartypants before the user's remark plugins.
	const content = educateSource(raw);
	// mdsvex passed the `---` frontmatter block through the same remark chain,
	// so the baseline's reading time counted title/description/tags words too.
	// The parity plugin counts them from this seed -- see
	// `plugins/remark-reading-time.ts` for the reproduction notes.
	const fmRaw = educateSource(
		typeof source === 'string' ? frontmatterRaw(source) : (source.fmRaw ?? ''),
	);

	const processor = unified()
		.use(remarkParse)
		.use(remarkMermaidNode)
		// `singleTilde` defaults to true and turns a lone `~` between two inline
		// code spans into <del> — mdsvex never parsed it, so Korean prose like
		// `T00`~`T24` rendered struck-through on the candidate. GFM only needs
		// the standard `~~` form for real strikethrough.
		.use(remarkGfm, { singleTilde: false })
		.use(remarkReadingTime)
		.use(remarkTocExtract)
		.use(remarkRehype, {
			// Raw HTML stays fail-closed: migration:ast proves the 334-post corpus
			// has no HTML/Svelte-special nodes and rejects any future introduction.
			allowDangerousHtml: false,
		})
		.use(rehypeSlug)
		.use(rehypeShiki, {
			theme: SHIKI_THEME,
			langs: SHIKI_LANGS,
			fallbackLanguage: 'text',
			transformers: [preLanguageAttribute],
		} satisfies RehypeShikiOptions);

	// Frontmatter is seeded onto the vfile BEFORE the transformers run, because
	// remark-reading-time and remark-toc-extract read `data.fm` and extend it.
	const vfile = new VFile({ value: content });
	vfile.data.fm = { ...frontmatter };
	vfile.data.fmRaw = fmRaw;

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
