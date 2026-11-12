import type { Metadata } from 'next';

import { PostIndex } from '@/components/PostIndex';
import { generateHomeMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateHomeMetadata('ko');

export default function KoreanHomePage() {
	return <PostIndex locale="ko" />;
}
