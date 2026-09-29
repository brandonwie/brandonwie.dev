import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
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
		ignores: [
			// Retired SvelteKit output. Nothing generates these any more; they stay
			// ignored so a stale local copy in an old checkout is never linted.
			'build/',
			'.svelte-kit/',
			'src/lib/paraglide/',
			'node_modules/',
			'docs/',
			'.worktrees/',
			// Next.js app: generated output only. Its source (next/app, next/src)
			// is linted.
			'next/build/',
			'next/.next/',
			'next/src/paraglide/',
			// Git-ignored scratch space (the retired migration harness left copies
			// here); linting it would make `pnpm lint` depend on leftovers.
			'tmp/',
		],
	},
);
