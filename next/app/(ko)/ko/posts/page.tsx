import type { Metadata } from 'next';

import { PostsListPage } from '@/components/PostsListPage';
import { listKoreanPostsWithEnglishFallback } from '@/content/post-list';
import { generatePostsListMetadata } from '@/seo/metadata';

export const metadata: Metadata = generatePostsListMetadata('ko');

export default function KoreanPostsPage() {
	const posts = listKoreanPostsWithEnglishFallback();
	return <PostsListPage posts={posts} basePath="/ko" />;
}
