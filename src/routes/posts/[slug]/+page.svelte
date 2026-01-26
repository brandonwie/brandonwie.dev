<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function goBack() {
		goto('/');
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{data.meta.title} | Brandon Wie</title>
	<meta name="description" content={data.meta.description} />
	<meta property="og:title" content={data.meta.title} />
	<meta property="og:description" content={data.meta.description} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content="https://brandonwie.dev/posts/{data.meta.slug}" />
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
	<link rel="canonical" href="https://brandonwie.dev/posts/{data.meta.slug}" />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div class="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
			<button
				onclick={goBack}
				class="flex items-center gap-2 text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				<span>←</span>
				<span>Back to terminal</span>
			</button>
			<a href="/" class="text-terminal-accent-orange">brandonwie.dev</a>
		</div>
	</header>

	<!-- Article -->
	<article class="mx-auto max-w-4xl px-6 py-12">
		<!-- Meta -->
		<header class="mb-8">
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

			<div class="flex items-center gap-4 text-sm text-terminal-text-dim">
				<time datetime={data.meta.date}>
					{formatDate(data.meta.date)}
				</time>
				{#if data.meta.updated && data.meta.updated !== data.meta.date}
					<span>•</span>
					<span>Updated {formatDate(data.meta.updated)}</span>
				{/if}
			</div>
		</header>

		<!-- Content -->
		<div class="prose-terminal prose prose-invert max-w-none">
			<svelte:component this={data.content} />
		</div>
	</article>

	<!-- Footer -->
	<footer class="border-t border-terminal-border py-8">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<button
				onclick={goBack}
				class="text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				← Back to terminal
			</button>
		</div>
	</footer>
</div>
