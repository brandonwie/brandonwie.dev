import type { Metadata } from 'next';

import DsaIVStudyPage from '@/components/study/DsaIVStudyPage';
import { getDsaIVContent } from '@/data/study';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getDsaIVContent('ko');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study/dsa-iv',
		locale: 'ko',
	});
}

export default function KoreanDsaIVStudyPage() {
	return <DsaIVStudyPage locale="ko" />;
}
