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

	// Legend labels routed through Paraglide. Static property refs (not m[key])
	// so keys resolve at build time; falls back to the style .label if unmapped.
	const KIND_LABEL: Record<string, () => string> = {
		subsystem: m.system_3b_kind_subsystem,
		generator: m.system_3b_kind_generator,
		runtime: m.system_3b_kind_runtime,
		store: m.system_3b_kind_store,
		doc: m.system_3b_kind_doc,
		gate: m.system_3b_kind_gate,
	};
	const EDGE_LABEL: Record<string, () => string> = {
		dependency: m.system_3b_edge_dependency,
		reads: m.system_3b_edge_reads,
		writes: m.system_3b_edge_writes,
		generates: m.system_3b_edge_generates,
		triggers: m.system_3b_edge_triggers,
		dataflow: m.system_3b_edge_dataflow,
		symlink: m.system_3b_edge_symlink,
	};

	const FLOW_BG = '#13111c'; // --bg
	const FLOW_BG2 = '#191724'; // --bg2
	const FLOW_OVERLAY = '#26233a'; // --overlay
	const FLOW_MASK = 'rgba(19, 17, 28, 0.6)'; // --bg @ 0.6 opacity

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
			<Background bgColor={FLOW_BG} patternColor={FLOW_OVERLAY} gap={22} />
			<Controls showLock={false} />
			<MiniMap pannable zoomable nodeColor={mmColor} maskColor={FLOW_MASK} bgColor={FLOW_BG2} />
			<FitView trigger={expandedSubKey} />
		</SvelteFlow>
	</div>

	<div class="legend">
		<div class="legend-row">
			<span class="legend-head">{m.system_3b_nodes_label()}</span>
			{#each Object.entries(KIND_STYLE) as [kind, s] (kind)}
				<span class="chip"
					><span class="swatch" style:background={s.color}></span>{KIND_LABEL[kind]?.() ??
						s.label}</span
				>
			{/each}
		</div>
		<div class="legend-row">
			<span class="legend-head">{m.system_3b_graph_relations_legend()}</span>
			{#each Object.entries(EDGE_STYLE) as [kind, s] (kind)}
				<span class="chip"
					><span class="line" style:border-top="2px {s.dash ? 'dashed' : 'solid'} {s.color}"
					></span>{EDGE_LABEL[kind]?.() ?? s.label}</span
				>
			{/each}
		</div>
	</div>
</div>

<style>
	.s3b-flow {
		border: 1px solid var(--line2);
		border-radius: 12px;
		overflow: hidden;
		background: var(--panel);
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line2);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.title {
		color: var(--ink);
	}
	.crumb {
		color: var(--foam);
	}
	.spacer {
		flex: 1;
	}
	.hint {
		color: var(--faint);
	}
	.btn {
		background: var(--bg);
		border: 1px solid var(--line2);
		border-radius: 6px;
		color: var(--ink);
		font: inherit;
		padding: 4px 10px;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			color 120ms ease;
	}
	.btn:hover {
		border-color: var(--foam);
		color: var(--foam);
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
		border-top: 1px solid var(--line2);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.legend-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.legend-head {
		color: var(--faint);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		min-width: 64px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--faint);
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
		background: var(--panel);
	}
	.canvas :global(.svelte-flow__controls-button) {
		background: var(--surface);
		border-bottom: 1px solid var(--line2);
		fill: var(--ink);
		color: var(--ink);
	}
	.canvas :global(.svelte-flow__controls-button:hover) {
		background: var(--overlay);
	}
	.canvas :global(.svelte-flow__edge-path) {
		transition: opacity 120ms ease;
	}
</style>
