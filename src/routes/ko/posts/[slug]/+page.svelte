<script lang="ts">
	/**
	 * Korean Post Detail Page (/ko/posts/[slug])
	 *
	 * Displays individual post with Korean locale.
	 * Shows fallback notice when displaying English content.
	 */
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data }: { data: PageData } = $props();

	function goBack() {
		goto('/ko');
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

	function formatDate(dateStr: string): string {
		const locale = getLocale();
		return new Date(dateStr).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<svelte:head>
	<title>{data.meta.title} | Brandon Wie</title>
	<meta name="description" content={data.meta.description} />
	<meta property="og:title" content={data.meta.title} />
	<meta property="og:description" content={data.meta.description} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content="https://brandonwie.dev/ko/posts/{data.meta.slug}" />
	<meta property="article:published_time" content={data.meta.date} />
	{#if data.meta.updated}
		<meta property="article:modified_time" content={data.meta.updated} />
	{/if}
	{#each data.meta.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.meta.title} />
	<meta name="twitter:description" content={data.meta.description} />
	<link rel="canonical" href="https://brandonwie.dev/ko/posts/{data.meta.slug}" />
	<!-- hreflang for SEO -->
	<link rel="alternate" hreflang="en" href="https://brandonwie.dev/posts/{data.meta.slug}" />
	<link rel="alternate" hreflang="ko" href="https://brandonwie.dev/ko/posts/{data.meta.slug}" />
	<link rel="alternate" hreflang="x-default" href="https://brandonwie.dev/posts/{data.meta.slug}" />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div class="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
			<button
				onclick={goBack}
				class="flex items-center gap-2 text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				<span>←</span>
				<span>{m.back_to_terminal()}</span>
			</button>
			<a href="/ko" class="text-terminal-accent-orange">brandonwie.dev</a>
		</div>
	</header>

	<article class="mx-auto max-w-4xl px-6 py-12">
		<!-- Fallback Notice Banner -->
		{#if data.isFallback}
			<div
				class="mb-8 rounded-lg border border-terminal-accent-yellow/30 bg-terminal-accent-yellow/10 p-4"
			>
				<p class="text-terminal-accent-yellow">
					{m.translation_notice()}
				</p>
				<a
					href="/posts/{data.meta.slug}"
					class="mt-2 inline-block text-sm text-terminal-text-muted underline hover:text-terminal-accent-orange"
				>
					{m.view_in_english()}
				</a>
			</div>
		{/if}

		<header class="mb-8">
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<span
					class="rounded bg-terminal-accent-yellow/20 px-2 py-1 text-sm text-terminal-accent-yellow"
				>
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

			<div class="flex items-center gap-4 text-sm text-terminal-text-dim">
				<time datetime={data.meta.date}>
					{formatDate(data.meta.date)}
				</time>
				{#if data.meta.updated && data.meta.updated !== data.meta.date}
					<span>•</span>
					<span>{m.updated()} {formatDate(data.meta.updated)}</span>
				{/if}
			</div>
		</header>

		<div class="prose-terminal prose prose-invert max-w-none">
			{#if data.content}
				{@const Content = data.content}
				<Content />
			{/if}
		</div>
	</article>

	<footer class="border-t border-terminal-border py-8">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<button
				onclick={goBack}
				class="text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				← {m.back_to_terminal()}
			</button>
		</div>
	</footer>
</div>
