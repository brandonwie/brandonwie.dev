import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				extraFileExtensions: ['.svelte'],
			},
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
	},
	{
		rules: {
			// Allow unused vars prefixed with _ (common convention)
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			// Scripts use any for frontmatter parsing — allow sparingly
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
	{
		// `no-navigation-without-resolve` also covers .ts — the palette navigation
		// builders live in src/lib/palette/items.ts; the other rules here are
		// svelte-template-only and inert on .ts files.
		files: ['**/*.svelte', '**/*.ts'],
		rules: {
			// SSG site with no base path — resolve() not needed
			'svelte/no-navigation-without-resolve': 'off',
			// Giscus and Mermaid require direct DOM manipulation
			'svelte/no-dom-manipulating': 'off',
			// SearchPage (Pagefind excerpt) + PostDetail (JSON-LD) intentionally use {@html}
			'svelte/no-at-html-tags': 'warn',
			// Optional strictness — enable incrementally later
			'svelte/require-each-key': 'warn',
			'svelte/prefer-writable-derived': 'warn',
		},
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'src/lib/paraglide/',
			'static/',
			'node_modules/',
			'docs/',
			'.worktrees/',
			// Next.js migration candidate: generated output only. Its source
			// (next/app, next/src) is still linted.
			'next/build/',
			'next/.next/',
		],
	},
);
