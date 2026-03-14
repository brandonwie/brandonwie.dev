<!--
  +layout.svelte - Root Layout (SvelteKit Convention)
  ====================================================

  WHAT: This is the root layout that wraps ALL pages in the app.
  WHY:  SvelteKit uses file-based routing. `+layout.svelte` files define shared
        UI that persists across page navigations (header, footer, global styles).
  HOW:  The `{@render children()}` renders the current page content inside this wrapper.

  KEY CONCEPTS:

  1. File Naming Convention:
     - `+layout.svelte` = Layout wrapper (inherits to child routes)
     - `+page.svelte` = Page content (the actual route)
     - `+layout.ts` = Layout data loader (runs on server/client)
     - `+page.ts` = Page data loader

  2. Layout Inheritance:
     Routes inherit layouts from parent directories.
     /routes/+layout.svelte applies to ALL routes
     /routes/posts/+layout.svelte would apply only to /posts/*

  3. $props() Rune (Svelte 5):
     `let { children } = $props()` - Destructures props passed to this component.
     `children` is a special prop containing the page content to render.
     In Svelte 4, this was: `<slot />`. Svelte 5 uses render tags instead.

  REFERENCE: https://svelte.dev/docs/kit/routing#layout
-->
<script lang="ts">
	// Import global CSS - applies to entire application
	// Tailwind CSS with custom terminal theme variables
	import '../app.css';

	// Paraglide for i18n
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';

	// View Transitions API - smooth crossfade between pages
	// Progressive enhancement: unsupported browsers get instant navigation
	import { onNavigate } from '$app/navigation';

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// SVELTE 5 RUNES: $props()
	// ------------------------
	// `$props()` replaces Svelte 4's `export let` for declaring component props.
	// It returns an object containing all props passed to this component.
	// `children` is a special "snippet" prop that SvelteKit passes to layouts,
	// containing the page content that should be rendered inside this layout.
	let { children } = $props();
</script>

<!--
  <svelte:head> - Document Head Management
  ----------------------------------------
  WHAT: Injects content into the document's <head> element.
  WHY:  SEO requires proper meta tags. Each page can add/override head content.
  HOW:  SvelteKit collects all <svelte:head> content and deduplicates by tag.

  INHERITANCE: Child pages can add more meta tags or override these defaults.
  Pages override by using the same meta property name.

  REFERENCE: https://svelte.dev/docs/svelte/svelte-head
-->
<svelte:head>
	<title>Brandon Wie | Software Engineer</title>
	<meta
		name="description"
		content="Brandon Wie's personal blog - Software engineering insights, tutorials, and learnings"
	/>
	<!-- Open Graph tags for social media previews (Facebook, LinkedIn) -->
	<meta property="og:title" content="Brandon Wie | Software Engineer" />
	<meta
		property="og:description"
		content="Software engineering insights, tutorials, and learnings"
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://brandonwie.dev" />
	<meta property="og:image" content="https://brandonwie.dev/og/default.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<!-- Twitter Card tags for Twitter previews -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Brandon Wie | Software Engineer" />
	<meta
		name="twitter:description"
		content="Software engineering insights, tutorials, and learnings"
	/>
	<meta name="twitter:image" content="https://brandonwie.dev/og/default.png" />
	<!-- RSS Feeds -->
	<link
		rel="alternate"
		type="application/rss+xml"
		title="Brandon Wie (English)"
		href="https://brandonwie.dev/rss.xml"
	/>
	<link
		rel="alternate"
		type="application/rss+xml"
		title="Brandon Wie (한국어)"
		href="https://brandonwie.dev/ko/rss.xml"
	/>
</svelte:head>

<!--
  Root Container
  --------------
  - `min-h-screen`: Ensures full viewport height (CSS: min-height: 100vh)
  - `bg-terminal-bg-primary`: Custom Tailwind class defined in app.css
  - `font-mono`: Monospace font (JetBrains Mono) for terminal aesthetic

  {@render children()} - SVELTE 5 RENDER TAG
  ------------------------------------------
  WHAT: Renders the "children" snippet (page content) at this location.
  WHY:  Svelte 5 replaced `<slot>` with explicit render tags for type safety.
  HOW:  SvelteKit automatically passes page content as the `children` prop.

  MIGRATION NOTE (Svelte 4 → 5):
  - Svelte 4: <slot />
  - Svelte 5: {@render children()}

  REFERENCE: https://svelte.dev/docs/svelte/snippet#Passing-snippets-to-components
-->
<div class="min-h-screen bg-terminal-bg-primary text-terminal-text-primary font-mono">
	{@render children()}
</div>

<!-- Hidden links for SSG prerendering - allows SvelteKit to crawl all locale versions -->
<div style="display:none">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
