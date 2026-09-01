import type { ReactNode } from 'react';

import { DOCUMENT_METADATA, DOCUMENT_VIEWPORT, DocumentShell } from '@/shell/document';

/**
 * Root layout — contract C13.
 *
 * English is the unprefixed locale, so this root layout is the English one.
 * Korean lives at `/ko/*` and needs its own `<html lang="ko">`; how that is
 * expressed is recorded in `verification/contracts/C13-document-shell.md`
 * § Korean root layout and is not decided by this file.
 */
export const metadata = DOCUMENT_METADATA;
export const viewport = DOCUMENT_VIEWPORT;

export default function RootLayout({ children }: { children: ReactNode }) {
	return <DocumentShell lang="en">{children}</DocumentShell>;
}
