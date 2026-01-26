<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Posts | Brandon Wie</title>
	<meta name="description" content="All blog posts by Brandon Wie" />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div class="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
			<a
				href="/"
				class="flex items-center gap-2 text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				<span>←</span>
				<span>Back to terminal</span>
			</a>
			<a href="/" class="text-terminal-accent-orange">brandonwie.dev</a>
		</div>
	</header>

	<!-- Posts List -->
	<main class="mx-auto max-w-4xl px-6 py-12">
		<h1 class="mb-8 text-2xl font-bold text-terminal-text-primary">All Posts</h1>

		{#if data.posts.length === 0}
			<p class="text-terminal-text-muted">No posts yet. Check back soon!</p>
		{:else}
			<div class="space-y-6">
				{#each data.posts as post}
					<a
						href="/posts/{post.slug}"
						class="block rounded-lg border border-terminal-border bg-terminal-bg-secondary p-6 transition-colors hover:border-terminal-accent-orange"
					>
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<span class="rounded bg-terminal-accent-yellow/20 px-2 py-0.5 text-xs text-terminal-accent-yellow">
								{post.category}
							</span>
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
