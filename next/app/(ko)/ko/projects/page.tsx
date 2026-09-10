import type { Metadata } from 'next';

import { ProjectsPage } from '@/components/ProjectsPage';
import { generateProjectsMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateProjectsMetadata('ko');

export default function KoreanProjectsPage() {
	return <ProjectsPage locale="ko" />;
}
