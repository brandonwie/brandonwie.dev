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
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import Mermaid from '$lib/components/Mermaid.svelte';
	import { viewMode } from '$lib/stores/viewMode';

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
	const backLabel = $derived($viewMode === 'terminal' ? m.back_to_terminal() : m.back_to_home());

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

	function diagramKey(id: string): string {
		return id.replace(/[^a-zA-Z0-9]/g, '_');
	}

	// Build the Mermaid source from the snapshot. Constructed as a plain JS string
	// (not inline template markup) so Svelte never tries to parse mermaid braces.
	// Labels are quoted, which lets mermaid handle the parens/slashes/commas in
	// layer names safely.
	function buildMermaid(layers: Layer[], counts: Record<string, number>): string {
		const byId = new Map(layers.map((l) => [l.id, l]));
		const lines = ['flowchart TD'];
		for (const l of layers) {
			lines.push(`\t${diagramKey(l.id)}["${l.name} — ${counts[l.id] ?? 0} nodes"]`);
		}
		// Truthful edge structure when the canonical layer ids are all present:
		// everything is authored in the Source of Truth; generators project it to
		// the symlink mounts + runtimes; the content, governance, and tooling
		// layers all build on the SoT. Degrade to a simple ordered chain otherwise.
		const expected = [
			'source-of-truth',
			'generators-sync',
			'mounts-runtimes',
			'content-lifecycle',
			'governance-audit',
			'tooling-mcp-layer',
		];
		const k = diagramKey;
		if (expected.every((id) => byId.has(id))) {
			lines.push(`\t${k('source-of-truth')} --> ${k('generators-sync')}`);
			lines.push(`\t${k('generators-sync')} --> ${k('mounts-runtimes')}`);
			lines.push(`\t${k('source-of-truth')} --> ${k('content-lifecycle')}`);
			lines.push(`\t${k('source-of-truth')} --> ${k('governance-audit')}`);
			lines.push(`\t${k('source-of-truth')} --> ${k('tooling-mcp-layer')}`);
		} else {
			for (let i = 0; i < layers.length - 1; i++) {
				lines.push(`\t${k(layers[i].id)} --> ${k(layers[i + 1].id)}`);
			}
		}
		return lines.join('\n');
	}

	const mermaidCode = $derived(buildMermaid(snapshot.layers, countByLayer));
</script>

<svelte:head>
	<title>{m.system_3b_title()} | Brandon Wie</title>
	<meta name="description" content={m.system_3b_meta_description()} />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div
			class="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6"
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
				<ViewToggle />
				<LanguageToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6">
		<!-- Intro -->
		<section>
			<div class="mb-2">
				<span class="font-bold text-terminal-accent-orange">&gt;</span>
				<span class="ml-2 text-terminal-text-primary">{m.system_3b_subtitle()}</span>
			</div>
			<p class="max-w-3xl text-sm leading-relaxed text-terminal-text-muted">
				{m.system_3b_intro()}
			</p>
		</section>

		<!-- Overview / stats grid -->
		<section>
			<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
				{m.system_3b_overview_heading()}
			</h2>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{#each snapshot.stats as stat (stat.metric)}
					<div class="rounded-lg border border-terminal-border bg-terminal-bg-secondary p-4">
						<div class="text-2xl font-bold tabular-nums text-terminal-accent-orange">
							{stat.value}
						</div>
						<div class="mt-1 text-xs text-terminal-text-muted">{stat.metric}</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Architecture map -->
		<section>
			<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
				{m.system_3b_map_heading()}
			</h2>
			<Mermaid code={mermaidCode} />
		</section>

		<!-- Layers -->
		<section>
			<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
				{m.system_3b_layers_heading()}
			</h2>
			<div class="space-y-3">
				{#each snapshot.layers as layer, i (layer.id)}
					<div class="rounded-lg border border-terminal-border bg-terminal-bg-secondary p-4">
						<div class="flex items-start justify-between gap-3">
							<h3 class="font-semibold text-terminal-text-primary">
								<span class="tabular-nums text-terminal-text-dim">{i + 1}.</span>
								{layer.name}
							</h3>
							<span
								class="shrink-0 rounded-sm bg-terminal-accent-yellow/20 px-2 py-0.5 text-xs text-terminal-accent-yellow"
							>
								{countByLayer[layer.id] ?? 0}
								{m.system_3b_nodes_label()}
							</span>
						</div>
						<p class="mt-2 text-sm leading-relaxed text-terminal-text-muted">
							{layer.description}
						</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- Subsystems -->
		<section>
			<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
				{m.system_3b_subsystems_heading()}
			</h2>
			<div class="space-y-2">
				{#each snapshot.subsystems as sub (sub.key)}
					<div class="rounded-lg border border-terminal-border bg-terminal-bg-secondary p-3">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-sm font-semibold text-terminal-text-primary">{sub.name}</h3>
							{#if !sub.public_safe}
								<span
									class="rounded-sm bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-dim"
								>
									{m.system_3b_reads_private()}
								</span>
							{/if}
						</div>
						<p class="mt-1 text-sm text-terminal-text-muted">{sub.display_one_liner}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- Decision history (ADRs) -->
		<section>
			<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
				{m.system_3b_evolution_heading()}
			</h2>
			<div
				class="max-h-96 overflow-y-auto rounded-lg border border-terminal-border bg-terminal-bg-secondary"
			>
				<ul class="divide-y divide-terminal-border">
					{#each evolution as adr (adr.id)}
						<li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
							<span class="shrink-0 font-mono text-xs tabular-nums text-terminal-text-dim">
								{adr.date}
							</span>
							<span class="shrink-0 font-mono text-xs text-terminal-accent-green">{adr.id}</span>
							<span class="min-w-0 text-sm text-terminal-text-muted">{adr.title}</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>

		<!-- Blog series progress -->
		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
				{m.system_3b_blog_heading()}
			</h2>
			<p class="mb-4 text-xs text-terminal-text-dim">
				{m.system_3b_blog_progress({
					published: publishedCount,
					total: snapshot.blog_series.length,
				})}
			</p>
			<ol class="space-y-2">
				{#each snapshot.blog_series as post (post.slug)}
					<li class="rounded-lg border border-terminal-border bg-terminal-bg-secondary p-3">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<span class="tabular-nums text-terminal-text-dim">{post.order}.</span>
								{#if post.status === 'published'}
									<a
										href="{basePath}/posts/{post.slug}"
										class="text-sm font-medium text-terminal-accent-orange hover:underline"
									>
										{post.title}
									</a>
								{:else}
									<span class="text-sm font-medium text-terminal-text-muted">{post.title}</span>
								{/if}
							</div>
							{#if post.status === 'published'}
								<span
									class="shrink-0 rounded-sm bg-terminal-accent-green/20 px-2 py-0.5 text-xs text-terminal-accent-green"
								>
									{m.system_3b_published()}
								</span>
							{:else}
								<span
									class="shrink-0 rounded-sm bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-dim"
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
		<section>
			<h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim">
				{m.system_3b_status_heading()}
			</h2>
			<div class="rounded-lg border border-terminal-border bg-terminal-bg-secondary p-4">
				<div class="flex items-baseline justify-between gap-4">
					<span class="text-sm text-terminal-text-muted">{m.system_3b_model_generated()}</span>
					<span class="font-mono text-sm tabular-nums text-terminal-text-primary">
						{snapshot.model_generated}
					</span>
				</div>
				<div class="mt-1 flex items-baseline justify-between gap-4">
					<span class="text-sm text-terminal-text-muted">{m.system_3b_snapshot_built()}</span>
					<span class="font-mono text-sm tabular-nums text-terminal-text-primary">
						{snapshot.snapshot_built_at}
					</span>
				</div>
				<p class="mt-3 text-xs leading-relaxed text-terminal-text-dim">
					{m.system_3b_status_note()}
				</p>
			</div>
		</section>
	</main>
</div>
