import type { Metadata } from 'next';

import { AboutPage } from '@/components/AboutPage';
import { generateAboutMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateAboutMetadata('ko');

export default function KoreanAboutPage() {
	return <AboutPage locale="ko" />;
}
