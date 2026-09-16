import type { Metadata } from 'next';

import DsaIIIStudyPage from '@/components/study/DsaIIIStudyPage';
import { getDsaIIIContent } from '@/data/study';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getDsaIIIContent('ko');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study/dsa-iii',
		locale: 'ko',
	});
}

export default function KoreanDsaIIIStudyPage() {
	return <DsaIIIStudyPage locale="ko" />;
}
