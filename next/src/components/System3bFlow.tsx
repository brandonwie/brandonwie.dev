'use client';

import { useCallback, useMemo, useState } from 'react';
import {
	Background,
	Controls,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	type Edge,
	type Node,
	type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
	BAND_H,
	NODE_H,
	NODE_W,
	EDGE_STYLE,
	KIND_STYLE,
	buildDrilldown,
	buildOverview,
	dimEdges,
	type FlowEdge,
	type FlowModel,
	type SnapEdge,
	type SnapLayer,
	type SnapNode,
} from '../graph/system3b-graph';
import System3bBandNode from './System3bBandNode';
import System3bFitView from './System3bFitView';
import System3bNode from './System3bNode';
import { useGraphCopy } from './System3bLocale';
import { EdgeSample, MINIMAP_INK, edgeInk, kindGlyph } from './System3bTerm';

/**
 * The interactive @xyflow/react graph (CLIENT-ONLY).
 *
 * Loaded lazily by System3bGraph so @xyflow never reaches the prerendered
 * shell. Overview = 11 subsystem chips in 6 layer lanes + 21 aggregated edges;
 * click a chip to drill down to its member nodes and real edges.
 *
 * THIS FILE IS THE LAZY CHUNK ROOT. The @xyflow import, its stylesheet, and
 * ReactFlowProvider all live here and nowhere above: importing any of them from
 * the wrapper would make @xyflow a static dependency of the eagerly loaded
 * chunk and silently defeat the whole lazy boundary while every other check
 * still passed.
 */

/**
 * Module scope, not inside the component. React Flow remounts custom nodes when
 * the nodeTypes identity changes, so building this per render would tear down
 * and rebuild every chip on each state change.
 */
const nodeTypes = {
	subsystem: System3bNode,
	leaf: System3bNode,
	band: System3bBandNode,
} satisfies NodeTypes;

const PRO_OPTIONS = { hideAttribution: true } as const;

/**
 * Phosphor Fade canvas. The dot Background stays mounted (the xyflow suite
 * counts `.react-flow__background`) but draws nothing: the glass scanlines
 * already texture the canvas, so both of its colours are transparent.
 */
const FLOW_CLEAR = 'transparent';
const FLOW_GLASS = '#0d0b13'; // --crt-glass
const FLOW_MASK = 'rgba(13, 11, 19, 0.6)'; // --crt-glass @ 0.6 opacity

/**
 * Non-incident edges while a chip is hovered. The model dims to 0.1, which
 * vanishes against --crt-glass with these inks; the design lifts it to 0.2.
 */
const DIM_OPACITY = 0.2;

/** Minimap box from the design (128x72); still pannable and zoomable. */
const MINIMAP_SIZE = { width: 128, height: 72 } as const;

/**
 * Re-ink one model edge in shell inks, keyed by its relation kind. Stroke
 * width (the weight channel) is kept; nothing animates.
 */
function toTerminalEdge(e: FlowEdge): FlowEdge {
	const ink = edgeInk(String(e.data?.kind));
	const { strokeDasharray: _dash, ...rest } = e.style ?? {};
	return {
		...e,
		animated: false,
		style: {
			...rest,
			stroke: ink.stroke,
			...(ink.dash ? { strokeDasharray: ink.dash } : {}),
			...(ink.round ? { strokeLinecap: 'round' as const } : {}),
		},
		markerEnd: e.markerEnd ? { ...e.markerEnd, color: ink.stroke } : e.markerEnd,
	};
}

export interface System3bFlowProps {
	nodes: SnapNode[];
	edges: SnapEdge[];
	layers: SnapLayer[];
}

function mmColor(n: Node): string {
	if (n.type === 'band') return 'transparent';
	return MINIMAP_INK.node;
}

export default function System3bFlow({
	nodes: snapNodes,
	edges: snapEdges,
	layers,
}: System3bFlowProps) {
	const copy = useGraphCopy();
	const [expandedSubKey, setExpandedSubKey] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);

	const model: FlowModel = useMemo(
		() =>
			expandedSubKey
				? buildDrilldown(snapNodes, snapEdges, layers, expandedSubKey)
				: buildOverview(snapNodes, snapEdges, layers),
		[snapNodes, snapEdges, layers, expandedSubKey],
	);

	const expandedName = useMemo(() => {
		if (!expandedSubKey) return null;
		return (
			snapNodes.find((n) => n.subsystem === expandedSubKey && n.kind === 'subsystem')?.name ??
			expandedSubKey
		);
	}, [snapNodes, expandedSubKey]);

	/**
	 * Stable identities. If these were rebuilt each render they would land in
	 * every node's `data`, the nodes array would change on hover, and React Flow
	 * would remount the chips — killing the dimming transition the hover exists
	 * to produce. This is the React-side cost of what Svelte got from an $effect
	 * that deliberately did not read `hovered`.
	 */
	const expand = useCallback((key: string) => {
		setExpandedSubKey(key);
		setHovered(null);
	}, []);
	const reset = useCallback(() => {
		setExpandedSubKey(null);
		setHovered(null);
	}, []);
	const setHover = useCallback((v: string | null) => setHovered(v), []);

	// Lane label data: `L#` from the layer order, and the lane's real node count
	// (every snapshot node, not just the chips drawn at this altitude).
	const laneMeta = useMemo(() => {
		const count: Record<string, number> = {};
		for (const n of snapNodes) count[n.layer] = (count[n.layer] ?? 0) + 1;
		const index: Record<string, number> = {};
		layers.forEach((l, i) => (index[l.id] = i + 1));
		return { count, index };
	}, [snapNodes, layers]);

	// Rebuilds only when the model (altitude) changes — NOT on hover.
	const flowNodes = useMemo<Node[]>(() => {
		const bands = model.bands.map((b) => ({
			id: `band-${b.layer}`,
			type: 'band',
			position: { x: -24, y: b.y - 26 },
			data: {
				name: b.name,
				index: laneMeta.index[b.layer] ?? 0,
				count: laneMeta.count[b.layer] ?? 0,
				width: model.width + 48,
				height: BAND_H - 14,
			},
			draggable: false,
			selectable: false,
			zIndex: -1,
			initialWidth: model.width + 48,
			initialHeight: BAND_H - 14,
		}));
		// `initialWidth/Height` only seed the size: React Flow still measures the
		// DOM for layout and edges, but the MiniMap draws a node only when the
		// USER node object has dimensions, and a controlled graph without
		// onNodesChange never receives `measured` back, so without these the
		// minimap renders empty.
		const chips = model.nodes.map((n) => ({
			...n,
			initialWidth: NODE_W,
			initialHeight: NODE_H,
			data: { ...n.data, onExpand: expand, onHover: setHover },
		}));
		return [...bands, ...chips] as unknown as Node[];
	}, [model, laneMeta, expand, setHover]);

	// Shell inks per relation kind; rebuilt with the model, not on hover.
	const inkedEdges = useMemo(() => model.edges.map(toTerminalEdge), [model]);

	// Re-styles edges on hover (dims non-incident) without rebuilding nodes.
	const flowEdges = useMemo<Edge[]>(
		() =>
			dimEdges(inkedEdges, hovered).map((e) =>
				e.style?.opacity === undefined ? e : { ...e, style: { ...e.style, opacity: DIM_OPACITY } },
			) as unknown as Edge[],
		[inkedEdges, hovered],
	);

	return (
		<div className="s3b-flow">
			<div className="toolbar">
				<span className="title">
					{expandedSubKey ? (
						<>
							<span className="crumb" aria-hidden="true">
								&#9656;
							</span>{' '}
							{expandedName}
						</>
					) : (
						copy.overview
					)}
				</span>
				<div className="s3b-flow__spacer" />
				{expandedSubKey ? (
					<button type="button" className="btn" onClick={reset}>
						<span aria-hidden="true">&#8592;</span> {copy.back}
					</button>
				) : (
					<span className="hint">{copy.expandHint}</span>
				)}
			</div>

			<div className="s3b-flow__canvas">
				<ReactFlowProvider>
					<ReactFlow
						nodes={flowNodes}
						edges={flowEdges}
						nodeTypes={nodeTypes}
						colorMode="dark"
						fitView
						nodesDraggable={false}
						nodesConnectable={false}
						elementsSelectable={false}
						minZoom={0.3}
						maxZoom={1.6}
						proOptions={PRO_OPTIONS}
					>
						<Background bgColor={FLOW_CLEAR} color={FLOW_CLEAR} gap={22} />
						<Controls showInteractive={false} orientation="horizontal" />
						<MiniMap
							pannable
							zoomable
							nodeColor={mmColor}
							nodeBorderRadius={0}
							maskColor={FLOW_MASK}
							maskStrokeColor={MINIMAP_INK.stroke}
							maskStrokeWidth={2}
							bgColor={FLOW_GLASS}
							style={MINIMAP_SIZE}
						/>
						<System3bFitView trigger={expandedSubKey} />
					</ReactFlow>
				</ReactFlowProvider>
			</div>

			<div className="s3b-legend">
				<div className="s3b-legend__row">
					<span className="s3b-legend__head">{copy.nodesLabel}</span>
					{Object.entries(KIND_STYLE).map(([kind, s]) => (
						<span className="s3b-legend__item" key={kind}>
							<span className="s3b-legend__glyph" aria-hidden="true">
								{kindGlyph(kind)}
							</span>
							{copy.kindLabel[kind] ?? s.label}
						</span>
					))}
				</div>
				<div className="s3b-legend__row">
					<span className="s3b-legend__head">{copy.relationsLegend}</span>
					{Object.entries(EDGE_STYLE).map(([kind, s]) => (
						<span className="s3b-legend__item" key={kind}>
							<EdgeSample kind={kind} />
							{copy.edgeLabel[kind] ?? s.label}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
