import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex'; // markdown processor for Svelte
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
	extensions: ['.md', '.svx'],
	remarkPlugins: [remarkGfm],
	rehypePlugins: [rehypeSlug],
	highlight: {
		highlighter: async (code, lang = 'text') => {
			const { createHighlighter } = await import('shiki');
			const highlighter = await createHighlighter({
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
					'dockerfile',
					'text'
				]
			});
			const html = highlighter.codeToHtml(code, { lang, theme: 'github-dark' });
			// Escape backticks and template literal syntax for Svelte
			const escaped = html
				.replace(/`/g, '&#96;')
				.replace(/\${/g, '&#36;{');
			return `{@html \`${escaped}\`}`;
		}
	}
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md', '.svx'],
	preprocess: [vitePreprocess(), mdsvex(mdsvexOptions)],
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: undefined,
			precompress: false,
			strict: true
		}),
		prerender: {
			handleHttpError: 'warn'
		},
		alias: {
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$commands: 'src/lib/commands',
			$content: 'src/content'
		}
	}
};

export default config;
