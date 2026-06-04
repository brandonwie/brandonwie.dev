import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex'; // markdown processor for Svelte
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { remarkMermaidComponent } from './src/lib/plugins/remark-mermaid-component.js';
import { remarkReadingTime } from './src/lib/plugins/remark-reading-time.js';
import { remarkTocExtract } from './src/lib/plugins/remark-toc-extract.js';

// Cache Shiki highlighter as singleton — store the PROMISE to prevent
// async race conditions where concurrent calls each create a new instance
let _highlighterPromise;

function getHighlighter() {
	if (!_highlighterPromise) {
		_highlighterPromise = (async () => {
			const { createHighlighter } = await import('shiki');
			return createHighlighter({
				themes: ['github-dark'],
				langs: [
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
					'text',
				],
			});
		})();
	}
	return _highlighterPromise;
}

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
	extensions: ['.md', '.svx'],
	remarkPlugins: [remarkMermaidComponent, remarkGfm, remarkReadingTime, remarkTocExtract],
	rehypePlugins: [rehypeSlug],
	highlight: {
		highlighter: async (code, lang = 'text') => {
			const highlighter = await getHighlighter();
			const html = highlighter.codeToHtml(code, { lang, theme: 'github-dark' });
			// Escape backticks and template literal syntax for Svelte
			const escaped = html.replace(/`/g, '&#96;').replace(/\${/g, '&#36;{');
			return `{@html \`${escaped}\`}`;
		},
	},
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md', '.svx'],
	preprocess: [vitePreprocess(), mdsvex(mdsvexOptions)],
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			precompress: true,
			strict: true,
		}),
		prerender: {
			handleHttpError: 'fail',
		},
		alias: {
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$content: 'src/content',
		},
	},
};

export default config;
