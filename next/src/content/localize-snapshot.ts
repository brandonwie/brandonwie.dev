import type { SnapBlogSeries, SystemSnapshot } from '../data/system-snapshot';

/**
 * The Korean overlay for the `/system/3b` snapshot.
 *
 * Ports `src/lib/utils/localize-snapshot.ts`. The snapshot itself is written by
 * `scripts/snapshot-3b-system.ts`, so Korean text cannot live inside it -- a
 * regeneration would erase it. A sectioned overlay
 * (`src/lib/data/system-snapshot.ko.json`) is merged at render time instead,
 * keyed by the identifiers the snapshot already uses, and any field the overlay
 * omits falls through to the English snapshot.
 *
 * SCOPE. The Svelte localizer also merges `subsystems` and `evolution`. Those
 * sections are not on the Next page yet (the port is still the graph plus the
 * blog series), so merging them here would be untested code standing in for a
 * section that does not render. They arrive with their sections.
 *
 * Blog-series titles are not in the overlay at all. A series entry that has a
 * published Korean post takes that post's own title, which is why the caller
 * passes `koreanTitleBySlug` -- the Korean route reads it from the Korean
 * corpus, exactly as `src/routes/ko/system/3b/+page.ts:16-21` does. An entry
 * with no Korean post (every `planned` one, since the post does not exist yet)
 * keeps the English snapshot title.
 */
export interface SnapshotOverlay {
	layers?: Record<string, { name?: string; description?: string }>;
	nodes?: Record<string, { name?: string }>;
}

export function localizeSnapshot(
	snapshot: SystemSnapshot,
	overlay: SnapshotOverlay,
	koreanTitleBySlug: Record<string, string> = {},
): SystemSnapshot {
	return {
		...snapshot,
		layers: snapshot.layers.map((layer) => ({
			...layer,
			name: overlay.layers?.[layer.id]?.name ?? layer.name,
			description: overlay.layers?.[layer.id]?.description ?? layer.description,
		})),
		nodes: snapshot.nodes.map((node) => ({
			...node,
			name: overlay.nodes?.[node.id]?.name ?? node.name,
		})),
		blog_series: snapshot.blog_series.map((entry): SnapBlogSeries => ({
			...entry,
			title: koreanTitleBySlug[entry.slug] ?? entry.title,
		})),
	};
}
