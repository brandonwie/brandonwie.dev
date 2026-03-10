<!--
  /posts/[slug]/+page.svelte - Dynamic Post Detail Page
  =====================================================

  WHAT: Displays individual blog post content.
  WHY:  Each post needs its own URL for direct linking and SEO.
  HOW:  Uses dynamic route parameter [slug] to identify which post to show.

  DYNAMIC ROUTES (SvelteKit):
  - `[slug]` in the folder name creates a dynamic route parameter.
  - URL `/posts/redis-caching` → `params.slug = 'redis-caching'`
  - The +page.ts load function receives `params` and fetches the right post.

  REFERENCE: https://svelte.dev/docs/kit/routing#Advanced-routing

  LOAD FUNCTION FLOW:
  1. User visits /posts/my-post-slug
  2. +page.ts load({ params }) runs with params.slug = 'my-post-slug'
  3. Load function finds the post and returns { meta, content }
  4. This component receives it as `data` prop
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { m } from '$lib/paraglide/messages';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import { viewMode } from '$lib/stores/viewMode';
	import Giscus from '$lib/components/Giscus.svelte';
	import { formatDateLong } from '$lib/utils/date';

	let { data }: { data: PageData } = $props();

	const backLabel = $derived($viewMode === 'terminal' ? m.back_to_terminal() : m.back_to_home());

	let copied = $state(false);

	async function copyLink() {
		await navigator.clipboard.writeText($page.url.href);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function goBack() {
		goto('/');
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Backspace') {
			const target = event.target as HTMLElement;
			const isEditable =
				target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
			if (!isEditable) {
				event.preventDefault();
				goBack();
			}
		}
	}
</script>

<!--
  <svelte:window> - Global Event Binding
  --------------------------------------
  WHAT: Binds event listeners to the `window` object.
  WHY:  Keyboard shortcuts need to work anywhere on the page, not just focused elements.
  HOW:  `onkeydown={handler}` is Svelte 5 syntax (was `on:keydown` in Svelte 4).

  CLEANUP: Svelte automatically removes the listener when component is destroyed.
  This prevents memory leaks - you don't need manual removeEventListener().

  REFERENCE: https://svelte.dev/docs/svelte/svelte-window
-->
<svelte:window onkeydown={handleKeyDown} />

<!--
  <svelte:head> - SEO Meta Tags for Article
  -----------------------------------------
  DYNAMIC VALUES: Use `{expression}` to insert JavaScript values.
  This page overrides the root layout's meta tags with post-specific content.

  ARTICLE SCHEMA (Open Graph):
  - og:type="article" tells social platforms this is an article
  - article:published_time, article:modified_time for date metadata
  - article:tag for categorization
-->
<svelte:head>
	<title>{data.meta.title} | Brandon Wie</title>
	<meta name="description" content={data.meta.description} />
	<!-- Open Graph (Facebook, LinkedIn, etc.) -->
	<meta property="og:title" content={data.meta.title} />
	<meta property="og:description" content={data.meta.description} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content="https://brandonwie.dev/posts/{data.meta.slug}" />
	<meta property="article:published_time" content={data.meta.date} />
	<!--
	  CONDITIONAL RENDERING in head
	  -----------------------------
	  {#if} blocks work inside <svelte:head> too.
	  Only add updated time if it exists and differs from publish date.
	-->
	{#if data.meta.updated}
		<meta property="article:modified_time" content={data.meta.updated} />
	{/if}
	<!-- Loop through tags to add each as an article:tag -->
	{#each data.meta.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}
	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.meta.title} />
	<meta name="twitter:description" content={data.meta.description} />
	<!-- Canonical URL for SEO (prevents duplicate content issues) -->
	<link rel="canonical" href="https://brandonwie.dev/posts/{data.meta.slug}" />
	<!-- hreflang for multilingual SEO -->
	<link rel="alternate" hreflang="en" href="https://brandonwie.dev/posts/{data.meta.slug}" />
	<link rel="alternate" hreflang="ko" href="https://brandonwie.dev/ko/posts/{data.meta.slug}" />
	<link rel="alternate" hreflang="x-default" href="https://brandonwie.dev/posts/{data.meta.slug}" />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div class="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
			<button
				onclick={goBack}
				class="flex items-center gap-1 text-xs text-terminal-text-muted transition-colors hover:text-terminal-accent-orange shrink-0 sm:gap-2 sm:text-sm"
			>
				<span>←</span>
				<span>{backLabel}</span>
			</button>
			<a href="/" class="text-terminal-accent-orange text-xs truncate sm:text-base">brandonwie.dev</a>
			<div class="flex items-center gap-2">
				<ViewToggle />
				<LanguageToggle />
			</div>
		</div>
	</header>

	<!-- Article -->
	<article class="mx-auto max-w-4xl px-6 py-12">
		<!-- Meta Header -->
		<header class="mb-8">
			<!-- Category and Tags -->
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<span class="rounded bg-terminal-accent-yellow/20 px-2 py-1 text-sm text-terminal-accent-yellow">
					{data.meta.category}
				</span>
				{#each data.meta.tags as tag}
					<span class="rounded bg-terminal-bg-secondary px-2 py-1 text-sm text-terminal-text-muted">
						{tag}
					</span>
				{/each}
			</div>

			<h1 class="mb-4 text-3xl font-bold text-terminal-text-primary md:text-4xl">
				{data.meta.title}
			</h1>

			<p class="mb-4 text-lg text-terminal-text-muted">
				{data.meta.description}
			</p>

			<!-- Date with semantic <time> element -->
			<div class="flex flex-wrap items-center gap-4 text-sm text-terminal-text-dim">
				<!--
				  <time> HTML Element
				  -------------------
				  WHAT: Semantic element for dates/times.
				  WHY:  Helps search engines and screen readers understand the date.
				  `datetime` attribute must be machine-readable (ISO 8601 format).
				-->
				<time datetime={data.meta.date}>
					{formatDateLong(data.meta.date)}
				</time>
				{#if data.meta.updated && data.meta.updated !== data.meta.date}
					<span>•</span>
					<span>{m.updated()} {formatDateLong(data.meta.updated)}</span>
				{/if}
				{#if data.meta.readingTime}
					<span>•</span>
					<span>{m.reading_time({ minutes: data.meta.readingTime })}</span>
				{/if}
				<button
					onclick={copyLink}
					class="ml-auto text-terminal-text-dim transition-colors hover:text-terminal-accent-orange"
				>
					{copied ? m.copied() : m.copy_link()}
				</button>
			</div>
		</header>

		<!-- Content -->
		<div class="prose-terminal prose prose-invert max-w-none">
			<!--
			  RENDERING DYNAMIC COMPONENTS
			  ----------------------------
			  `data.content` is a Svelte component generated by mdsvex from markdown.

			  {@const} - BLOCK-LEVEL CONSTANT
			  WHY: Create a local constant within a template block.
			  Here we alias `data.content` to `Content` for cleaner JSX-like usage.

			  PATTERN: Capitalizing component names is convention (Content vs content)
			  to distinguish components from regular variables.

			  REFERENCE: https://svelte.dev/docs/svelte/const
			-->
			{#if data.content}
				{@const Content = data.content}
				<!--
				  COMPONENT INSTANTIATION
				  -----------------------
				  <Content /> renders the mdsvex-compiled markdown as a Svelte component.
				  This is how dynamic/runtime components are rendered in Svelte.
				-->
				<Content />
			{/if}
		</div>

		<!-- Comments -->
		<Giscus slug={data.meta.slug} lang="en" />
	</article>

	<!-- Footer -->
	<footer class="border-t border-terminal-border py-8">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<button
				onclick={goBack}
				class="text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				← {backLabel}
			</button>
		</div>
	</footer>
</div>
