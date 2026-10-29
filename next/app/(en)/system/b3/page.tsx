import type { Metadata } from 'next';

import { System3bPage, generateSystem3bMetadata } from '@/content/system-3b';

export const metadata: Metadata = generateSystem3bMetadata('en');

export default function EnglishSystem3bPage() {
	return <System3bPage locale="en" />;
}
