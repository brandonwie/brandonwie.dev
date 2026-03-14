<script lang="ts">
	/**
	 * Korean Posts List Page (/ko/posts)
	 *
	 * Displays all blog posts with Korean locale active.
	 * Falls back to English posts if Korean translations aren't available.
	 */
	import type { PageData } from './$types';
	import { m } from '$lib/paraglide/messages';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import CategorySidebar from '$lib/components/CategorySidebar.svelte';
	import { viewMode } from '$lib/stores/viewMode';
	import { getCategoriesWithCounts } from '$lib/stores/posts';
	import { formatDateShort, effectiveDate } from '$lib/utils/date';

	let { data }: { data: PageData } = $props();

	const backLabel = $derived($viewMode === 'terminal' ? m.back_to_terminal() : m.back_to_home());

	// Category filtering
	let activeCategory: string | null = $state(null);
	const categoriesWithCounts = $derived(getCategoriesWithCounts(data.posts));
	const filteredPosts = $derived(
		activeCategory ? data.posts.filter((p) => p.category === activeCategory) : data.posts,
	);

	function handleCategorySelect(category: string | null) {
		activeCategory = category;
	}
</script>

<svelte:head>
	<title>{m.posts_title()} | Brandon Wie</title>
	<meta name="description" content={m.posts_description()} />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div
			class="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6"
		>
			<a
				href="/ko"
				class="flex items-center gap-1 text-xs text-terminal-text-muted transition-colors hover:text-terminal-accent-orange shrink-0 sm:gap-2 sm:text-sm"
			>
				<span>←</span>
				<span>{backLabel}</span>
			</a>
			<a href="/ko" class="text-terminal-accent-orange text-xs truncate sm:text-base"
				>brandonwie.dev</a
			>
			<div class="flex items-center gap-2">
				<ViewToggle />
				<LanguageToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-6xl px-6 py-12">
		<h1 class="mb-8 text-2xl font-bold text-terminal-text-primary">{m.posts_title()}</h1>

		<div class="lg:flex lg:gap-8">
			<CategorySidebar
				categories={categoriesWithCounts}
				{activeCategory}
				onSelect={handleCategorySelect}
			/>

			<div class="flex-1 min-w-0">
				{#if filteredPosts.length === 0}
					<p class="text-terminal-text-muted">{m.no_posts()}</p>
				{:else}
					<div class="space-y-6">
						{#each filteredPosts as post (post.slug)}
							<a
								href="/ko/posts/{post.slug}"
								class="block rounded-lg border border-terminal-border bg-terminal-bg-secondary p-6 transition-colors hover:border-terminal-accent-orange"
							>
								<div class="mb-2 flex flex-wrap items-center gap-2">
									<span
										class="rounded-sm bg-terminal-accent-yellow/20 px-2 py-0.5 text-xs text-terminal-accent-yellow"
									>
										{post.category}
									</span>
									<span class="text-sm text-terminal-text-dim">
										{formatDateShort(effectiveDate(post.date, post.updated))}
										{#if post.updated && post.updated !== post.date}
											<span class="text-terminal-accent-green text-xs ml-1">({m.updated()})</span>
										{/if}
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
											class="rounded-sm bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-muted"
										>
											{tag}
										</span>
									{/each}
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
