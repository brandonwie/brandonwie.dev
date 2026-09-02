import type { Metadata } from 'next';

import { SocialFeedPage, generateFeedMetadata } from '@/content/social-feed';

export const metadata: Metadata = generateFeedMetadata('ko');

export default function KoreanFeedPage() {
	return <SocialFeedPage locale="ko" />;
}
