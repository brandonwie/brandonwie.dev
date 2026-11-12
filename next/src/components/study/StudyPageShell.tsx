import type { ReactNode } from 'react';

/**
 * StudyPageShell — the page root for the study pages.
 *
 * The site shell (`next/src/shell/site-shell.tsx`) owns `<main
 * id="main-content">`, so this wrapper is a plain `div`: rendering a second
 * `main` or a second `id="main-content"` would give the skip link two targets.
 * It keeps the Pagefind body marker and carries the `study` root class, the
 * scope the shared study rules in `next/app/styles/pages/study-index.css` hang
 * from.
 */
export default function StudyPageShell({
	className,
	children,
}: {
	/** The page's own root class (`course`, `aws`). */
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={className ? `study ${className}` : 'study'} data-pagefind-body>
			{children}
		</div>
	);
}
