import type { Metadata } from 'next';

import SearchPage from '@/components/SearchPage';
import { generateSearchMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateSearchMetadata('en');

export default function Search() {
	return <SearchPage locale="en" />;
}
