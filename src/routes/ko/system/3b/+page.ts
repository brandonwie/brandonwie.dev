import type { PageLoad } from './$types';
import type { PostMetadata } from '$lib/stores/posts';
import snapshot from '$lib/data/system-snapshot.json';
import koOverlay from '$lib/data/system-snapshot.ko.json';
import { localizeSnapshot, type SnapshotOverlay } from '$lib/utils/localize-snapshot';

export const prerender = true;

// KO post frontmatter only (mirrors +layout.ts), used to localize blog_series
// titles by slug. Series entries without a KO post fall back to the EN snapshot.
const koModules = import.meta.glob('../../../../content/posts/ko/**/*.md', {
	import: 'metadata',
	eager: true,
}) as Record<string, PostMetadata>;

const koTitleBySlug: Record<string, string> = {};
for (const [path, metadata] of Object.entries(koModules)) {
	if (metadata.draft) continue; // unpublished drafts must not surface titles (mirrors +layout.ts)
	const slug = path.split('/').pop()?.replace('.md', '') ?? '';
	if (slug) koTitleBySlug[slug] = metadata.title;
}

export const load: PageLoad = () => ({
	snapshot: localizeSnapshot(snapshot, koOverlay as SnapshotOverlay, koTitleBySlug),
});
