<!--
  +page.svelte - Home Page (Root Route: /)
  ========================================

  WHAT: The main entry point / home page of the blog.
  WHY:  This is what users see when they visit brandonwie.dev
  HOW:  Renders the Terminal component which provides the CLI experience.

  FILE NAMING (SvelteKit Convention):
  - `+page.svelte` = The page component for this route
  - Located at `/routes/+page.svelte` → URL: `/`
  - Located at `/routes/about/+page.svelte` → URL: `/about`

  REFERENCE: https://svelte.dev/docs/kit/routing#page
-->
<script lang="ts">
	// SVELTEKIT NAVIGATION
	// --------------------
	// `goto()` programmatically navigates to a URL.
	// WHY: The terminal commands need to navigate to posts without <a> tags.
	// ALTERNATIVE: `<a href="/posts/slug">` for declarative navigation.
	// REFERENCE: https://svelte.dev/docs/kit/$app-navigation#goto
	import { goto } from '$app/navigation';

	// COMPONENT IMPORT
	// ----------------
	// `$lib` is a path alias configured in svelte.config.js.
	// Maps to `src/lib/` - keeps imports clean and refactor-friendly.
	import Terminal from '$lib/components/terminal/Terminal.svelte';

	// SVELTE STORES
	// -------------
	// Stores are Svelte's reactive state containers that can be shared across components.
	// WHY: Posts data needs to be accessible by Terminal, FuzzyFinder, and commands.
	// The `posts` store is a writable store - can be read with `$posts` and written with `posts.set()`.
	// REFERENCE: https://svelte.dev/docs/svelte/stores
	import { posts } from '$lib/stores/posts';

	// LIFECYCLE - onMount
	// -------------------
	// `onMount` runs once when the component is first rendered to the DOM.
	// WHY: We need to load posts after the component mounts (client-side only).
	// IMPORTANT: onMount does NOT run during SSR (server-side rendering).
	// For data that needs SSR, use `+page.ts` or `+page.server.ts` instead.
	// REFERENCE: https://svelte.dev/docs/svelte/lifecycle-hooks#onMount
	import { onMount } from 'svelte';

	// LIFECYCLE: Load sample posts on mount
	// -------------------------------------
	// TODO: In production, this data should come from `+page.ts` load function
	// for proper SSR and SEO. Currently using client-side sample data.
	onMount(async () => {
		// Sample posts - only include posts that actually exist
		// TODO: In production, load from +page.ts for proper SSR
		const samplePosts = [
			{
				slug: 'redis-caching-patterns',
				title: 'Redis Caching Patterns for APIs',
				description: 'Effective caching strategies for backend APIs using Redis',
				date: '2026-01-15',
				tags: ['redis', 'caching', 'backend'],
				category: 'backend'
			}
		];

		// STORE MUTATION
		// --------------
		// `posts.set(value)` replaces the entire store value.
		// Other methods: `posts.update(fn)` for transforming current value.
		// Subscribers (components using `$posts`) auto-update when store changes.
		posts.set(samplePosts);
	});

	// EVENT HANDLER: Navigation callback for Terminal
	// ------------------------------------------------
	// PATTERN: Callback props
	// WHY: Terminal component doesn't know about routing - it's just UI.
	// This keeps Terminal reusable and decoupled from SvelteKit specifics.
	// The parent (this page) owns the routing logic and passes it down.
	function handleNavigateToPost(slug: string) {
		goto(`/posts/${slug}`);
	}
</script>

<!--
  <svelte:head> - Override Document Title
  ---------------------------------------
  WHY: When navigating back from a post page (which sets its own title),
  we need to explicitly reset the title to the home page default.
  Without this, client-side navigation would leave the post's title in place.
-->
<svelte:head>
	<title>Brandon Wie | Software Engineer</title>
</svelte:head>

<!--
  COMPONENT USAGE: Terminal
  -------------------------
  PROPS SYNTAX: `onNavigateToPost={handleNavigateToPost}`
  - In Svelte, props are passed like HTML attributes.
  - Shorthand: If prop name matches variable, use `{handleNavigateToPost}`.
  - Callback props: Functions passed down for child-to-parent communication.

  COMPONENT COMPOSITION:
  - Terminal handles all CLI UI and logic internally.
  - It calls `onNavigateToPost(slug)` when user wants to read a post.
  - This page then uses `goto()` to perform the actual navigation.

  REFERENCE: https://svelte.dev/docs/svelte/component-fundamentals
-->
<Terminal onNavigateToPost={handleNavigateToPost} />
