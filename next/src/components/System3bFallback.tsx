'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { SnapLayer, SnapNode } from '../graph/system3b-graph';
import { useGraphCopy } from './System3bLocale';

/**
 * The static, no-JS view of the graph: a layer list with per-layer node counts.
 *
 * THIS IS WHAT THE EXPORTED HTML CONTAINS. Under `output: 'export'` the
 * prerender hits next/dynamic's BailoutToCSR, which throws, and React renders
 * the Suspense fallback into the file — so this component IS the prerendered
 * `/system/3b`, and the hydration contract (zero flow elements before the chunk
 * resolves) falls out of that.
 *
 * It must live in the WRAPPER's chunk, never the lazy one: a fallback shipped
 * inside the chunk it is a fallback for is only reachable after the thing it
 * replaces has already loaded.
 *
 * The counts are computed here by a plain reduce rather than by importing the
 * layout helper, which is what keeps dagre out of the prerendered shell — the
 * same reason the Svelte original inlined them.
 *
 * Phosphor Fade: one line per layer (index, name, count, ellipsised
 * description), with `[···]` before the loading note and `!` before the
 * failure note. The full description stays in the DOM (and in `title`), only
 * its overflow is clipped.
 */
export interface FallbackData {
	nodes: SnapNode[];
	layers: SnapLayer[];
}

const FallbackContext = createContext<FallbackData>({ nodes: [], layers: [] });

export function System3bFallbackProvider({
	value,
	children,
}: {
	value: FallbackData;
	children: ReactNode;
}) {
	return <FallbackContext.Provider value={value}>{children}</FallbackContext.Provider>;
}

/**
 * `state` distinguishes the two reasons the graph is not on screen. The Svelte
 * original's no-JS end state is "loading" FOREVER — `failed` appears only after
 * a rejected import — and that is reproduced deliberately rather than
 * "improved" into a permanent message.
 */
export function System3bFallback({ state }: { state: 'loading' | 'failed' }) {
	const copy = useGraphCopy();
	const { nodes, layers } = useContext(FallbackContext);
	const failed = state === 'failed';

	const countByLayer: Record<string, number> = {};
	for (const n of nodes) countByLayer[n.layer] = (countByLayer[n.layer] ?? 0) + 1;

	return (
		<div className={failed ? 's3b-fallback failed' : 's3b-fallback'}>
			<p className="s3b-fb__note">
				<span className="s3b-fb__sig" aria-hidden="true">
					{failed ? '!' : '[···]'}
				</span>{' '}
				{failed ? copy.unavailable : copy.loading}
			</p>
			<ol className="s3b-fb__list">
				{layers.map((layer, i) => (
					<li key={layer.id} className="s3b-fb__row">
						<span className="s3b-fb__idx">{i + 1}.</span>
						<span className="s3b-fb__name">{layer.name}</span>
						{/* One text node: migration:c11 H2 reads `<n> nodes` from here. */}
						<span className="s3b-fb__count">
							{countByLayer[layer.id] ?? 0} {copy.nodesLabel}
						</span>
						<span className="s3b-fb__desc" title={layer.description}>
							{layer.description}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}
