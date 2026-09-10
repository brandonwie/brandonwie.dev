import type { Metadata } from 'next';

import { ContactPage } from '@/components/ContactPage';
import { generateContactMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateContactMetadata('en');

export default function EnglishContactPage() {
	return <ContactPage locale="en" />;
}
