import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '../../app/globals.css';

/**
 * Contract C13 — document shell and locale `lang` attribute.
 *
 * The SvelteKit original is two files with no Next equivalent:
 *
 *   `src/app.html`         the document template, including `<html lang="%lang%">`
 *   `src/hooks.server.ts`  a server hook that substitutes `%lang%` at prerender
 *
 * Next has no server hook under `output: 'export'`, and a root layout cannot
 * read the current route segment, so the locale is a parameter of this shell
 * and each root layout passes its own. Every element below is asserted by
 * `scripts/assert-c13-shell.ts`; see `plan.md` AC11 for the row table.
 *
 * Keeping the shell in ONE module rather than duplicating it per locale root
 * layout is deliberate: C13 exists because a shell element can disappear
 * silently, and two copies is the cheapest way to make that happen.
 */

/** Locales the site publishes. `en` is unprefixed, `ko` lives under `/ko`. */
export type Locale = 'en' | 'ko';

/**
 * Head elements the Metadata API owns.
 *
 * `icons` and `manifest` reproduce `app.html:5-6` exactly — same `rel`, same
 * `href`, same `type`. The file-based metadata conventions (`app/icon.svg`,
 * `app/manifest.webmanifest`) were rejected: they emit `/icon.svg` and
 * `/manifest.webmanifest`, which are different URLs from the baseline's
 * `/favicon.svg` and `/site.webmanifest` and would break the URL contract for
 * anything already linking to them.
 *
 * https://nextjs.org/docs/app/api-reference/functions/generate-metadata#icons
 */
export const DOCUMENT_METADATA: Metadata = {
	icons: {
		icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
	},
	manifest: '/site.webmanifest',
};

/**
 * Head elements the Viewport API owns.
 *
 * `themeColor` and `colorScheme` moved out of `metadata` into `viewport` in
 * Next 14 and are exported separately.
 * https://nextjs.org/docs/app/api-reference/functions/generate-viewport
 *
 * The values are `app.html:7-9` verbatim. `#13111c` is the page base, not a
 * Rosé Pine role value, so it is written literally here for the same reason
 * `src/app.css` writes it literally: it is the one colour the browser chrome
 * reads before any stylesheet loads.
 */
export const DOCUMENT_VIEWPORT: Viewport = {
	width: 'device-width',
	initialScale: 1,
	colorScheme: 'dark',
	themeColor: '#13111c',
};

/**
 * The Google Fonts stylesheet, kept rather than replaced by `next/font`.
 *
 * C13 accepts either mechanism provided the choice is recorded. Keeping the
 * link is the parity-preserving option: `next/font` self-hosts, which drops
 * both preconnect hints and introduces a `/_next/static/media/*` stylesheet the
 * baseline does not have — four shell-field differences on every one of the 366
 * pages, each needing an exception-ledger approval, in exchange for a
 * performance gain that is nobody's acceptance criterion in this migration.
 * `next/font` stays available as a post-cutover optimisation.
 *
 * The URL is `app.html:10-15` byte-for-byte, so the comparator's
 * `link:preconnect:*` and `link:stylesheet:*` shell keys match the baseline.
 */
const FONT_STYLESHEET =
	'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';

/**
 * Prefetch — the recorded decision for `data-sveltekit-preload-data="hover"`.
 *
 * That attribute is SvelteKit-only and has no Next attribute equivalent, so it
 * is DROPPED from `<body>` and the behaviour it configured is taken over by
 * `next/link`'s default prefetching. The behaviour change, stated rather than
 * absorbed:
 *
 *   before  a link's data is fetched when the pointer enters it, or on touch
 *   after   a static route is fetched in full when the link enters the viewport
 *
 * Next's `prefetch` prop has no hover-only mode — `false` disables prefetching
 * on viewport entry AND on hover, which is strictly less than the baseline, and
 * `auto` (the default) is strictly more.
 * https://nextjs.org/docs/app/api-reference/components/link#prefetch
 *
 * The default is chosen: navigations get faster rather than slower, and every
 * prefetched payload on this site is a cacheable static file. The cost is
 * eagerness on link-dense routes — `/posts` lists 52+ posts — which is a
 * per-`<Link>` `prefetch={false}` decision when those routes are ported in
 * Slice 3, not a global one to take now.
 *
 * This drops the `body:preload-data` shell key the comparator captures on all
 * 366 baseline pages. That is a deliberate difference and needs an
 * exception-ledger entry approved by Brandon; it is NOT self-approved here.
 */
export const PREFETCH_DECISION = 'next-link-default' as const;

/**
 * The document shell. One instance per locale root layout.
 *
 * `<head>` is written explicitly because the Metadata API has no representation
 * for `rel="preconnect"` or a third-party `rel="stylesheet"`. Next's guidance
 * against a manual `<head>` is about `<title>` and `<meta>`, which are handled
 * by the exports above and are not placed here.
 * https://nextjs.org/docs/app/api-reference/file-conventions/layout#root-layout
 *
 * `<body>` takes the children directly. SvelteKit wrapped them in
 * `<div style="display: contents">` (`app.html:19`); `display: contents`
 * removes the box from the layout and the accessibility tree, so dropping the
 * wrapper leaves the rendered document structure unchanged.
 */
export function DocumentShell({ lang, children }: { lang: Locale; children: ReactNode }) {
	return (
		<html lang={lang}>
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
				<link href={FONT_STYLESHEET} rel="stylesheet" />
			</head>
			<body>{children}</body>
		</html>
	);
}
