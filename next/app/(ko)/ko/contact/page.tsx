import type { Metadata } from 'next';

import { ContactPage } from '@/components/ContactPage';
import { generateContactMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateContactMetadata('ko');

export default function KoreanContactPage() {
	return <ContactPage locale="ko" />;
}
