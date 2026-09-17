import type { Metadata } from 'next';

import DsaIIStudyPage from '@/components/study/DsaIIStudyPage';
import { getDsaIIContent } from '@/data/study';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getDsaIIContent('ko');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study/dsa-ii',
		locale: 'ko',
	});
}

export default function KoreanDsaIIStudyPage() {
	return <DsaIIStudyPage locale="ko" />;
}
