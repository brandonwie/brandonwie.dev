import type { Metadata } from 'next';

import { BlogHome } from '@/components/BlogHome';
import { listPostsForLocale } from '@/content/post-list';
import { generateHomeMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateHomeMetadata('ko');

export default function KoreanHomePage() {
	const posts = listPostsForLocale('ko');
	return <BlogHome posts={posts} basePath="/ko" />;
}
