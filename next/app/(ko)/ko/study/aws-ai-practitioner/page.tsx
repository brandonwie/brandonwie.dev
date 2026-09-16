import type { Metadata } from 'next';

import AwsAiPractitionerStudyPage from '@/components/study/AwsAiPractitionerStudyPage';
import { getAwsAiPractitionerContent } from '@/data/study-aws-ai-practitioner';
import { generateStudySeoMetadata } from '@/seo/metadata';

export function generateMetadata(): Metadata {
	const content = getAwsAiPractitionerContent('ko');
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/study/aws-ai-practitioner',
		locale: 'ko',
	});
}

export default function KoreanAwsAiPractitionerStudyPage() {
	return <AwsAiPractitionerStudyPage locale="ko" />;
}
