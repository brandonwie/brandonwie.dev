'use client';

import type { NodeProps } from '@xyflow/react';

import { useGraphCopy } from './System3bLocale';

/**
 * Non-interactive layer lane behind the chips.
 *
 * Spans the full graph width; carries `L# LAYER NAME` top-left and the lane's
 * real node count top-right (the flow passes `index` and `count` in `data`).
 * zIndex -1 so it sits behind subsystem chips and pans/zooms with the graph (a
 * true swimlane).
 *
 * Ported from System3bBandNode.svelte. Its @xyflow dependency is type-only —
 * `NodeProps` is erased at build — but the COMPONENT is a full rewrite like any
 * other; only the package swap is a re-type. The Svelte original carried a note
 * about interpolation inside quoted `style:` directive values; that is a Svelte
 * idiom with no React counterpart and is deliberately not carried over. React
 * appends `px` to numeric style values itself.
 */
export default function System3bBandNode({ data }: NodeProps) {
	const copy = useGraphCopy();
	const index = Number(data.index);
	const count = Number(data.count);
	return (
		<div className="s3b-band" style={{ width: Number(data.width), height: Number(data.height) }}>
			<span className="s3b-band__label">
				{index > 0 ? <span className="s3b-band__idx">L{index} </span> : null}
				{String(data.name)}
			</span>
			{Number.isFinite(count) ? (
				<span className="s3b-band__count">
					{count} {copy.nodesLabel}
				</span>
			) : null}
		</div>
	);
}
