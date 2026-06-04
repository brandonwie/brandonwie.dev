/**
 * Korean localization overlay for the /system/3b architecture snapshot.
 *
 * The snapshot (`system-snapshot.json`) is generator-written
 * (`scripts/snapshot-3b-system.ts`), so Korean text cannot live inside it —
 * it would be clobbered on every regen. Instead a sectioned overlay
 * (`system-snapshot.ko.json`) is merged at load time, keyed by the same
 * identifiers the snapshot uses (layers=id, subsystems=key, evolution=id,
 * nodes=id). Any field absent from the overlay falls back to the EN snapshot,
 * so partial coverage (e.g. a newly added node/ADR) degrades gracefully.
 */

interface LayerLike {
	id: string;
	name: string;
	description: string;
}

interface SubsystemLike {
	key: string;
	name: string;
	display_one_liner: string;
	[k: string]: unknown;
}

interface EvolutionLike {
	id: string;
	title: string;
	[k: string]: unknown;
}

interface BlogSeriesLike {
	slug: string;
	title: string;
	[k: string]: unknown;
}

interface NodeLike {
	id: string;
	name: string;
	[k: string]: unknown;
}

export interface SnapshotLike {
	layers: LayerLike[];
	subsystems: SubsystemLike[];
	evolution: EvolutionLike[];
	blog_series: BlogSeriesLike[];
	nodes: NodeLike[];
	[k: string]: unknown;
}

export interface SnapshotOverlay {
	layers?: Record<string, { name?: string; description?: string }>;
	subsystems?: Record<string, { name?: string; display_one_liner?: string }>;
	evolution?: Record<string, { title?: string }>;
	nodes?: Record<string, { name?: string }>;
}

/**
 * Returns a new snapshot with Korean text merged in. Pure — does not mutate
 * the input. `koTitleBySlug` carries KO blog-post titles resolved by the
 * caller (only published series posts have one; planned entries fall back to
 * the EN snapshot title).
 */
export function localizeSnapshot<T extends SnapshotLike>(
	snapshot: T,
	overlay: SnapshotOverlay,
	koTitleBySlug: Record<string, string> = {},
): T {
	return {
		...snapshot,
		layers: snapshot.layers.map((l) => ({
			...l,
			name: overlay.layers?.[l.id]?.name ?? l.name,
			description: overlay.layers?.[l.id]?.description ?? l.description,
		})),
		subsystems: snapshot.subsystems.map((s) => ({
			...s,
			name: overlay.subsystems?.[s.key]?.name ?? s.name,
			display_one_liner: overlay.subsystems?.[s.key]?.display_one_liner ?? s.display_one_liner,
		})),
		evolution: snapshot.evolution.map((e) => ({
			...e,
			title: overlay.evolution?.[e.id]?.title ?? e.title,
		})),
		blog_series: snapshot.blog_series.map((b) => ({
			...b,
			title: koTitleBySlug[b.slug] ?? b.title,
		})),
		nodes: snapshot.nodes.map((n) => ({
			...n,
			name: overlay.nodes?.[n.id]?.name ?? n.name,
		})),
	} as T;
}
