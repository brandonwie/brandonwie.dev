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
	EDGE_STYLE,
	KIND_STYLE,
	buildDrilldown,
	buildOverview,
	dimEdges,
	kindStyle,
	type FlowModel,
	type SnapEdge,
	type SnapLayer,
	type SnapNode,
} from '../graph/system3b-graph';
import System3bBandNode from './System3bBandNode';
import System3bFitView from './System3bFitView';
import System3bNode from './System3bNode';
import { useGraphCopy } from './System3bLocale';

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

const FLOW_BG = '#13111c'; // --bg
const FLOW_BG2 = '#191724'; // --bg2
const FLOW_OVERLAY = '#26233a'; // --overlay
const FLOW_MASK = 'rgba(19, 17, 28, 0.6)'; // --bg @ 0.6 opacity

export interface System3bFlowProps {
	nodes: SnapNode[];
	edges: SnapEdge[];
	layers: SnapLayer[];
}

function mmColor(n: Node): string {
	if (n.type === 'band') return 'transparent';
	return kindStyle(String((n.data as Record<string, unknown>)?.kind)).color;
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

	// Rebuilds only when the model (altitude) changes — NOT on hover.
	const flowNodes = useMemo<Node[]>(() => {
		const bands = model.bands.map((b) => ({
			id: `band-${b.layer}`,
			type: 'band',
			position: { x: -24, y: b.y - 26 },
			data: { name: b.name, width: model.width + 48, height: BAND_H - 14 },
			draggable: false,
			selectable: false,
			zIndex: -1,
		}));
		const chips = model.nodes.map((n) => ({
			...n,
			data: { ...n.data, onExpand: expand, onHover: setHover },
		}));
		return [...bands, ...chips] as unknown as Node[];
	}, [model, expand, setHover]);

	// Re-styles edges on hover (dims non-incident) without rebuilding nodes.
	const flowEdges = useMemo<Edge[]>(
		() => dimEdges(model.edges, hovered) as unknown as Edge[],
		[model, hovered],
	);

	return (
		<div className="s3b-flow">
			<div className="toolbar">
				<span className="title">
					{expandedSubKey ? (
						<>
							<span className="crumb">&#9656;</span> {expandedName}
						</>
					) : (
						copy.overview
					)}
				</span>
				<div className="spacer" />
				{expandedSubKey ? (
					<button type="button" className="btn" onClick={reset}>
						&#8592; {copy.back}
					</button>
				) : (
					<span className="hint">{copy.expandHint}</span>
				)}
			</div>

			<div className="canvas">
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
						<Background bgColor={FLOW_BG} color={FLOW_OVERLAY} gap={22} />
						<Controls showInteractive={false} />
						<MiniMap
							pannable
							zoomable
							nodeColor={mmColor}
							maskColor={FLOW_MASK}
							bgColor={FLOW_BG2}
						/>
						<System3bFitView trigger={expandedSubKey} />
					</ReactFlow>
				</ReactFlowProvider>
			</div>

			<div className="legend">
				<div className="legend-row">
					<span className="legend-head">{copy.nodesLabel}</span>
					{Object.entries(KIND_STYLE).map(([kind, s]) => (
						<span className="chip" key={kind}>
							<span className="swatch" style={{ background: s.color }} />
							{copy.kindLabel[kind] ?? s.label}
						</span>
					))}
				</div>
				<div className="legend-row">
					<span className="legend-head">{copy.relationsLegend}</span>
					{Object.entries(EDGE_STYLE).map(([kind, s]) => (
						<span className="chip" key={kind}>
							<span
								className="line"
								style={{ borderTop: `2px ${s.dash ? 'dashed' : 'solid'} ${s.color}` }}
							/>
							{copy.edgeLabel[kind] ?? s.label}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
