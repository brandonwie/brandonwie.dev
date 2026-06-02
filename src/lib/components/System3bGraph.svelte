<!--
	System3bGraph.svelte — prerender-safe wrapper around the interactive graph.
	@xyflow/svelte + dagre touch the DOM and are heavy, and /system/3b prerenders
	under adapter-static (strict). So this wrapper:
	  • imports the helper TYPE-ONLY (erased at build → dagre never enters the shell)
	  • lazy-imports System3bFlow in onMount (client-only, code-split)
	  • renders a real static fallback for SSR / prerender / no-JS / load failure
	Data = the already-sanitized snapshot props passed down from System3bPage.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SnapNode, SnapEdge, SnapLayer } from '$lib/utils/system3b-graph';

	interface Props {
		nodes: SnapNode[];
		edges: SnapEdge[];
		layers: SnapLayer[];
		locale?: 'en' | 'ko';
	}
	let { nodes, edges, layers, locale = 'en' }: Props = $props();

	let Flow = $state<Component<Props> | null>(null);
	let failed = $state(false);

	onMount(async () => {
		try {
			Flow = (await import('./System3bFlow.svelte')).default as unknown as Component<Props>;
		} catch (err) {
			console.error('[System3bGraph] failed to load interactive graph:', err);
			failed = true;
		}
	});

	// Fallback only — pure reduce, no helper import (keeps dagre out of the shell).
	const countByLayer = $derived.by(() => {
		const m: Record<string, number> = {};
		for (const n of nodes) m[n.layer] = (m[n.layer] ?? 0) + 1;
		return m;
	});
</script>

{#if Flow}
	<Flow {nodes} {edges} {layers} {locale} />
{:else}
	<div class="s3b-fallback" class:failed>
		<p class="note">
			{#if failed}
				{m.system_3b_graph_unavailable()}
			{:else}
				{m.system_3b_graph_loading()}
			{/if}
		</p>
		<ol class="layers">
			{#each layers as layer, i (layer.id)}
				<li>
					<div class="head">
						<span class="idx">{i + 1}.</span>
						<span class="name">{layer.name}</span>
						<span class="count">{countByLayer[layer.id] ?? 0} {m.system_3b_nodes_label()}</span>
					</div>
					<p class="desc">{layer.description}</p>
				</li>
			{/each}
		</ol>
	</div>
{/if}

<style>
	.s3b-fallback {
		border: 1px solid #404040;
		border-radius: 12px;
		padding: 16px;
		background: #1a1a1a;
	}
	.note {
		margin: 0 0 12px;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 12px;
		color: #666666;
	}
	.s3b-fallback.failed .note {
		color: #e5c07b;
	}
	.layers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.idx {
		color: #666666;
		font-variant-numeric: tabular-nums;
	}
	.name {
		color: #e5e5e5;
		font-weight: 600;
	}
	.count {
		margin-left: auto;
		color: #e5c07b;
		font-size: 11px;
		white-space: nowrap;
	}
	.desc {
		margin: 4px 0 0;
		color: #888888;
		font-size: 13px;
		line-height: 1.5;
	}
</style>
