import type { ReactNode } from 'react';

import { DOCUMENT_METADATA, DOCUMENT_VIEWPORT, DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';

export const metadata = DOCUMENT_METADATA;
export const viewport = DOCUMENT_VIEWPORT;

export default function EnglishLayout({ children }: { children: ReactNode }) {
	return (
		<DocumentShell lang="en">
			<SiteShell locale="en">{children}</SiteShell>
		</DocumentShell>
	);
}
