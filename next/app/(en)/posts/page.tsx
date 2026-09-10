import type { Metadata } from 'next';

import { PostsListPage } from '@/components/PostsListPage';
import { listPostsForLocale } from '@/content/post-list';
import { generatePostsListMetadata } from '@/seo/metadata';

export const metadata: Metadata = generatePostsListMetadata('en');

export default function EnglishPostsPage() {
	const posts = listPostsForLocale('en');
	return <PostsListPage posts={posts} basePath="/" />;
}
