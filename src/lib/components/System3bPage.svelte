<!--
	System3bPage.svelte - Public 3B system hub (URL: /system/3b, /ko/system/3b)
	==========================================================================

	WHAT: Renders a sanitized, public view of the 3B agent-harness architecture
	      (layers, subsystems, decision history, blog series, snapshot status).
	WHY:  Public-facing architecture transparency without exposing private 3B
	      content. The ONLY data source is the pre-sanitized system-snapshot.json
	      (see scripts/snapshot-3b-system.ts + its CI privacy gate). This component
	      adds NO additional 3B reads.
	HOW:  Receives the snapshot via the `data` prop from +page.ts `load`
	      (build-time static import, prerendered). `locale` drives internal link
	      base paths only — translation is handled by paraglide `m.*()` calls.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import System3bGraph from '$lib/components/System3bGraph.svelte';
	import { absoluteUrl, DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	interface Layer {
		id: string;
		name: string;
		description: string;
	}
	interface Subsystem {
		key: string;
		name: string;
		display_one_liner: string;
		public_safe: boolean;
	}
	interface NodeItem {
		id: string;
		kind: string;
		layer: string;
		subsystem?: string;
		name: string;
	}
	interface EdgeItem {
		from: string;
		to: string;
		kind: string;
		label: string;
	}
	interface FlowItem {
		id: string;
		display_label: string;
	}
	interface BlogItem {
		order: number;
		slug: string;
		title: string;
		status: string;
	}
	interface AdrItem {
		id: string;
		title: string;
		date: string;
	}
	interface Stat {
		metric: string;
		value: string;
	}
	interface Snapshot {
		model_generated: string;
		snapshot_built_at: string;
		layers: Layer[];
		subsystems: Subsystem[];
		nodes: NodeItem[];
		edges: EdgeItem[];
		flows: FlowItem[];
		blog_series: BlogItem[];
		evolution: AdrItem[];
		stats: Stat[];
	}

	interface Props {
		locale: 'en' | 'ko';
		snapshot: Snapshot;
	}

	let { locale, snapshot }: Props = $props();

	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const canonicalHref = $derived(absoluteUrl(locale === 'ko' ? '/ko/system/3b' : '/system/3b'));
	const pageTitle = $derived(`${m.system_3b_title()} | Brandon Wie`);
	const pageDescription = $derived(m.system_3b_meta_description());
	const evolutionHeadingId = 'system-3b-evolution-heading';

	// Node count per layer, derived from the snapshot so the diagram + badges
	// stay accurate across snapshot regenerations.
	const countByLayer = $derived.by(() => {
		const map: Record<string, number> = {};
		for (const n of snapshot.nodes) map[n.layer] = (map[n.layer] ?? 0) + 1;
		return map;
	});

	const publishedCount = $derived(
		snapshot.blog_series.filter((b) => b.status === 'published').length,
	);

	// Decision history, newest first.
	const evolution = $derived([...snapshot.evolution].sort((a, b) => b.date.localeCompare(a.date)));
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href={absoluteUrl('/system/3b')} />
	<link rel="alternate" hreflang="ko" href={absoluteUrl('/ko/system/3b')} />
	<link rel="alternate" hreflang="x-default" href={absoluteUrl('/system/3b')} />
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

{#snippet secHead(label: string, id?: string)}
	<div class="mb-5 flex items-center gap-3.5">
		<span class="font-mono font-bold text-foam">#</span>
		<h2 {id} class="font-sans text-xl font-semibold tracking-tight text-ink">{label}</h2>
		<span class="h-px flex-1 bg-line2"></span>
	</div>
{/snippet}

<main id="main-content" class="mx-auto max-w-6xl px-6 py-12 lg:py-16">
	<!-- Header -->
	<section class="max-w-3xl">
		<div
			class="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint"
		>
			<a href={basePath || '/'} class="transition-colors hover:text-foam">~</a>
			<span class="text-line2">/</span>
			<span>system</span>
			<span class="text-line2">/</span>
			<span>3b</span>
		</div>
		<p class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
			{m.system_3b_subtitle()}
		</p>
		<h1 class="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
			{m.system_3b_title()}
		</h1>
		<p class="mt-6 font-sans text-lg leading-8 text-muted">
			{m.system_3b_intro()}
		</p>
	</section>

	<!-- Overview / stats grid -->
	<section class="mt-14">
		{@render secHead(m.system_3b_overview_heading())}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{#each snapshot.stats as stat (stat.metric)}
				<div
					class="rounded-lg border border-line2 bg-surface p-4 transition-colors hover:border-foam"
				>
					<div class="font-sans text-2xl font-bold tabular-nums text-foam">{stat.value}</div>
					<div class="mt-1 font-mono text-xs text-muted">{stat.metric}</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Architecture map -->
	<section class="mt-16">
		{@render secHead(m.system_3b_map_heading())}
		<System3bGraph nodes={snapshot.nodes} edges={snapshot.edges} layers={snapshot.layers} />
	</section>

	<!-- Layers -->
	<section class="mt-16">
		{@render secHead(m.system_3b_layers_heading())}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each snapshot.layers as layer, i (layer.id)}
				<article
					class="rounded-lg border border-line2 bg-surface p-5 transition-colors hover:border-foam"
				>
					<div class="flex items-start justify-between gap-3">
						<h3 class="font-sans text-base font-semibold text-ink">
							<span class="font-mono tabular-nums text-faint">{i + 1}.</span>
							{layer.name}
						</h3>
						<span
							class="shrink-0 rounded border border-line2 px-2 py-0.5 font-mono text-xs text-foam"
						>
							{countByLayer[layer.id] ?? 0}
							{m.system_3b_nodes_label()}
						</span>
					</div>
					<p class="mt-3 font-sans text-sm leading-7 text-muted">{layer.description}</p>
				</article>
			{/each}
		</div>
	</section>

	<!-- Subsystems -->
	<section class="mt-16">
		{@render secHead(m.system_3b_subsystems_heading())}
		<div class="grid gap-3 lg:grid-cols-2">
			{#each snapshot.subsystems as sub (sub.key)}
				<article
					class="rounded-lg border border-line2 bg-surface p-4 transition-colors hover:border-foam"
				>
					<div class="flex flex-wrap items-center gap-2">
						<h3 class="font-sans text-sm font-semibold text-ink">{sub.name}</h3>
						{#if !sub.public_safe}
							<span class="rounded border border-line2 px-2 py-0.5 font-mono text-xs text-faint">
								{m.system_3b_reads_private()}
							</span>
						{/if}
					</div>
					<p class="mt-2 font-sans text-sm leading-7 text-muted">{sub.display_one_liner}</p>
				</article>
			{/each}
		</div>
	</section>

	<!-- Decision history (ADRs) -->
	<section class="mt-16">
		{@render secHead(m.system_3b_evolution_heading(), evolutionHeadingId)}
		<!-- axe requires keyboard focus for this scrollable region. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="max-h-96 overflow-y-auto rounded-lg border border-line2 bg-surface"
			role="region"
			tabindex="0"
			aria-labelledby={evolutionHeadingId}
		>
			<ul class="divide-y divide-line">
				{#each evolution as adr (adr.id)}
					<li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
						<span class="shrink-0 font-mono text-xs tabular-nums text-faint">{adr.date}</span>
						<span class="shrink-0 font-mono text-xs text-foam">{adr.id}</span>
						<span class="min-w-0 font-sans text-sm text-muted">{adr.title}</span>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<!-- Blog series progress -->
	<section class="mt-16">
		{@render secHead(m.system_3b_blog_heading())}
		<p class="mb-4 font-mono text-xs text-faint">
			{m.system_3b_blog_progress({
				published: publishedCount,
				total: snapshot.blog_series.length,
			})}
		</p>
		<ol class="grid gap-3 lg:grid-cols-2">
			{#each snapshot.blog_series as post (post.slug)}
				<li
					class="rounded-lg border border-line2 bg-surface p-4 transition-colors hover:border-foam"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<span class="font-mono tabular-nums text-faint">{post.order}.</span>
							{#if post.status === 'published'}
								<a
									href="{basePath}/posts/{post.slug}"
									class="font-sans text-sm font-medium text-foam hover:underline"
								>
									{post.title}
								</a>
							{:else}
								<span class="font-sans text-sm font-medium text-muted">{post.title}</span>
							{/if}
						</div>
						{#if post.status === 'published'}
							<span
								class="shrink-0 rounded border border-line2 px-2 py-0.5 font-mono text-xs text-foam"
							>
								{m.system_3b_published()}
							</span>
						{:else}
							<span
								class="shrink-0 rounded border border-line2 px-2 py-0.5 font-mono text-xs text-faint"
							>
								{m.system_3b_planned()}
							</span>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<!-- Snapshot status -->
	<section class="mt-16">
		{@render secHead(m.system_3b_status_heading())}
		<div class="rounded-lg border border-line2 bg-surface p-5">
			<div class="flex items-baseline justify-between gap-4">
				<span class="font-sans text-sm text-muted">{m.system_3b_model_generated()}</span>
				<span class="font-mono text-sm tabular-nums text-ink">{snapshot.model_generated}</span>
			</div>
			<div class="mt-2 flex items-baseline justify-between gap-4">
				<span class="font-sans text-sm text-muted">{m.system_3b_snapshot_built()}</span>
				<span class="font-mono text-sm tabular-nums text-ink">{snapshot.snapshot_built_at}</span>
			</div>
			<p class="mt-3 font-mono text-xs leading-relaxed text-faint">{m.system_3b_status_note()}</p>
		</div>
	</section>
</main>
