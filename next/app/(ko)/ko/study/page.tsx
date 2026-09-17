import type { Metadata } from 'next';

import StudyIndexPage from '@/components/study/StudyIndexPage';
import { getStudyIndexContent } from '@/data/study';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getStudyIndexContent('ko');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study',
		locale: 'ko',
	});
}

export default function KoreanStudyIndexPage() {
	return <StudyIndexPage locale="ko" />;
}
