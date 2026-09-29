/**
 * Tailwind CSS v4 for the Next app, through the official Next.js integration,
 * the PostCSS plugin:
 * https://tailwindcss.com/docs/installation/framework-guides/nextjs
 * https://nextjs.org/docs/app/getting-started/css#tailwind-css
 *
 * `src/app.css` lives at the repository root and its `@import 'tailwindcss'`
 * resolves from the root package, while this plugin runs from `next/`. Both
 * package.json files pin tailwindcss 4.3.1 exactly so the engine and the CSS it
 * imports are always the same release.
 */
const config = {
	plugins: {
		'@tailwindcss/postcss': {},
	},
};

export default config;
