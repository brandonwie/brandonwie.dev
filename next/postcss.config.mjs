/**
 * Tailwind CSS v4 for the Next candidate.
 *
 * The SvelteKit app runs Tailwind through `@tailwindcss/vite`; Next has no Vite
 * pipeline, so the official Next.js integration is the PostCSS plugin:
 * https://tailwindcss.com/docs/installation/framework-guides/nextjs
 * https://nextjs.org/docs/app/getting-started/css#tailwind-css
 *
 * Both stacks are pinned to tailwindcss 4.3.1 exactly while they coexist, so a
 * difference in rendered CSS can never be an engine-version artifact. The pin
 * is released when SvelteKit is removed.
 */
const config = {
	plugins: {
		'@tailwindcss/postcss': {},
	},
};

export default config;
