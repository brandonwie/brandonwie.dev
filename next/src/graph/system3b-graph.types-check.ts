/**
 * C11 proof (b): the edges this module produces are ASSIGNABLE to React Flow's
 * own Edge type, at the pinned version.
 *
 * This file exists to be typechecked, not executed. It is the difference
 * between "we believe markerEnd is fine" and "tsc rejects the build if it is
 * not". plan.md states the claim one level too high: a bare `string` IS
 * assignable to EdgeMarkerType, because that union has a `string` arm. What
 * fails is the OBJECT form — `{ type: string; color: string }` matches neither
 * that arm nor EdgeMarker, whose `type` is `MarkerType | ` + a template
 * literal of it. So the narrowing has to land on FlowEdge['markerEnd']['type'],
 * and this file is what proves it did.
 *
 * The runtime value is unchanged: still the plain string 'arrowclosed', never
 * MarkerType.ArrowClosed. Requiring the enum member would be over-prescription;
 * the contract is assignability.
 */
import type { Edge, Node } from '@xyflow/react';

import snapshot from '../data/system-snapshot';
import {
	buildDrilldown,
	buildOverview,
	subsystemNodes,
	type FlowEdge,
	type FlowNode,
} from './system3b-graph';

const overview = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers);

// Every produced edge assigns to React Flow's Edge.
const edges: Edge[] = overview.edges satisfies FlowEdge[];

// Every produced node assigns to React Flow's Node.
const nodes: Node[] = overview.nodes satisfies FlowNode[];

// The drill-down altitude too, over a real subsystem key.
const firstSubKey = subsystemNodes(snapshot.nodes)[0]?.subsystem ?? '';
const drill = buildDrilldown(snapshot.nodes, snapshot.edges, snapshot.layers, firstSubKey);
const drillEdges: Edge[] = drill.edges satisfies FlowEdge[];
const drillNodes: Node[] = drill.nodes satisfies FlowNode[];

// Referenced so the bindings are not elided before they are checked.
export const ASSIGNABILITY_PROOF = {
	overviewEdges: edges.length,
	overviewNodes: nodes.length,
	drilldownEdges: drillEdges.length,
	drilldownNodes: drillNodes.length,
} as const;
