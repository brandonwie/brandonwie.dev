import type { Metadata } from 'next';

import { TagsPage } from '@/components/TagsPage';
import { listPostsForLocale } from '@/content/post-list';
import { generateTagsMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateTagsMetadata('ko');

export default function KoreanTagsPage() {
	const posts = listPostsForLocale('ko');
	return <TagsPage locale="ko" posts={posts} />;
}
