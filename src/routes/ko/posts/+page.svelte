<script lang="ts">
	/**
	 * Korean Posts List Page (/ko/posts)
	 *
	 * Displays all blog posts with Korean locale active.
	 * Falls back to English posts if Korean translations aren't available.
	 */
	import type { PageData } from './$types';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';

	let { data }: { data: PageData } = $props();

	function formatDate(dateStr: string): string {
		const locale = getLocale();
		return new Date(dateStr).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{m.posts_title()} | Brandon Wie</title>
	<meta name="description" content={m.posts_description()} />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div class="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
			<a
				href="/ko"
				class="flex items-center gap-1 text-xs text-terminal-text-muted transition-colors hover:text-terminal-accent-orange shrink-0 sm:gap-2 sm:text-sm"
			>
				<span>←</span>
				<span>{m.back_to_terminal()}</span>
			</a>
			<a href="/ko" class="text-terminal-accent-orange text-xs truncate sm:text-base">brandonwie.dev</a>
			<LanguageToggle />
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-6 py-12">
		<h1 class="mb-8 text-2xl font-bold text-terminal-text-primary">{m.posts_title()}</h1>

		{#if data.posts.length === 0}
			<p class="text-terminal-text-muted">{m.no_posts()}</p>
		{:else}
			<div class="space-y-6">
				{#each data.posts as post}
					<a
						href="/ko/posts/{post.slug}"
						class="block rounded-lg border border-terminal-border bg-terminal-bg-secondary p-6 transition-colors hover:border-terminal-accent-orange"
					>
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<span
								class="rounded bg-terminal-accent-yellow/20 px-2 py-0.5 text-xs text-terminal-accent-yellow"
							>
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
								<span
									class="rounded bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-muted"
								>
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
