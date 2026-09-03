'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { graphCopy, type GraphCopy } from '../i18n/graph-copy';
import type { Locale } from '../i18n/locale';

/**
 * Locale for the graph subtree.
 *
 * React Flow renders custom nodes from a `nodeTypes` map and hands them only
 * `NodeProps`, so there is no prop channel to pass a locale down. Context is
 * the channel that exists. The alternative — resolving copy into `node.data`
 * inside the model builder — would make `system3b-graph.ts` locale-aware, which
 * is exactly the framework-shaped coupling C11 exists to remove.
 *
 * The default is the base locale so a node rendered outside a provider still
 * says something; it is not a substitute for wrapping the tree.
 */
const GraphLocaleContext = createContext<GraphCopy>(graphCopy('en'));

export function GraphLocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
	const value = useMemo(() => graphCopy(locale), [locale]);
	return <GraphLocaleContext.Provider value={value}>{children}</GraphLocaleContext.Provider>;
}

export function useGraphCopy(): GraphCopy {
	return useContext(GraphLocaleContext);
}
