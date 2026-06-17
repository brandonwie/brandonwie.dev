<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import HeaderControls from '$lib/components/HeaderControls.svelte';

	interface Props {
		locale: 'en' | 'ko';
	}

	let { locale }: Props = $props();

	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const backLabel = m.back_to_home();

	// Stats come from the same-origin Cloudflare Pages Function at /api/stats,
	// which holds the Umami API key server-side. No secrets in the client.
	const CACHE_KEY = 'umami-stats';
	const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

	interface StatsData {
		active: number;
		pageviews: number;
		visitors: number;
		visits: number;
		bounces: number;
		totaltime: number;
		topPages: Array<{ x: string; y: number }>;
		referrers: Array<{ x: string; y: number }>;
	}

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let stats = $state<StatsData | null>(null);

	function formatDuration(totaltime: number, visits: number): string {
		if (visits === 0) return '0s';
		const avgSeconds = Math.round(totaltime / visits);
		const minutes = Math.floor(avgSeconds / 60);
		const seconds = avgSeconds % 60;
		if (minutes === 0) return `${seconds}s`;
		return `${minutes}m ${seconds}s`;
	}

	function formatBounceRate(bounces: number, visits: number): string {
		if (visits === 0) return '0%';
		return `${Math.round((bounces / visits) * 100)}%`;
	}

	function formatNumber(n: number): string {
		return n.toLocaleString();
	}

	function getCachedData(): StatsData | null {
		try {
			const cached = sessionStorage.getItem(CACHE_KEY);
			if (!cached) return null;
			const { data, timestamp } = JSON.parse(cached);
			if (Date.now() - timestamp > CACHE_TTL) {
				sessionStorage.removeItem(CACHE_KEY);
				return null;
			}
			return data;
		} catch {
			return null;
		}
	}

	function setCachedData(data: StatsData): void {
		try {
			sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
		} catch {
			// sessionStorage might be full or unavailable
		}
	}

	async function fetchStats(): Promise<StatsData> {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const res = await fetch(`/api/stats?tz=${encodeURIComponent(tz)}`);
		if (!res.ok) {
			throw new Error('Failed to fetch analytics data');
		}
		return (await res.json()) as StatsData;
	}

	onMount(async () => {
		const cached = getCachedData();
		if (cached) {
			stats = cached;
			isLoading = false;
			return;
		}

		try {
			const data = await fetchStats();
			stats = data;
			setCachedData(data);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	});
</script>

<svelte:head>
	<title>{m.stats_title()} | Brandon Wie</title>
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div
			class="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6"
		>
			<a
				href={basePath || '/'}
				class="flex shrink-0 items-center gap-1 text-xs text-terminal-text-muted transition-colors hover:text-terminal-accent-orange sm:gap-2 sm:text-sm"
			>
				<span>&larr;</span>
				<span>{backLabel}</span>
			</a>
			<a href={basePath || '/'} class="truncate text-xs text-terminal-accent-orange sm:text-base">
				brandonwie.dev
			</a>
			<div class="flex items-center gap-2">
				<HeaderControls />
			</div>
		</div>
	</header>

	<!-- Stats Content -->
	<main class="mx-auto max-w-2xl px-4 py-10 sm:px-6">
		<div class="mb-6">
			<span class="font-bold text-terminal-accent-orange">&gt;</span>
			<span class="ml-2 text-terminal-text-primary">{m.stats_subtitle()}</span>
		</div>

		<div class="border-t border-terminal-border">
			{#if isLoading}
				<div class="py-12 text-center">
					<p class="text-sm text-terminal-text-muted">{m.stats_loading()}</p>
				</div>
			{:else if error}
				<div class="py-12 text-center">
					<p class="text-sm text-red-400">{m.stats_error()}</p>
					<p class="mt-2 text-xs text-terminal-text-dim">{error}</p>
				</div>
			{:else if stats}
				<!-- Active visitors -->
				<div class="py-4">
					<span class="text-sm text-terminal-accent-green">&#9679;</span>
					<span class="ml-2 text-sm text-terminal-text-primary">
						{stats.active}
					</span>
					<span class="ml-1 text-sm text-terminal-text-muted">{m.stats_active_now()}</span>
				</div>

				<!-- 30-day overview -->
				<div class="mb-6 rounded-lg border border-terminal-border bg-terminal-bg-secondary p-6">
					<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
						{m.stats_last_30_days()}
					</h2>
					<div class="space-y-2">
						<div class="flex items-baseline justify-between">
							<span class="text-sm text-terminal-text-muted">{m.stats_pageviews()}</span>
							<span class="text-sm tabular-nums text-terminal-text-primary"
								>{formatNumber(stats.pageviews)}</span
							>
						</div>
						<div class="flex items-baseline justify-between">
							<span class="text-sm text-terminal-text-muted">{m.stats_visitors()}</span>
							<span class="text-sm tabular-nums text-terminal-text-primary"
								>{formatNumber(stats.visitors)}</span
							>
						</div>
						<div class="flex items-baseline justify-between">
							<span class="text-sm text-terminal-text-muted">{m.stats_visits()}</span>
							<span class="text-sm tabular-nums text-terminal-text-primary"
								>{formatNumber(stats.visits)}</span
							>
						</div>
						<div class="flex items-baseline justify-between">
							<span class="text-sm text-terminal-text-muted">{m.stats_bounce_rate()}</span>
							<span class="text-sm tabular-nums text-terminal-text-primary"
								>{formatBounceRate(stats.bounces, stats.visits)}</span
							>
						</div>
						<div class="flex items-baseline justify-between">
							<span class="text-sm text-terminal-text-muted">{m.stats_avg_time()}</span>
							<span class="text-sm tabular-nums text-terminal-text-primary"
								>{formatDuration(stats.totaltime, stats.visits)}</span
							>
						</div>
					</div>
				</div>

				<!-- Top pages -->
				{#if stats.topPages.length > 0}
					<div class="mb-6 rounded-lg border border-terminal-border bg-terminal-bg-secondary p-6">
						<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
							{m.stats_top_pages()}
						</h2>
						<div class="space-y-2">
							{#each stats.topPages as page (page.x)}
								<div class="flex items-baseline justify-between gap-4">
									<span class="min-w-0 truncate text-sm text-terminal-text-muted">{page.x}</span>
									<span class="shrink-0 text-sm tabular-nums text-terminal-text-primary"
										>{formatNumber(page.y)}</span
									>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Referrers -->
				{#if stats.referrers.length > 0}
					<div class="rounded-lg border border-terminal-border bg-terminal-bg-secondary p-6">
						<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
							{m.stats_referrers()}
						</h2>
						<div class="space-y-2">
							{#each stats.referrers as ref (ref.x)}
								<div class="flex items-baseline justify-between gap-4">
									<span class="min-w-0 truncate text-sm text-terminal-text-muted"
										>{ref.x || '(direct)'}</span
									>
									<span class="shrink-0 text-sm tabular-nums text-terminal-text-primary"
										>{formatNumber(ref.y)}</span
									>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</main>
</div>
