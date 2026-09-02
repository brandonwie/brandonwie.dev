import type { ReactNode } from 'react';

import { DOCUMENT_METADATA, DOCUMENT_VIEWPORT, DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';

export const metadata = DOCUMENT_METADATA;
export const viewport = DOCUMENT_VIEWPORT;

export default function KoreanLayout({ children }: { children: ReactNode }) {
	return (
		<DocumentShell lang="ko">
			<SiteShell locale="ko">{children}</SiteShell>
		</DocumentShell>
	);
}
