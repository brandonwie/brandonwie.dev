'use client';

import dynamic from 'next/dynamic';

import type { SnapEdge, SnapLayer, SnapNode } from '../graph/system3b-graph';
import type { Locale } from '../i18n/locale';
import { System3bFallback, System3bFallbackProvider } from './System3bFallback';
import { System3bGraphBoundary } from './System3bGraphBoundary';
import { GraphLocaleProvider } from './System3bLocale';

/**
 * Prerender-safe wrapper around the interactive graph.
 *
 * @xyflow and dagre touch the DOM and are heavy, and /system/3b is exported
 * statically. So this wrapper imports the helper TYPE-ONLY (erased at build, so
 * dagre never enters this chunk) and reaches the flow component only through
 * next/dynamic with ssr disabled.
 *
 * HOW THE HYDRATION CONTRACT IS PRODUCED. Under `output: 'export'`, ssr:false
 * routes the render through BailoutToCSR, which throws during prerender; React
 * then renders the Suspense fallback into the exported HTML. So the built
 * /system/3b contains exactly the `loading` component and zero flow elements,
 * and the client swaps in the real graph once the chunk resolves.
 *
 * THE ONE-WORD REGRESSION. With ssr:false and NO `loading`, next/dynamic wraps
 * the subtree in its OWN <Suspense fallback={null}> — and an outer Suspense at
 * the call site cannot win, because the inner boundary is nearer. Dropping
 * `loading` therefore deletes the static no-JS fallback from the export with no
 * type error and no runtime error. It is asserted by the harness for that
 * reason.
 *
 * The `loading` component receives no props, so the fallback's data arrives by
 * context from the provider above it — contexts are visible to Suspense
 * fallbacks, and the provider sits above the boundary so both the loading and
 * failed renders see the same values.
 */
export interface System3bGraphProps {
	nodes: SnapNode[];
	edges: SnapEdge[];
	layers: SnapLayer[];
	locale: Locale;
}

/**
 * MODULE SCOPE. Creating this inside the component would produce a new lazy
 * component identity on every render and remount the graph each time.
 */
const Flow = dynamic(() => import('./System3bFlow'), {
	ssr: false,
	loading: () => <System3bFallback state="loading" />,
});

export default function System3bGraph({ nodes, edges, layers, locale }: System3bGraphProps) {
	return (
		<GraphLocaleProvider locale={locale}>
			<System3bFallbackProvider value={{ nodes, layers }}>
				<System3bGraphBoundary fallback={<System3bFallback state="failed" />}>
					<Flow nodes={nodes} edges={edges} layers={layers} />
				</System3bGraphBoundary>
			</System3bFallbackProvider>
		</GraphLocaleProvider>
	);
}
