import type { Locale } from '@/i18n/locale';
import { generateStudySeoMetadata, type StudySeoMetadataOptions } from '@/seo/metadata';

export interface StudySeoHeadProps {
	pageTitle: string;
	description: string;
	basePath: string;
	locale?: Locale;
}

/**
 * StudySeoHead — Next.js counterpart to `src/lib/components/study/StudySeoHead.svelte`.
 *
 * In Next.js App Router, head metadata is emitted from page route exports via
 * `generateStudySeoMetadata({ pageTitle, description, basePath, locale })`.
 * This component and helper ensure exact contract parity for study/static pages.
 */
export function StudySeoHead(_props: StudySeoHeadProps) {
	// In Next.js App Router, metadata is provided via `export const metadata`
	// or `generateMetadata()`. Component renders nothing into DOM directly.
	return null;
}

export { generateStudySeoMetadata, type StudySeoMetadataOptions };
export default StudySeoHead;
