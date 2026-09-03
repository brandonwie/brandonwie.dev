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
 * themeVariables and flowchart are restored verbatim. They are invisible to the
 * comparator — the SVG is client-rendered and the export holds only the fence
 * source — which makes them exactly the class of drift the parity harness
 * cannot see. flowchart.curve: 'basis' is the one that would have been most
 * visible: it changes edge GEOMETRY, not colour, on 55 of 68 fences across 25
 * of 28 files.
 */
const MERMAID_CONFIG = {
	startOnLoad: false,
	theme: 'dark',
	themeVariables: {
		// Background
		background: '#1a1a1a',
		mainBkg: '#2d2d2d',
		secondaryBkg: '#353535',

		// Text
		primaryTextColor: '#e5e5e5',
		secondaryTextColor: '#888888',
		tertiaryTextColor: '#666666',

		// Borders & lines
		primaryBorderColor: '#404040',
		lineColor: '#888888',

		// Accent colors (matching terminal theme)
		primaryColor: '#a855f7', // neon violet (brand)
		secondaryColor: '#6b9eff', // blue
		tertiaryColor: '#2d2d2d',

		// Node colors
		nodeBorder: '#404040',
		clusterBkg: '#2d2d2d',
		clusterBorder: '#404040',

		// Flowchart specific
		edgeLabelBackground: '#2d2d2d',

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
