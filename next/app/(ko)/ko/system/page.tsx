import type { Metadata } from 'next';

import { SystemPage } from '@/components/SystemPage';
import { generateSystemMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateSystemMetadata('ko');

export default function KoreanSystemPage() {
	return <SystemPage locale="ko" />;
}
