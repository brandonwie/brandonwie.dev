import type { ReactNode } from 'react';

import { shellCopy } from '@/i18n/copy';
import { DOCUMENT_METADATA, DOCUMENT_VIEWPORT, DocumentShell } from '@/shell/document';
import { Shortcuts } from '@/shell/Shortcuts';
import { SiteShell } from '@/shell/site-shell';

export const metadata = DOCUMENT_METADATA;
export const viewport = DOCUMENT_VIEWPORT;

export default function KoreanLayout({ children }: { children: ReactNode }) {
	return (
		<DocumentShell lang="ko">
			<SiteShell locale="ko" extras={<Shortcuts copy={shellCopy('ko').shortcuts} />}>
				{children}
			</SiteShell>
		</DocumentShell>
	);
}
