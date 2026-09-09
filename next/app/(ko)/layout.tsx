import type { ReactNode } from 'react';

import ShellPalette from '@/components/palette/ShellPalette';
import { shellCopy } from '@/i18n/copy';
import { palettePosts } from '@/palette/server-posts';
import { DOCUMENT_METADATA, DOCUMENT_VIEWPORT, DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';

export const metadata = DOCUMENT_METADATA;
export const viewport = DOCUMENT_VIEWPORT;

/**
 * The palette mounts HERE, once per locale subtree, rather than inside
 * `SiteShell`: the shell is also rendered by the `'use client'` error route,
 * which must not carry palette code. Posts are read and serialized on the
 * server, and the copy is resolved here too, so the client controller never
 * pulls the Paraglide message modules in for strings this layout already knows.
 */
export default function KoreanLayout({ children }: { children: ReactNode }) {
	const copy = shellCopy('ko');

	return (
		<DocumentShell lang="ko">
			<SiteShell
				locale="ko"
				header={<ShellPalette locale="ko" copy={copy} posts={palettePosts('ko')} />}
			>
				{children}
			</SiteShell>
		</DocumentShell>
	);
}
