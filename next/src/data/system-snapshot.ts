/**
 * The 3B system snapshot, read from the Svelte tree rather than copied.
 *
 * Same rule as `social-feed.json` in `content/social-feed.tsx` and the
 * `public/` symlinks: while both stacks exist, a shared input is imported
 * across rather than duplicated, so the two builds cannot drift apart while
 * nobody is looking. `deno task snapshot:3b` regenerates the file in place and
 * both stacks pick the change up.
 *
 * The JSON is already sanitized by that task, so rendering it adds no privacy
 * surface — the same statement `system3b-graph.ts` opens with.
 */
import raw from '../../../src/lib/data/system-snapshot.json';

import type { SnapEdge, SnapLayer, SnapNode } from '../graph/system3b-graph';

export interface SystemSnapshot {
	nodes: SnapNode[];
	edges: SnapEdge[];
	layers: SnapLayer[];
}

const snapshot: SystemSnapshot = raw as SystemSnapshot;

export default snapshot;
