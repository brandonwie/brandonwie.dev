import type { Metadata } from 'next';

import SearchPage from '@/components/SearchPage';
import { generateSearchMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateSearchMetadata('ko');

export default function KoSearch() {
	return <SearchPage locale="ko" />;
}
