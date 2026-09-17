import type { Metadata } from 'next';

import DsaIStudyPage from '@/components/study/DsaIStudyPage';
import { getDsaIContent } from '@/data/study';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getDsaIContent('ko');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study/dsa-i',
		locale: 'ko',
	});
}

export default function KoreanDsaIStudyPage() {
	return <DsaIStudyPage locale="ko" />;
}
