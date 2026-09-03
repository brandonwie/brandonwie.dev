/**
 * system3b-graph.ts — pure, DOM-free model + layout helpers for the /system/3b
 * architecture graph. No React, no browser APIs: importable from a plain Node
 * script for unit checks, and tree-shake-friendly. dagre is the only heavy
 * import here, and only the lazy-loaded System3bFlow component pulls this file,
 * so dagre never reaches the prerendered shell.
 *
 * Data source = the already-sanitized system-snapshot.json (nodes/edges/layers/
 * subsystems). Rendering it adds no new privacy surface.
 *
 * PORTED FROM src/lib/utils/system3b-graph.ts (C11). The layout maths is
 * framework-neutral and moves unchanged; three things do not.
 *
 * 1. edgeStyleString became edgeStyleObject. React Flow types Edge.style as a
 *    CSSProperties OBJECT, not a CSS declaration string. Its second consumer
 *    moved with it — see dimEdges, which merges instead of concatenating.
 *    Porting only the producer would leave a consumer appending onto an object
 *    and silently producing no dimming.
 * 2. FlowEdge.markerEnd.type narrowed from string to the literal 'arrowclosed'.
 *    The runtime VALUE is unchanged. A bare string IS assignable to
 *    EdgeMarkerType; what fails is the object, because { type: string } matches
 *    neither that union's string arm nor EdgeMarker, whose type is a literal
 *    union. So the narrowing belongs on the field, not on markerEnd.
 * 3. Fallbacks became OBSERVABLE. kindStyle/edgeStyle fell back silently and
 *    the dagre catch was commented "still renders", which is exactly why
 *    nothing ever caught either. S6 and S7 cannot be asserted against a channel
 *    that does not exist, so the builders now report what they fell back to.
 */
import dagre from '@dagrejs/dagre';
import type { CSSProperties } from 'react';

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

// ---- diagnostics (C11 S6/S7) ----

/**
 * Which kinds a build fell back on. Empty arrays mean every kind the snapshot
 * uses maps to a real style — the state the real data is in today, and what
 * S6's positive half asserts. A non-empty array is what S6's forced failure
 * demands: the node still renders, but it renders as a fallback and SAYS so,
 * instead of being indistinguishable from a mapped kind.
 */
export interface FallbackReport {
	/** Node kinds with no KIND_STYLE entry, in first-seen order. */
	kinds: string[];
	/** Edge kinds with no EDGE_STYLE entry, in first-seen order. */
	edgeKinds: string[];
}

export function emptyFallbackReport(): FallbackReport {
	return { kinds: [], edgeKinds: [] };
}

export function hasFallback(r: FallbackReport): boolean {
	return r.kinds.length > 0 || r.edgeKinds.length > 0;
}

function kindStyleTracked(kind: string, report: FallbackReport): KindStyle {
	const hit = KIND_STYLE[kind];
	if (hit) return hit;
	if (!report.kinds.includes(kind)) report.kinds.push(kind);
	return KIND_FALLBACK;
}

function edgeStyleTracked(kind: string, report: FallbackReport): EdgeStyle {
	const hit = EDGE_STYLE[kind];
	if (hit) return hit;
	if (!report.edgeKinds.includes(kind)) report.edgeKinds.push(kind);
	return EDGE_FALLBACK;
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
	/** true when dagre threw and the insertion-order fallback was used (S7). */
	degraded: boolean;
	/** The thrown message, or null when dagre laid the graph out. */
	degradedReason: string | null;
}

/**
 * The graph type dagre.layout itself accepts. Derived from the function rather
 * than from the constructor: graphlib.Graph is generic, so InstanceType gives
 * Graph<unknown, unknown, unknown> and will not assign to layout's parameter.
 */
export type DagreGraph = Parameters<typeof dagre.layout>[0];

/**
 * Seam for S7. The control substitutes a throwing layout to prove the
 * insertion-order fallback is REPORTED rather than silently absorbed. Nothing
 * ships with this overridden.
 */
export interface LayoutDeps {
	layout?: (g: DagreGraph) => void;
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
	deps: LayoutDeps = {},
): LayoutResult {
	const runLayout = deps.layout ?? ((g: DagreGraph) => dagre.layout(g));

	// 1. dagre pass for x-ordering (we keep its relative order, not raw coords).
	const order = new Map<string, number>();
	let degraded = false;
	let degradedReason: string | null = null;
	try {
		const g = new dagre.graphlib.Graph();
		g.setGraph({ rankdir: 'TB', nodesep: COL_GAP, ranksep: BAND_H });
		g.setDefaultEdgeLabel(() => ({}));
		for (const it of items) g.setNode(it.id, { width: NODE_W, height: NODE_H });
		for (const e of relEdges) if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
		runLayout(g);
		for (const it of items) order.set(it.id, g.node(it.id)?.x ?? 0);
	} catch (cause) {
		// dagre failure -> fall back to insertion order. It still renders, which is
		// precisely how this went unnoticed; the result now says so.
		degraded = true;
		degradedReason = cause instanceof Error ? cause.message : String(cause);
		order.clear();
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

	return { positions, width, bands, degraded, degradedReason };
}

// ---- React-Flow-shaped builders (structural only — no @xyflow import) ----
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
	/**
	 * A CSSProperties OBJECT, not a declaration string — React Flow types
	 * Edge.style this way, and dimEdges merges into it.
	 */
	style?: CSSProperties;
	/**
	 * type is the literal, not string. The VALUE is unchanged; the narrowing is
	 * what makes the object assignable to React Flow's EdgeMarkerType.
	 */
	markerEnd?: { type: 'arrowclosed'; color: string; width?: number; height?: number };
	data?: Record<string, unknown>;
}
export interface FlowModel {
	nodes: FlowNode[];
	edges: FlowEdge[];
	width: number;
	height: number;
	bands: { layer: string; y: number; name: string }[];
	/** Kinds this build fell back on. Empty on the real snapshot. */
	fallbacks: FallbackReport;
	/** true when dagre threw during layout and insertion order was used. */
	degraded: boolean;
	degradedReason: string | null;
}

/**
 * The style an edge of this kind carries, as an object.
 *
 * Replaces edgeStyleString, which produced a stroke/stroke-width declaration
 * for SvelteFlow. Both of its consumers move together on purpose.
 */
export function edgeStyleObject(
	kind: string,
	weight = 1,
	report: FallbackReport = emptyFallbackReport(),
): CSSProperties {
	const s = edgeStyleTracked(kind, report);
	const strokeWidth = Math.min(1 + weight * 0.4, 4);
	return {
		stroke: s.color,
		strokeWidth,
		...(s.dash ? { strokeDasharray: s.dash } : {}),
	};
}

/**
 * Hover dimming, pure so the harness can drive it without a browser.
 *
 * The Svelte original appended ';opacity:0.1' to a style STRING
 * (System3bFlow.svelte:117-127). Here it is an object MERGE, and the merge must
 * preserve stroke and strokeWidth: returning { opacity: 0.1 } alone is also an
 * object, also type-correct, and also wrong.
 */
export function dimEdges(edges: FlowEdge[], hovered: string | null): FlowEdge[] {
	return edges.map((e) => {
		const incident = !hovered || e.source === hovered || e.target === hovered;
		if (incident) return e;
		return { ...e, style: { ...e.style, opacity: 0.1 }, animated: false };
	});
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
	deps: LayoutDeps = {},
): FlowModel {
	const report = emptyFallbackReport();
	const subs = subsystemNodes(nodes);
	const supers = aggregateSubsystemEdges(nodes, edges);
	const layout = layoutByBands(
		subs.map((n) => ({ id: n.id, layer: n.layer })),
		supers.map((s) => ({ from: `sub-${s.from}`, to: `sub-${s.to}` })),
		true,
		deps,
	);
	const flowNodes: FlowNode[] = subs.map((n) => {
		// Safe: layout positions every id from this same `subs` list.
		const p = layout.positions.get(n.id)!;
		kindStyleTracked(n.kind, report);
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
		animated: edgeStyleTracked(s.dominantKind, report).animated,
		style: edgeStyleObject(s.dominantKind, s.weight, report),
		markerEnd: { type: 'arrowclosed', color: edgeStyleTracked(s.dominantKind, report).color },
		data: { kind: s.dominantKind, weight: s.weight },
	}));
	return {
		nodes: flowNodes,
		edges: flowEdges,
		width: layout.width,
		height: heightFor(layout.bands),
		bands: bandsWithNames(layout.bands, layers),
		fallbacks: report,
		degraded: layout.degraded,
		degradedReason: layout.degradedReason,
	};
}

/** Drill-down altitude: one subsystem's member leaf nodes + their real edges. */
export function buildDrilldown(
	nodes: SnapNode[],
	edges: SnapEdge[],
	layers: SnapLayer[],
	subKey: string,
	deps: LayoutDeps = {},
): FlowModel {
	const report = emptyFallbackReport();
	const members = memberNodesOf(subKey, nodes);
	const ids = new Set(members.map((n) => n.id));
	const inner = edgesWithin(ids, edges);
	const layout = layoutByBands(
		members.map((n) => ({ id: n.id, layer: n.layer })),
		inner.map((e) => ({ from: e.from, to: e.to })),
		false,
		deps,
	);
	const flowNodes: FlowNode[] = members.map((n) => {
		// Safe: layout positions every id from this same `members` list.
		const p = layout.positions.get(n.id)!;
		kindStyleTracked(n.kind, report);
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
		animated: edgeStyleTracked(e.kind, report).animated,
		style: edgeStyleObject(e.kind, 1, report),
		markerEnd: { type: 'arrowclosed', color: edgeStyleTracked(e.kind, report).color },
		data: { kind: e.kind, label: e.label },
	}));
	return {
		nodes: flowNodes,
		edges: flowEdges,
		width: layout.width,
		height: heightFor(layout.bands),
		bands: bandsWithNames(layout.bands, layers),
		fallbacks: report,
		degraded: layout.degraded,
		degradedReason: layout.degradedReason,
	};
}
