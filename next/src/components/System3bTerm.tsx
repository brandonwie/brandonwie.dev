/**
 * Presentation for the /system/b3 graph: kind glyphs and edge inks. Pure look:
 * the graph model (`system3b-graph.ts`) keeps its kinds, layout and style map
 * untouched; the flow re-inks edges from `data.kind` on the way into React Flow.
 *
 * Inks are colour token names from src/app.css, so the graph follows the site
 * theme. Imports nothing from @xyflow or dagre, so both the lazy flow chunk and
 * the eager wrapper chunk can use it.
 */

/** Type glyph per node kind. */
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

export interface EdgeInk {
	/** Colour token name, without the leading `--`. */
	token: string;
	dash?: string;
	/** `round` caps turn a 1-unit dash into dots (symlink). */
	round?: boolean;
}

/** Relation kind -> ink + dash. Dash is the second channel beside the ink. */
const EDGE_INK: Record<string, EdgeInk> = {
	dependency: { token: 'faint' },
	reads: { token: 'ok', dash: '6 4' },
	writes: { token: 'ok' },
	generates: { token: 'accent' },
	triggers: { token: 'accent', dash: '2 4' },
	dataflow: { token: 'ink' },
	symlink: { token: 'ok', dash: '1 4', round: true },
};

/** Every token an edge can be drawn in, for resolving them to literals at once. */
export const EDGE_TOKENS = ['faint', 'ok', 'accent', 'ink'] as const;

export function edgeInk(kind: string): EdgeInk {
	return EDGE_INK[kind] ?? { token: 'faint' };
}

/** 30px line sample for the relations legend. Inline SVG resolves `var()` itself. */
export function EdgeSample({ kind }: { kind: string }) {
	const ink = edgeInk(kind);
	return (
		<svg className="s3b-legend__line" width="30" height="6" viewBox="0 0 30 6" aria-hidden="true">
			<line
				x1="1"
				y1="3"
				x2="29"
				y2="3"
				style={{ stroke: `var(--${ink.token})` }}
				strokeWidth="1.6"
				strokeDasharray={ink.dash}
				strokeLinecap={ink.round ? 'round' : 'butt'}
			/>
		</svg>
	);
}
