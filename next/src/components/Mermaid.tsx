'use client';

import type { MermaidConfig } from 'mermaid';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';

type MermaidApi = (typeof import('mermaid'))['default'];

/**
 * Carried over from Mermaid.svelte:14-54 with ONE deliberate divergence.
 *
 * securityLevel: the Svelte config uses 'loose'; this uses 'strict'. Measured
 * across all 68 fences in 28 posts, the two produce identical output: the
 * corpus contains zero click directives, zero anchors, zero inline <b>/<i>/
 * <strong>/<em>, zero fa: icons, zero style/classDef/linkStyle and zero
 * entities. Its only HTML is <br>, in 15 fences, and mermaid's sanitizeMore
 * runs DOMPurify under strict, whose default allowlist permits br. So the
 * hardening is free here, and compile-corpus.ts:165 already asserts 'strict' —
 * reverting to 'loose' would turn a currently-green assertion red. Recorded as
 * a named divergence in the C11 M-group allowlist, NOT in the exception ledger:
 * it produces no comparator difference at all, so a ledger entry would match
 * nothing and be stale on arrival.
 *
 * flowchart is restored verbatim. It is invisible to the comparator — the SVG
 * is client-rendered and the export holds only the fence source — which makes
 * it exactly the class of drift the parity harness cannot see.
 * flowchart.curve: 'basis' is the one that would have been most visible: it
 * changes edge GEOMETRY, not colour, on 55 of 68 fences across 25 of 28 files.
 *
 * REDESIGN: themeVariables are NO LONGER verbatim. Their colours are remapped
 * onto the Phosphor Fade shell inks (colour only; fontFamily and fontSize are
 * unchanged, because a font change re-measures labels and clipped Korean text
 * before). Each changed or added key is declared in C11's MERMAID_DIVERGENCES,
 * and migration:browser:mermaid checks the rendered SVG against the inks.
 */
const MERMAID_CONFIG = {
	startOnLoad: false,
	theme: 'dark',
	themeVariables: {
		// REDESIGN: every colour below moved from the pre-redesign greys and
		// violet onto the Phosphor Fade inks (src/app.css --crt-*), per the
		// PostDetailPage spec: surfaces glass, text worn, strokes line, accents
		// amber. Hex literals, not var(--crt-*): mermaid runs colour maths on
		// these values. Declared per key in MERMAID_DIVERGENCES (C11 M1).
		// Background
		background: '#0d0b13', // glass
		mainBkg: '#0d0b13', // glass
		secondaryBkg: '#0d0b13', // glass

		// Text
		primaryTextColor: '#d6cfbf', // worn
		secondaryTextColor: '#857f72', // faint
		tertiaryTextColor: '#857f72', // faint

		// Borders & lines
		primaryBorderColor: '#e0a35c', // amber
		lineColor: '#4a4437', // line

		// Accent colors
		primaryColor: '#0d0b13', // glass (node fill)
		secondaryColor: '#0d0b13', // glass
		tertiaryColor: '#0d0b13', // glass

		// Node colors
		nodeBorder: '#e0a35c', // amber
		clusterBkg: '#0d0b13', // glass
		clusterBorder: '#4a4437', // line

		// Flowchart specific
		edgeLabelBackground: '#0d0b13', // glass

		// REDESIGN: the keys below are NEW (the Svelte config never set them).
		// Left unset, the dark theme derives them by colour maths into greys,
		// blues and reds (#cccccc text, #e83737 crit bars, #81b1db active bars),
		// none of which is an ink. Pinned so sequence and gantt diagrams draw in
		// the same six inks as flowcharts; migration:browser:mermaid proves it.
		textColor: '#d6cfbf', // worn
		titleColor: '#ece6d6', // hi
		arrowheadColor: '#857f72', // faint

		// Sequence diagrams
		actorBkg: '#0d0b13', // glass
		actorBorder: '#e0a35c', // amber
		actorTextColor: '#d6cfbf', // worn
		actorLineColor: '#4a4437', // line
		signalColor: '#857f72', // faint, as flowchart edges
		signalTextColor: '#d6cfbf', // worn
		labelBoxBkgColor: '#0d0b13', // glass
		labelBoxBorderColor: '#4a4437', // line
		labelTextColor: '#d6cfbf', // worn
		loopTextColor: '#d6cfbf', // worn
		noteBkgColor: '#3d372c', // off
		noteBorderColor: '#4a4437', // line
		noteTextColor: '#d6cfbf', // worn (7.60:1 on off)
		activationBkgColor: '#3d372c', // off
		activationBorderColor: '#4a4437', // line
		sequenceNumberColor: '#0d0b13', // glass

		// Gantt: bars on dark surfaces so one text ink (hi) reads on all of them
		sectionBkgColor: '#0d0b13', // glass
		altSectionBkgColor: '#0d0b13', // glass
		sectionBkgColor2: '#0d0b13', // glass
		gridColor: '#4a4437', // line
		taskBkgColor: '#3d372c', // off
		taskBorderColor: '#4a4437', // line
		taskTextColor: '#ece6d6', // hi (9.46:1 on off)
		taskTextLightColor: '#ece6d6', // hi
		taskTextDarkColor: '#ece6d6', // hi, used on done/active/crit bars
		taskTextOutsideColor: '#d6cfbf', // worn
		taskTextClickableColor: '#9fd6a7', // green
		activeTaskBkgColor: '#0d0b13', // glass
		activeTaskBorderColor: '#e0a35c', // amber
		doneTaskBkgColor: '#0d0b13', // glass
		doneTaskBorderColor: '#4a4437', // line
		critBkgColor: '#4a4437', // line (7.76:1 under hi)
		critBorderColor: '#e0a35c', // amber
		todayLineColor: '#e0a35c', // amber
		excludeBkgColor: '#0d0b13', // glass

		// Fonts
		fontFamily: 'JetBrains Mono, monospace',
		fontSize: '14px',
	},
	flowchart: {
		htmlLabels: true,
		curve: 'basis',
	},
	securityLevel: 'strict',
} satisfies MermaidConfig;

let mermaidInitialized = false;

export function initializeMermaidOnce(mermaid: Pick<MermaidApi, 'initialize'>): void {
	if (mermaidInitialized) return;
	mermaid.initialize(MERMAID_CONFIG);
	mermaidInitialized = true;
}

/**
 * Client boundary for a mermaid diagram.
 *
 * The pipeline emits `<mermaid-diagram code="...">` at the remark stage and the
 * renderer maps that element here. Mermaid renders in the browser, so this is
 * the one place in the content path that must hydrate -- and the reason the
 * pipeline produces React elements rather than an HTML string.
 *
 * The `code` prop arrives verbatim from the fence; nothing escapes or re-parses
 * it, which is what the Svelte version had to do with template literals.
 */
export default function Mermaid({ code }: { code: string }) {
	const id = useId().replace(/[^a-zA-Z0-9]/g, '');
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void renderMermaid({
			code,
			id,
			loadMermaid: async () => (await import('mermaid')).default,
			setSvg: (svg) => {
				if (!cancelled && ref.current) ref.current.innerHTML = svg;
			},
			setError: (message) => {
				if (!cancelled) setError(message);
			},
		});
		return () => {
			cancelled = true;
		};
	}, [code, id]);

	return mermaidView({ code, error, ref });
}

/** The browser half of a mermaid diagram, as a seam.
 *
 * Lifted out of the effect so the C11 harness can drive the FAILING path
 * without a browser: substitute a `loadMermaid` whose `render` throws and
 * assert `setError` receives the message. Same seam-substitution shape as
 * `compile-corpus.ts`'s `fakeMermaid`, and the reason S9's error state is
 * provable at all -- a `catch` that nothing can reach is a claim, not a proof.
 *
 * `setSvg` and `setError` carry the component's cancellation check, so this
 * function stays free of React entirely. */
export interface MermaidRenderDeps {
	code: string;
	id: string;
	loadMermaid: () => Promise<Pick<MermaidApi, 'initialize' | 'render'>>;
	setSvg: (svg: string) => void;
	setError: (message: string | null) => void;
}

export async function renderMermaid(deps: MermaidRenderDeps): Promise<void> {
	// Clear first, and clear HERE rather than in the effect, so the row that
	// proves it can drive this function directly.
	//
	// Without the reset a component that renders a second fence stays broken
	// forever: `error` survives from the first attempt, `mermaidView` keeps the
	// error branch, and that branch attaches no `ref` -- so the successful
	// setSvg for the new code writes into nothing and the diagram stays marked
	// data-mermaid-error even though it now renders.
	deps.setError(null);
	try {
		const mermaid = await deps.loadMermaid();
		initializeMermaidOnce(mermaid);
		const { svg } = await mermaid.render(`mermaid-${deps.id}`, deps.code);
		deps.setSvg(svg);
	} catch (cause) {
		deps.setError(cause instanceof Error ? cause.message : String(cause));
	}
}

/** The two rendered states, as a pure function of `error`.
 *
 * The attribute markers are the contract S9 asserts, and they must stay
 * DISJOINT: `data-mermaid-error` marks a diagram the browser could not draw,
 * `data-mermaid` one it could (or has not tried yet). Collapsing them to one
 * name would leave a failed diagram indistinguishable from a pending one, which
 * is precisely the state the fixture route exists to catch. */
export function mermaidView({
	code,
	error,
	ref,
}: {
	code: string;
	error: string | null;
	ref?: RefObject<HTMLDivElement | null>;
}) {
	if (error !== null) {
		return (
			<pre data-mermaid-error="" role="img" aria-label="Diagram failed to render">
				{code}
			</pre>
		);
	}

	// The server render emits the diagram source, so the content is present and
	// readable before hydration and if JavaScript never arrives. On a successful
	// client render the SVG replaces it.
	return (
		<div ref={ref} data-mermaid="" suppressHydrationWarning>
			<pre>{code}</pre>
		</div>
	);
}
