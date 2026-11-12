import type { Metadata } from 'next';

import { PostIndex } from '@/components/PostIndex';
import { generateHomeMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateHomeMetadata('en');

export default function EnglishHomePage() {
	return <PostIndex locale="en" />;
}
