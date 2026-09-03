'use client';

import type { NodeProps } from '@xyflow/react';

/**
 * Non-interactive layer lane behind the chips.
 *
 * Spans the full graph width; carries the layer name top-left. zIndex -1 so it
 * sits behind subsystem chips and pans/zooms with the graph (a true swimlane).
 *
 * Ported from System3bBandNode.svelte. Its @xyflow dependency is type-only —
 * `NodeProps` is erased at build — but the COMPONENT is a full rewrite like any
 * other; only the package swap is a re-type. The Svelte original carried a note
 * about interpolation inside quoted `style:` directive values; that is a Svelte
 * idiom with no React counterpart and is deliberately not carried over. React
 * appends `px` to numeric style values itself.
 */
export default function System3bBandNode({ data }: NodeProps) {
	return (
		<div className="s3b-band" style={{ width: Number(data.width), height: Number(data.height) }}>
			<span className="lane-label">{String(data.name)}</span>
		</div>
	);
}
