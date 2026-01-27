<!--
  /posts/+page.svelte - Posts List Page (URL: /posts)
  ===================================================

  WHAT: Displays all blog posts in a list/grid format.
  WHY:  Provides a traditional blog view alternative to the terminal interface.
  HOW:  Receives posts data from +page.ts load function via `data` prop.

  DATA LOADING (SvelteKit Pattern):
  - `+page.ts` exports a `load` function that runs before this page renders.
  - The returned data is passed to this component as the `data` prop.
  - This enables SSR (Server-Side Rendering) for SEO.

  REFERENCE: https://svelte.dev/docs/kit/load
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data }: { data: PageData } = $props();

	// Locale-aware date formatting
	function formatDate(dateStr: string): string {
		const locale = getLocale();
		return new Date(dateStr).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<!--
  <svelte:head> - Page-Specific Meta Tags
  ---------------------------------------
  These OVERRIDE the root layout's meta tags for this specific page.
  SvelteKit merges head content, with child pages taking precedence.
-->
<svelte:head>
	<title>{m.posts_title()} | Brandon Wie</title>
	<meta name="description" content={m.posts_description()} />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header with back navigation -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div class="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
			<!--
			  <a> vs goto()
			  -------------
			  For navigation, prefer <a> tags when possible:
			  - Accessible (right-click, open in new tab)
			  - SEO-friendly (crawlers follow links)
			  - Works without JavaScript

			  Use goto() for:
			  - Programmatic navigation (after form submit, etc.)
			  - When you need to prevent default behavior
			-->
			<a
				href="/"
				class="flex items-center gap-2 text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				<span>←</span>
				<span>{m.back_to_terminal()}</span>
			</a>
			<a href="/" class="text-terminal-accent-orange">brandonwie.dev</a>
		</div>
	</header>

	<!-- Posts List -->
	<main class="mx-auto max-w-4xl px-6 py-12">
		<h1 class="mb-8 text-2xl font-bold text-terminal-text-primary">{m.posts_title()}</h1>

		<!--
		  CONTROL FLOW: {#if} / {:else}
		  -----------------------------
		  Svelte's template syntax for conditional rendering.
		  - {#if condition}...{/if} - Renders block if truthy
		  - {:else} - Optional else branch
		  - {:else if condition} - Optional else-if branch

		  REFERENCE: https://svelte.dev/docs/svelte/if
		-->
		{#if data.posts.length === 0}
			<p class="text-terminal-text-muted">{m.no_posts()}</p>
		{:else}
			<div class="space-y-6">
				<!--
				  CONTROL FLOW: {#each}
				  ---------------------
				  Iterates over arrays/iterables.
				  SYNTAX: {#each array as item, index (key)}
				  - `item` - Current element
				  - `index` - Optional index (0-based)
				  - `(key)` - Optional unique key for efficient DOM updates

				  WHY use keys?
				  - Without keys, Svelte updates DOM by index (can cause bugs with state)
				  - With keys, Svelte tracks items by identity (safer for lists with state)

				  REFERENCE: https://svelte.dev/docs/svelte/each
				-->
				{#each data.posts as post}
					<a
						href="/posts/{post.slug}"
						class="block rounded-lg border border-terminal-border bg-terminal-bg-secondary p-6 transition-colors hover:border-terminal-accent-orange"
					>
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<!-- Category badge -->
							<span class="rounded bg-terminal-accent-yellow/20 px-2 py-0.5 text-xs text-terminal-accent-yellow">
								{post.category}
							</span>
							<!-- Date -->
							<span class="text-sm text-terminal-text-dim">
								{formatDate(post.date)}
							</span>
						</div>
						<h2 class="mb-2 text-xl font-semibold text-terminal-text-primary">
							{post.title}
						</h2>
						<p class="mb-3 text-terminal-text-muted">
							{post.description}
						</p>
						<!-- Tags - nested {#each} -->
						<div class="flex flex-wrap gap-2">
							{#each post.tags as tag}
								<span class="rounded bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-muted">
									{tag}
								</span>
							{/each}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</main>
</div>
