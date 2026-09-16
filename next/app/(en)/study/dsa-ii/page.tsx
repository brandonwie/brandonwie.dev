import type { Metadata } from 'next';

import DsaIIStudyPage from '@/components/study/DsaIIStudyPage';
import { getDsaIIContent } from '@/data/study';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getDsaIIContent('en');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study/dsa-ii',
		locale: 'en',
	});
}

export default function EnglishDsaIIStudyPage() {
	return <DsaIIStudyPage locale="en" />;
}
