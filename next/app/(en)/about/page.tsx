import type { Metadata } from 'next';

import { AboutPage } from '@/components/AboutPage';
import { generateAboutMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateAboutMetadata('en');

export default function EnglishAboutPage() {
	return <AboutPage locale="en" />;
}
