import type { Metadata } from 'next';

import { ProjectsPage } from '@/components/ProjectsPage';
import { generateProjectsMetadata } from '@/seo/metadata';

export const metadata: Metadata = generateProjectsMetadata('en');

export default function EnglishProjectsPage() {
	return <ProjectsPage locale="en" />;
}
