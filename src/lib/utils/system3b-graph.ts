/**
 * system3b-graph.ts — pure, DOM-free model + layout helpers for the /system/3b
 * architecture graph. No Svelte, no browser APIs: importable from a plain Node
 * script for unit checks, and tree-shake-friendly. dagre is the only heavy
 * import here, and only the lazy-loaded System3bFlow component pulls this file,
 * so dagre never reaches the prerendered shell.
 *
 * Data source = the already-sanitized system-snapshot.json (nodes/edges/layers/
 * subsystems). Rendering it adds no new privacy surface.
 */
import dagre from '@dagrejs/dagre';

// ---- snapshot shapes (subset we consume) ----
export interface SnapNode {
	id: string;
	kind: string;
	layer: string;
	subsystem?: string;
	name: string;
}
export interface SnapEdge {
	from: string;
	to: string;
	kind: string;
	label: string;
}
export interface SnapLayer {
	id: string;
	name: string;
	description: string;
}

// ---- canonical layer order (top SoT band → tooling band) ----
export const LAYER_ORDER = [
	'source-of-truth',
	'generators-sync',
	'mounts-runtimes',
	'content-lifecycle',
	'governance-audit',
	'tooling-mcp-layer',
] as const;
export type LayerId = (typeof LAYER_ORDER)[number];

export function layerIndex(layer: string): number {
	const i = LAYER_ORDER.indexOf(layer as LayerId);
	return i === -1 ? LAYER_ORDER.length : i;
}

// ---- node-kind styling (6 kinds → terminal palette) ----
export interface KindStyle {
	color: string;
	label: string;
}
export const KIND_STYLE: Record<string, KindStyle> = {
	subsystem: { color: '#c4a7e7', label: 'subsystem' }, // iris
	generator: { color: '#31748f', label: 'generator' }, // pine
	runtime: { color: '#9ccfd8', label: 'runtime' }, // foam
	store: { color: '#f6c177', label: 'store' }, // gold
	doc: { color: '#ebbcba', label: 'doc' }, // rose
	gate: { color: '#eb6f92', label: 'gate' }, // love
};
export const KIND_FALLBACK: KindStyle = { color: '#908caa', label: 'node' };
export function kindStyle(kind: string): KindStyle {
	return KIND_STYLE[kind] ?? KIND_FALLBACK;
}

// ---- edge-kind styling (7 relation kinds → color + dash + motion) ----
export interface EdgeStyle {
	color: string;
	dash?: string;
	animated: boolean;
	label: string;
}
export const EDGE_STYLE: Record<string, EdgeStyle> = {
	dependency: { color: '#6e6a86', animated: false, label: 'depends on' },
	reads: { color: '#9ccfd8', dash: '6 4', animated: false, label: 'reads' },
	writes: { color: '#c4a7e7', animated: false, label: 'writes' },
	generates: { color: '#31748f', animated: false, label: 'generates' },
	triggers: { color: '#ebbcba', dash: '2 4', animated: true, label: 'triggers' },
	dataflow: { color: '#9ccfd8', animated: true, label: 'data flow' },
	symlink: { color: '#f6c177', dash: '1 5', animated: false, label: 'symlink' },
};
export const EDGE_FALLBACK: EdgeStyle = { color: '#6e6a86', animated: false, label: '' };
export function edgeStyle(kind: string): EdgeStyle {
	return EDGE_STYLE[kind] ?? EDGE_FALLBACK;
}

// ---- subsystem aggregation ----
export interface SuperEdge {
	from: string; // subsystem key
	to: string; // subsystem key
	weight: number; // # of underlying edges collapsed
	dominantKind: string; // most common underlying edge kind
}

/** Map any node id → its subsystem key (via node.subsystem). */
function subsystemIndex(nodes: SnapNode[]): Map<string, string> {
	const m = new Map<string, string>();
	for (const n of nodes) if (n.subsystem) m.set(n.id, n.subsystem);
	return m;
}

/**
 * Collapse the 93 raw edges into directed subsystem→subsystem super-edges.
 * Drops intra-subsystem edges and edges whose endpoints lack a subsystem.
 */
export function aggregateSubsystemEdges(nodes: SnapNode[], edges: SnapEdge[]): SuperEdge[] {
	const sub = subsystemIndex(nodes);
	const acc = new Map<string, { weight: number; kinds: Record<string, number> }>();
	for (const e of edges) {
		const a = sub.get(e.from);
		const b = sub.get(e.to);
		if (!a || !b || a === b) continue; // intra or unmapped → skip
		const key = `${a}\u0000${b}`;
		const cur = acc.get(key) ?? { weight: 0, kinds: {} };
		cur.weight += 1;
		cur.kinds[e.kind] = (cur.kinds[e.kind] ?? 0) + 1;
		acc.set(key, cur);
	}
	const out: SuperEdge[] = [];
	for (const [key, v] of acc) {
		const [from, to] = key.split('\u0000');
		// Secondary alpha sort breaks count ties deterministically (stable styling across builds).
		const dominantKind = Object.entries(v.kinds).sort(
			(x, y) => y[1] - x[1] || x[0].localeCompare(y[0]),
		)[0][0];
		out.push({ from, to, weight: v.weight, dominantKind });
	}
	return out;
}

/** The 11 subsystem nodes (kind === 'subsystem'), in layer order. */
export function subsystemNodes(nodes: SnapNode[]): SnapNode[] {
	return nodes
		.filter((n) => n.kind === 'subsystem')
		.sort((a, b) => layerIndex(a.layer) - layerIndex(b.layer));
}

/** Member leaf nodes of a subsystem (everything sharing the subsystem key). */
export function memberNodesOf(subKey: string, nodes: SnapNode[]): SnapNode[] {
	return nodes
		.filter((n) => n.subsystem === subKey)
		.sort((a, b) => layerIndex(a.layer) - layerIndex(b.layer));
}

/** Raw edges whose BOTH endpoints are in the given id set. */
export function edgesWithin(ids: Set<string>, edges: SnapEdge[]): SnapEdge[] {
	return edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}

// ---- layout: fixed y per layer band, dagre-informed x ordering ----
export interface Positioned {
	id: string;
	x: number;
	y: number;
	layer: string;
}
export interface LayoutResult {
	positions: Map<string, Positioned>;
	width: number;
	bands: { layer: string; y: number }[];
}

export const NODE_W = 180;
export const NODE_H = 56;
export const BAND_H = 132;
const BAND_TOP = 28;
const COL_GAP = 40;
const SIDE_PAD = 32;

/**
 * Lay nodes into horizontal layer bands (y = fixed per layer). dagre computes a
 * crossing-aware left→right ORDER within each band; we then place nodes evenly.
 * Deterministic — same input always yields the same coordinates.
 */
export function layoutByBands(
	items: { id: string; layer: string }[],
	relEdges: { from: string; to: string }[],
	/** true → render all 6 canonical lanes (empty ones leave a gap); false → compact to used layers. */
	fullBands = false,
): LayoutResult {
	// 1. dagre pass for x-ordering (we keep its relative order, not raw coords).
	const order = new Map<string, number>();
	try {
		const g = new dagre.graphlib.Graph();
		g.setGraph({ rankdir: 'TB', nodesep: COL_GAP, ranksep: BAND_H });
		g.setDefaultEdgeLabel(() => ({}));
		for (const it of items) g.setNode(it.id, { width: NODE_W, height: NODE_H });
		for (const e of relEdges) if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
		dagre.layout(g);
		for (const it of items) order.set(it.id, g.node(it.id)?.x ?? 0);
	} catch {
		// dagre failure → fall back to insertion order (still renders).
		items.forEach((it, i) => order.set(it.id, i));
	}

	// 2. group by layer band, sort each band by dagre x, place evenly.
	const byLayer = new Map<string, { id: string; layer: string }[]>();
	for (const it of items) {
		const arr = byLayer.get(it.layer) ?? [];
		arr.push(it);
		byLayer.set(it.layer, arr);
	}
	const usedLayers = [...byLayer.keys()].sort((a, b) => layerIndex(a) - layerIndex(b));
	// Lanes to render: all 6 canonical (overview) or just the used ones (drill-down).
	const laneLayers = fullBands ? [...LAYER_ORDER] : usedLayers;
	const rowOf = new Map(laneLayers.map((l, i) => [l, i] as const));
	const maxRow = Math.max(1, ...[...byLayer.values()].map((a) => a.length));
	const width = SIDE_PAD * 2 + maxRow * NODE_W + (maxRow - 1) * COL_GAP;

	const positions = new Map<string, Positioned>();
	const bands: { layer: string; y: number }[] = laneLayers.map((layer) => ({
		layer,
		y: BAND_TOP + (rowOf.get(layer) ?? 0) * BAND_H,
	}));
	for (const layer of usedLayers) {
		const y = BAND_TOP + (rowOf.get(layer) ?? 0) * BAND_H;
		const row = (byLayer.get(layer) ?? [])
			.slice()
			.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
		const rowWidth = row.length * NODE_W + (row.length - 1) * COL_GAP;
		const startX = (width - rowWidth) / 2;
		row.forEach((it, i) => {
			positions.set(it.id, { id: it.id, x: startX + i * (NODE_W + COL_GAP), y, layer: it.layer });
		});
	}

	return { positions, width, bands };
}

// ---- SvelteFlow-shaped builders (structural only — no @xyflow import) ----
export interface FlowNode {
	id: string;
	type: string;
	position: { x: number; y: number };
	data: Record<string, unknown>;
	draggable?: boolean;
}
export interface FlowEdge {
	id: string;
	source: string;
	target: string;
	animated?: boolean;
	style?: string;
	markerEnd?: { type: string; color: string; width?: number; height?: number };
	data?: Record<string, unknown>;
}
export interface FlowModel {
	nodes: FlowNode[];
	edges: FlowEdge[];
	width: number;
	height: number;
	bands: { layer: string; y: number; name: string }[];
}

function edgeStyleString(kind: string, weight = 1): string {
	const s = edgeStyle(kind);
	const w = Math.min(1 + weight * 0.4, 4);
	const dash = s.dash ? `;stroke-dasharray:${s.dash}` : '';
	return `stroke:${s.color};stroke-width:${w}${dash}`;
}

function bandsWithNames(
	bands: { layer: string; y: number }[],
	layers: SnapLayer[],
): { layer: string; y: number; name: string }[] {
	const nameOf = new Map(layers.map((l) => [l.id, l.name]));
	return bands.map((b) => ({ ...b, name: nameOf.get(b.layer) ?? b.layer }));
}

function heightFor(bands: { y: number }[]): number {
	const last = bands.reduce((m, b) => Math.max(m, b.y), 0);
	return last + NODE_H + 40;
}

/** Overview altitude: 11 subsystem chips across all 6 lanes + 21 aggregated edges. */
export function buildOverview(
	nodes: SnapNode[],
	edges: SnapEdge[],
	layers: SnapLayer[],
): FlowModel {
	const subs = subsystemNodes(nodes);
	const supers = aggregateSubsystemEdges(nodes, edges);
	const layout = layoutByBands(
		subs.map((n) => ({ id: n.id, layer: n.layer })),
		supers.map((s) => ({ from: `sub-${s.from}`, to: `sub-${s.to}` })),
		true,
	);
	const flowNodes: FlowNode[] = subs.map((n) => {
		// Safe: layout positions every id from this same `subs` list.
		const p = layout.positions.get(n.id)!;
		return {
			id: n.id,
			type: 'subsystem',
			position: { x: p.x, y: p.y },
			draggable: false,
			data: { name: n.name, kind: n.kind, subKey: n.subsystem, expandable: true },
		};
	});
	const flowEdges: FlowEdge[] = supers.map((s) => ({
		id: `${s.from}__${s.to}`,
		source: `sub-${s.from}`,
		target: `sub-${s.to}`,
		animated: edgeStyle(s.dominantKind).animated,
		style: edgeStyleString(s.dominantKind, s.weight),
		markerEnd: { type: 'arrowclosed', color: edgeStyle(s.dominantKind).color },
		data: { kind: s.dominantKind, weight: s.weight },
	}));
	return {
		nodes: flowNodes,
		edges: flowEdges,
		width: layout.width,
		height: heightFor(layout.bands),
		bands: bandsWithNames(layout.bands, layers),
	};
}

/** Drill-down altitude: one subsystem's member leaf nodes + their real edges. */
export function buildDrilldown(
	nodes: SnapNode[],
	edges: SnapEdge[],
	layers: SnapLayer[],
	subKey: string,
): FlowModel {
	const members = memberNodesOf(subKey, nodes);
	const ids = new Set(members.map((n) => n.id));
	const inner = edgesWithin(ids, edges);
	const layout = layoutByBands(
		members.map((n) => ({ id: n.id, layer: n.layer })),
		inner.map((e) => ({ from: e.from, to: e.to })),
		false,
	);
	const flowNodes: FlowNode[] = members.map((n) => {
		// Safe: layout positions every id from this same `members` list.
		const p = layout.positions.get(n.id)!;
		return {
			id: n.id,
			type: n.kind === 'subsystem' ? 'subsystem' : 'leaf',
			position: { x: p.x, y: p.y },
			draggable: false,
			data: { name: n.name, kind: n.kind, subKey: n.subsystem, expandable: false },
		};
	});
	const flowEdges: FlowEdge[] = inner.map((e, i) => ({
		id: `${e.from}__${e.to}__${i}`,
		source: e.from,
		target: e.to,
		animated: edgeStyle(e.kind).animated,
		style: edgeStyleString(e.kind),
		markerEnd: { type: 'arrowclosed', color: edgeStyle(e.kind).color },
		data: { kind: e.kind, label: e.label },
	}));
	return {
		nodes: flowNodes,
		edges: flowEdges,
		width: layout.width,
		height: heightFor(layout.bands),
		bands: bandsWithNames(layout.bands, layers),
	};
}
