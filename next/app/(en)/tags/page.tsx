import type { Metadata } from 'next';

import { TagsPage } from '@/components/TagsPage';
import { listPostsForLocale } from '@/content/post-list';
import { generateTagsMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateTagsMetadata('en');

export default function EnglishTagsPage() {
	const posts = listPostsForLocale('en');
	return <TagsPage locale="en" posts={posts} />;
}
