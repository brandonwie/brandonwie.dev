/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Deno's npm layout creates duplicate Vite type definitions
// (.deno/vite@8.x vs node_modules/vite), causing "excessive stack depth" errors.
// The build validates this config at runtime; type-checking adds no value here.
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			// URL is the single source of truth for locale (see urlPatterns below).
			// No `cookie`: a persisted cookie would let EN routes (which carry no
			// locale in the path) fall through to a stale `ko` and render Korean.
			// `baseLocale` (en) is only the fallback when the URL yields nothing.
			strategy: ['url', 'baseLocale'],
			urlPatterns: [
				// English routes (default, no prefix)
				{
					pattern: '/',
					localized: [
						['en', '/'],
						['ko', '/ko'],
					],
				},
				{
					pattern: '/posts',
					localized: [
						['en', '/posts'],
						['ko', '/ko/posts'],
					],
				},
				{
					pattern: '/posts/:slug',
					localized: [
						['en', '/posts/:slug'],
						['ko', '/ko/posts/:slug'],
					],
				},
				{
					pattern: '/about',
					localized: [
						['en', '/about'],
						['ko', '/ko/about'],
					],
				},
				{
					pattern: '/search',
					localized: [
						['en', '/search'],
						['ko', '/ko/search'],
					],
				},
				{
					pattern: '/study',
					localized: [
						['en', '/study'],
						['ko', '/ko/study'],
					],
				},
				{
					pattern: '/study/dsa-i',
					localized: [
						['en', '/study/dsa-i'],
						['ko', '/ko/study/dsa-i'],
					],
				},
				{
					pattern: '/system',
					localized: [
						['en', '/system'],
						['ko', '/ko/system'],
					],
				},
				{
					pattern: '/system/3b',
					localized: [
						['en', '/system/3b'],
						['ko', '/ko/system/3b'],
					],
				},
				// Catch-all for other routes
				{
					pattern: '/:path(.*)?',
					localized: [
						['en', '/:path(.*)?'],
						['ko', '/ko/:path(.*)?'],
					],
				},
			],
		}),
	],
	server: {
		port: 5173,
		strictPort: false,
	},
	preview: {
		port: 4173,
	},
});
