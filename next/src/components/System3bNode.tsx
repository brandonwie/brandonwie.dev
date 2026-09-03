'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { kindStyle } from '../graph/system3b-graph';
import { useGraphCopy } from './System3bLocale';

/**
 * Custom @xyflow/react node for the /system/3b graph.
 *
 * Renders a subsystem chip (expandable) or a leaf node, colored by kind.
 * Click (expandable only) -> data.onExpand(subKey); hover -> data.onHover(id).
 * Handles are present but visually hidden so edges can attach.
 *
 * Ported from System3bNode.svelte. The copy arrives by context rather than by
 * prop because React Flow hands custom nodes only NodeProps.
 */
const HANDLE_STYLE = { opacity: 0, width: 6, height: 6, border: 0 } as const;

export default function System3bNode({ id, data }: NodeProps) {
	const copy = useGraphCopy();
	const style = kindStyle(String(data.kind));
	const expandable = Boolean(data.expandable);

	const click = () => {
		if (expandable && typeof data.onExpand === 'function') {
			(data.onExpand as (k: string) => void)(String(data.subKey));
		}
	};
	const hover = (v: string | null) => {
		if (typeof data.onHover === 'function') (data.onHover as (v: string | null) => void)(v);
	};

	return (
		<>
			<Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
			<button
				type="button"
				className={expandable ? 's3b-node expandable' : 's3b-node'}
				style={{ ['--c' as string]: style.color }}
				onClick={click}
				onMouseEnter={() => hover(id)}
				onMouseLeave={() => hover(null)}
				tabIndex={expandable ? 0 : -1}
				aria-disabled={!expandable}
				title={expandable ? `${copy.expand} ${String(data.name)}` : String(data.name)}
			>
				<span className="dot" />
				<span className="label">{String(data.name)}</span>
				{expandable ? (
					<span className="chev" aria-hidden="true">
						+
					</span>
				) : null}
			</button>
			<Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
		</>
	);
}
