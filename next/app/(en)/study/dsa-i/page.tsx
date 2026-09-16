import type { Metadata } from 'next';

import DsaIStudyPage from '@/components/study/DsaIStudyPage';
import { getDsaIContent } from '@/data/study';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getDsaIContent('en');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study/dsa-i',
		locale: 'en',
	});
}

export default function EnglishDsaIStudyPage() {
	return <DsaIStudyPage locale="en" />;
}
