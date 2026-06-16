<!--
  /posts/+page.svelte - Posts List Page (URL: /posts)
  ===================================================

  WHAT: Displays all blog posts in a card grid with category filtering.
  WHY:  Provides a browsable blog view alternative to the command palette.
  HOW:  Receives posts data from +page.ts load function via `data` prop.

  REFERENCE: https://svelte.dev/docs/kit/load
-->
<script lang="ts">
	import type { PageData } from './$types';
	import { m } from '$lib/paraglide/messages';
	import HeaderControls from '$lib/components/HeaderControls.svelte';
	import CategorySidebar from '$lib/components/CategorySidebar.svelte';
	import { getCategoriesWithCounts } from '$lib/stores/posts';
	import { formatDateShort, effectiveDate } from '$lib/utils/date';

	let { data }: { data: PageData } = $props();

	const backLabel = m.back_to_home();

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

<div class="min-h-screen bg-bg">
	<!-- Header with back navigation -->
	<header class="border-b border-line">
		<div
			class="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6"
		>
			<a
				href="/"
				class="flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-accent sm:gap-2 sm:text-sm"
			>
				<span>←</span>
				<span>{backLabel}</span>
			</a>
			<a href="/" class="truncate font-mono text-xs font-semibold text-ink sm:text-base">
				brandonwie.dev
			</a>
			<div class="flex items-center gap-2">
				<a
					href="/search"
					class="text-muted no-underline transition-colors hover:text-accent"
					aria-label={m.search_title()}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
				</a>
				<HeaderControls />
			</div>
		</div>
	</header>

	<!-- Posts List -->
	<main class="mx-auto max-w-6xl px-4 py-12 sm:px-6">
		<h1 class="mb-8 text-2xl font-semibold tracking-tight text-ink">{m.posts_title()}</h1>

		<div class="lg:flex lg:gap-8">
			<CategorySidebar
				categories={categoriesWithCounts}
				{activeCategory}
				onSelect={handleCategorySelect}
			/>

			<div class="min-w-0 flex-1">
				{#if filteredPosts.length === 0}
					<p class="text-muted">{m.no_posts()}</p>
				{:else}
					<div class="grid gap-4 sm:grid-cols-2">
						{#each filteredPosts as post (post.slug)}
							<a
								href="/posts/{post.slug}"
								class="group block rounded border border-line bg-surface p-5 no-underline transition-colors hover:border-accent"
							>
								<div class="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs">
									<span class="rounded-sm bg-accent/10 px-2 py-0.5 text-accent"
										>{post.category}</span
									>
									<span class="text-faint tabular-nums">
										{formatDateShort(effectiveDate(post.date, post.updated))}
										{#if post.updated && post.updated !== post.date}
											<span class="ml-1 text-ok">({m.updated()})</span>
										{/if}
									</span>
								</div>
								<h2
									class="text-base font-semibold text-ink transition-colors group-hover:text-accent"
								>
									{post.title}
								</h2>
								<p class="mt-2 text-sm leading-relaxed text-muted">
									{post.description}
								</p>
								{#if post.tags?.length}
									<div class="mt-3 flex flex-wrap gap-1.5 font-mono text-[11px]">
										{#each post.tags.slice(0, 5) as tag (tag)}
											<span class="rounded-sm border border-line px-1.5 py-0.5 text-faint"
												>{tag}</span
											>
										{/each}
									</div>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
