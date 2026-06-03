<!--
	System3bFlow.svelte — the interactive @xyflow/svelte graph (CLIENT-ONLY).
	Loaded lazily by System3bGraph.svelte so @xyflow never reaches the prerendered
	shell. Overview = 11 subsystem chips in 6 layer lanes + 21 aggregated edges;
	click a chip → drill down to its member nodes + real edges.
	Data source = the already-sanitized snapshot props (no new 3B reads).
-->
<script lang="ts">
	import { SvelteFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { m } from '$lib/paraglide/messages';
	import System3bNode from './System3bNode.svelte';
	import System3bBandNode from './System3bBandNode.svelte';
	import FitView from './System3bFitView.svelte';
	import {
		buildOverview,
		buildDrilldown,
		kindStyle,
		KIND_STYLE,
		EDGE_STYLE,
		BAND_H,
		type SnapNode,
		type SnapEdge,
		type SnapLayer,
		type FlowModel,
	} from '$lib/utils/system3b-graph';

	interface Props {
		nodes: SnapNode[];
		edges: SnapEdge[];
		layers: SnapLayer[];
	}
	let { nodes: snapNodes, edges: snapEdges, layers }: Props = $props();

	const nodeTypes = {
		subsystem: System3bNode,
		leaf: System3bNode,
		band: System3bBandNode,
	} as const;

	let expandedSubKey = $state<string | null>(null);
	let hovered = $state<string | null>(null);

	const model: FlowModel = $derived(
		expandedSubKey
			? buildDrilldown(snapNodes, snapEdges, layers, expandedSubKey)
			: buildOverview(snapNodes, snapEdges, layers),
	);
	const expandedName = $derived(
		expandedSubKey
			? (snapNodes.find((n) => n.subsystem === expandedSubKey && n.kind === 'subsystem')?.name ??
					expandedSubKey)
			: null,
	);

	function expand(key: string) {
		expandedSubKey = key;
		hovered = null;
	}
	function reset() {
		expandedSubKey = null;
		hovered = null;
	}
	function setHover(v: string | null) {
		hovered = v;
	}

	// $state.raw (not $state): SvelteFlow requires full-array reassignment per change;
	// in-place mutations (push/splice) are NOT tracked. Both arrays are reassigned wholesale below.
	let flowNodes = $state.raw<Node[]>([]);
	let flowEdges = $state.raw<Edge[]>([]);

	// Rebuild nodes only when the model (altitude) changes — NOT on hover.
	$effect(() => {
		const bands: Node[] = model.bands.map((b) => ({
			id: `band-${b.layer}`,
			type: 'band',
			position: { x: -24, y: b.y - 26 },
			data: { name: b.name, width: model.width + 48, height: BAND_H - 14 },
			draggable: false,
			selectable: false,
			zIndex: -1,
		})) as unknown as Node[];
		const chips: Node[] = model.nodes.map((n) => ({
			...n,
			data: { ...n.data, onExpand: expand, onHover: setHover },
		})) as unknown as Node[];
		flowNodes = [...bands, ...chips];
	});

	// Re-style edges on hover (dim non-incident) without rebuilding nodes.
	$effect(() => {
		const h = hovered;
		flowEdges = model.edges.map((e) => {
			const incident = !h || e.source === h || e.target === h;
			return {
				...e,
				style: incident ? e.style : `${e.style};opacity:0.1`,
				animated: incident ? e.animated : false,
			};
		}) as unknown as Edge[];
	});

	function mmColor(n: Node): string {
		if (n.type === 'band') return 'transparent';
		return kindStyle(String((n.data as Record<string, unknown>)?.kind)).color;
	}
</script>

<div class="s3b-flow">
	<div class="toolbar">
		<span class="title">
			{#if expandedSubKey}<span class="crumb">▸</span>
				{expandedName}{:else}{m.system_3b_graph_overview()}{/if}
		</span>
		<div class="spacer"></div>
		{#if expandedSubKey}
			<button type="button" class="btn" onclick={reset}>← {m.system_3b_graph_back()}</button>
		{:else}
			<span class="hint">{m.system_3b_graph_expand_hint()}</span>
		{/if}
	</div>

	<div class="canvas">
		<SvelteFlow
			bind:nodes={flowNodes}
			bind:edges={flowEdges}
			{nodeTypes}
			colorMode="dark"
			fitView
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={false}
			minZoom={0.3}
			maxZoom={1.6}
			proOptions={{ hideAttribution: true }}
		>
			<Background bgColor="#1a1a1a" patternColor="#2b2b2b" gap={22} />
			<Controls showLock={false} />
			<MiniMap
				pannable
				zoomable
				nodeColor={mmColor}
				maskColor="rgba(10,10,10,0.6)"
				bgColor="#161616"
			/>
			<FitView trigger={expandedSubKey} />
		</SvelteFlow>
	</div>

	<div class="legend">
		<div class="legend-row">
			<span class="legend-head">{m.system_3b_nodes_label()}</span>
			{#each Object.entries(KIND_STYLE) as [kind, s] (kind)}
				<span class="chip"><span class="swatch" style:background={s.color}></span>{s.label}</span>
			{/each}
		</div>
		<div class="legend-row">
			<span class="legend-head">{m.system_3b_graph_relations_legend()}</span>
			{#each Object.entries(EDGE_STYLE) as [kind, s] (kind)}
				<span class="chip"
					><span class="line" style:border-top="2px {s.dash ? 'dashed' : 'solid'} {s.color}"
					></span>{s.label}</span
				>
			{/each}
		</div>
	</div>
</div>

<style>
	.s3b-flow {
		border: 1px solid #404040;
		border-radius: 12px;
		overflow: hidden;
		background: #1a1a1a;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid #404040;
		background: #2d2d2d;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 12px;
	}
	.title {
		color: #e5e5e5;
	}
	.crumb {
		color: #a855f7;
	}
	.spacer {
		flex: 1;
	}
	.hint {
		color: #666666;
	}
	.btn {
		background: #1a1a1a;
		border: 1px solid #404040;
		border-radius: 6px;
		color: #e5e5e5;
		font: inherit;
		padding: 4px 10px;
		cursor: pointer;
	}
	.btn:hover {
		border-color: #a855f7;
		color: #a855f7;
	}
	.canvas {
		height: clamp(440px, 70vh, 760px);
		width: 100%;
	}
	.legend {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid #404040;
		background: #2d2d2d;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 11px;
	}
	.legend-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.legend-head {
		color: #666666;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		min-width: 64px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: #888888;
	}
	.swatch {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		display: inline-block;
	}
	.line {
		width: 16px;
		height: 0;
		display: inline-block;
		vertical-align: middle;
	}
	/* xyflow surface tweaks to match the terminal palette */
	.canvas :global(.svelte-flow) {
		background: #1a1a1a;
	}
	.canvas :global(.svelte-flow__controls-button) {
		background: #2d2d2d;
		border-bottom: 1px solid #404040;
		fill: #e5e5e5;
		color: #e5e5e5;
	}
	.canvas :global(.svelte-flow__controls-button:hover) {
		background: #353535;
	}
	.canvas :global(.svelte-flow__edge-path) {
		transition: opacity 120ms ease;
	}
</style>
