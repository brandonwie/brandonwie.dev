<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import { viewMode } from '$lib/stores/viewMode';

	interface Props {
		locale: 'en' | 'ko';
	}

	let { locale }: Props = $props();

	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const backLabel = $derived($viewMode === 'terminal' ? m.back_to_terminal() : m.back_to_home());

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let resultCount = $state(0);
	let isLoading = $state(false);
	let isDevMode = $state(false);
	let hasSearched = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let pagefind: any = null;

	interface SearchResult {
		url: string;
		title: string;
		excerpt: string;
		category?: string;
	}

	onMount(async () => {
		try {
			const pagefindPath = '/pagefind/pagefind.js';
			pagefind = await import(/* @vite-ignore */ pagefindPath);
			await pagefind.init();
		} catch {
			isDevMode = true;
		}
	});

	async function handleInput() {
		if (!pagefind || !query.trim()) {
			results = [];
			resultCount = 0;
			hasSearched = false;
			isLoading = false;
			return;
		}

		isLoading = true;
		hasSearched = true;

		try {
			const search = await pagefind.debouncedSearch(query, { filters: { lang: locale } }, 200);

			if (!search) return; // superseded by newer search

			resultCount = search.results.length;

			const data = await Promise.all(
				search.results.slice(0, 20).map((r: { data: () => Promise<unknown> }) => r.data()),
			);

			results = data.map(
				(d: {
					url?: string;
					meta?: { title?: string };
					excerpt?: string;
					filters?: { category?: string[] };
				}) => ({
					url: d.url ?? '',
					title: d.meta?.title ?? 'Untitled',
					excerpt: d.excerpt ?? '',
					category: d.filters?.category?.[0],
				}),
			);
		} catch (err) {
			console.error('Search error:', err);
			results = [];
			resultCount = 0;
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.search_title()} | Brandon Wie</title>
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div
			class="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6"
		>
			<a
				href={basePath || '/'}
				class="flex items-center gap-1 text-xs text-terminal-text-muted transition-colors hover:text-terminal-accent-orange shrink-0 sm:gap-2 sm:text-sm"
			>
				<span>←</span>
				<span>{backLabel}</span>
			</a>
			<a href={basePath || '/'} class="text-terminal-accent-orange text-xs truncate sm:text-base">
				brandonwie.dev
			</a>
			<div class="flex items-center gap-2">
				<ViewToggle />
				<LanguageToggle />
			</div>
		</div>
	</header>

	<!-- Search -->
	<main class="mx-auto max-w-2xl px-4 py-10 sm:px-6">
		<h1 class="mb-6 text-2xl font-bold text-terminal-text-primary">{m.search_title()}</h1>

		{#if isDevMode}
			<div
				class="rounded-lg border border-terminal-accent-yellow/30 bg-terminal-accent-yellow/10 p-4"
			>
				<p class="text-sm text-terminal-accent-yellow">{m.search_dev_notice()}</p>
			</div>
		{:else}
			<!-- Search Input -->
			<div class="mb-8 flex items-center gap-2 border-b border-terminal-border pb-2">
				<span class="text-terminal-accent-orange font-bold">{'>'}</span>
				<input
					type="text"
					bind:value={query}
					oninput={handleInput}
					placeholder={m.search_placeholder()}
					class="flex-1 bg-transparent text-terminal-text-primary placeholder:text-terminal-text-dim outline-none"
					autofocus
				/>
			</div>

			<!-- Results -->
			{#if isLoading}
				<p class="text-terminal-text-muted text-sm">{m.search_loading()}</p>
			{:else if hasSearched && results.length === 0}
				<p class="text-terminal-text-muted text-sm">{m.search_no_results({ query })}</p>
			{:else if results.length > 0}
				<p class="text-terminal-text-dim text-xs mb-6">
					{m.search_results_count({ count: resultCount })}
				</p>

				<div class="space-y-4">
					{#each results as result (result.url)}
						<a
							href={result.url}
							class="block rounded-lg border border-terminal-border bg-terminal-bg-secondary p-4 transition-colors hover:border-terminal-accent-orange no-underline"
						>
							{#if result.category}
								<span
									class="rounded-sm bg-terminal-accent-yellow/20 px-2 py-0.5 text-xs text-terminal-accent-yellow mb-2 inline-block"
								>
									{result.category}
								</span>
							{/if}
							<h2 class="text-base font-semibold text-terminal-text-primary mb-1">
								{result.title}
							</h2>
							<p class="text-sm text-terminal-text-muted search-excerpt">
								{@html result.excerpt}
							</p>
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</main>
</div>
