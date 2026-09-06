import type { Metadata } from 'next';

import { System3bPage, generateSystem3bMetadata } from '@/content/system-3b';

export const metadata: Metadata = generateSystem3bMetadata('ko');

export default function KoreanSystem3bPage() {
	return <System3bPage locale="ko" />;
}
