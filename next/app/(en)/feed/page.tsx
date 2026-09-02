import type { Metadata } from 'next';

import { SocialFeedPage, generateFeedMetadata } from '@/content/social-feed';

export const metadata: Metadata = generateFeedMetadata('en');

export default function EnglishFeedPage() {
	return <SocialFeedPage locale="en" />;
}
