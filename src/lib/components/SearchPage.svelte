<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { absoluteUrl, DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	interface Props {
		locale: 'en' | 'ko';
	}

	let { locale }: Props = $props();

	const canonicalHref = $derived(absoluteUrl(locale === 'ko' ? '/ko/search' : '/search'));
	const pageTitle = $derived(`${m.search_title()} | Brandon Wie`);
	const pageDescription = $derived(m.site_description());

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
					url: (d.url ?? '').replace(/\.html$/, ''),
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
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<meta name="robots" content="noindex,follow" />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href={absoluteUrl('/search')} />
	<link rel="alternate" hreflang="ko" href={absoluteUrl('/ko/search')} />
	<link rel="alternate" hreflang="x-default" href={absoluteUrl('/search')} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalHref} />
	<meta property="og:image" content={DEFAULT_OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:locale" content={localeCode(locale)} />
	<meta property="og:locale:alternate" content={localeCode(locale === 'ko' ? 'en' : 'ko')} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Search -->
	<main id="main-content" class="mx-auto max-w-2xl px-4 py-10 sm:px-6">
		<h1 class="mb-6 text-2xl font-bold text-terminal-text-primary">{m.search_title()}</h1>

		{#if isDevMode}
			<div
				class="rounded-lg border border-terminal-accent-yellow/30 bg-terminal-accent-yellow/10 p-4"
			>
				<p class="text-sm text-terminal-accent-yellow">{m.search_dev_notice()}</p>
			</div>
		{:else}
			<!-- Search Input -->
			<div class="mb-8 flex items-center gap-2 border-b border-terminal-border pb-2" role="search">
				<span class="text-terminal-accent-orange font-bold" aria-hidden="true">&gt;</span>
				<label for="site-search" class="sr-only">{m.search_title()}</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="site-search"
					type="search"
					bind:value={query}
					oninput={handleInput}
					placeholder={m.search_placeholder()}
					class="flex-1 bg-transparent text-terminal-text-primary placeholder:text-terminal-text-dim outline-none"
					autofocus
					autocomplete="off"
					spellcheck="false"
				/>
			</div>

			<!-- Results -->
			<section aria-label={m.search_results_status()} aria-live="polite" aria-busy={isLoading}>
				{#if isLoading}
					<p class="text-terminal-text-muted text-sm">{m.search_loading()}</p>
				{:else if hasSearched && results.length === 0}
					<p class="text-terminal-text-muted text-sm">{m.search_no_results({ query })}</p>
				{:else if results.length > 0}
					<p class="text-terminal-text-dim text-xs mb-6" role="status">
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
			</section>
		{/if}
	</main>
</div>
