import type { Metadata } from 'next';

import { SystemPage } from '@/components/SystemPage';
import { generateSystemMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateSystemMetadata('en');

export default function EnglishSystemPage() {
	return <SystemPage locale="en" />;
}
