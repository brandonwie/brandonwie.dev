/**
 * Phosphor Fade presentation for the /system/3b graph: kind glyphs and edge
 * inks. Pure look — the graph model (`system3b-graph.ts`) keeps its kinds,
 * layout and Rosé Pine style map untouched; the flow re-inks edges from
 * `data.kind` on the way into React Flow.
 *
 * Imports nothing from @xyflow or dagre, so both the lazy flow chunk and the
 * eager wrapper chunk can use it.
 */

/**
 * Shell inks as literals. SVG marker `fill`/`stroke` attributes and React
 * Flow's `markerEnd.color` do not resolve CSS variables reliably, so the values
 * mirror the `--crt-*` tokens in src/app.css.
 */
const INK = {
	hi: '#ece6d6',
	green: '#9fd6a7',
	amber: '#e0a35c',
	faint: '#857f72',
} as const;

/** `ls -F`-style type glyph per node kind. */
const KIND_GLYPH: Record<string, string> = {
	subsystem: '/',
	generator: '*',
	runtime: '&',
	store: '=',
	doc: '¶',
	gate: '!',
};

export function kindGlyph(kind: string): string {
	return KIND_GLYPH[kind] ?? '-';
}

export interface TermEdgeInk {
	stroke: string;
	dash?: string;
	/** `round` caps turn a 1-unit dash into dots (symlink). */
	round?: boolean;
}

/** Relation kind -> ink + dash. Dash is the second channel beside the ink. */
const EDGE_INK: Record<string, TermEdgeInk> = {
	dependency: { stroke: INK.faint },
	reads: { stroke: INK.green, dash: '6 4' },
	writes: { stroke: INK.green },
	generates: { stroke: INK.amber },
	triggers: { stroke: INK.amber, dash: '2 4' },
	dataflow: { stroke: INK.hi },
	symlink: { stroke: INK.green, dash: '1 4', round: true },
};

export function edgeInk(kind: string): TermEdgeInk {
	return EDGE_INK[kind] ?? { stroke: INK.faint };
}

/** Minimap chip blocks and viewport outline. */
export const MINIMAP_INK = { node: INK.faint, stroke: INK.amber } as const;

/** 30px line sample for the relations legend. */
export function EdgeSample({ kind }: { kind: string }) {
	const ink = edgeInk(kind);
	return (
		<svg className="s3b-legend__line" width="30" height="6" viewBox="0 0 30 6" aria-hidden="true">
			<line
				x1="1"
				y1="3"
				x2="29"
				y2="3"
				stroke={ink.stroke}
				strokeWidth="1.6"
				strokeDasharray={ink.dash}
				strokeLinecap={ink.round ? 'round' : 'butt'}
			/>
		</svg>
	);
}
