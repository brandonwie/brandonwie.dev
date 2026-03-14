import type { PageLoad } from './$types';
import type { PostMetadata } from '$lib/stores/posts';
import { effectiveDate } from '$lib/utils/date';

const modules = import.meta.glob('../../content/posts/en/**/*.md', {
	import: 'metadata',
	eager: true,
}) as Record<string, PostMetadata>;

export const load: PageLoad = () => {
	const posts: PostMetadata[] = [];

	for (const [path, metadata] of Object.entries(modules)) {
		if (metadata.draft) continue;

		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		posts.push({ ...metadata, slug });
	}

	posts.sort(
		(a, b) =>
			new Date(effectiveDate(b.date, b.updated)).getTime() -
			new Date(effectiveDate(a.date, a.updated)).getTime(),
	);

	return { posts };
};
