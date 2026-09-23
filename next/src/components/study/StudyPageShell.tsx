import type { ReactNode } from 'react';

/**
 * StudyPageShell — the page root for the study pages inside the terminal shell.
 *
 * The site shell (`next/src/shell/site-shell.tsx`) owns `<main
 * id="main-content">`, so this wrapper is a plain `div`: rendering a second
 * `main` or a second `id="main-content"` would give the skip link two targets.
 * It keeps the Pagefind body marker and carries the `pg-study` root class, the
 * scope every study rule in `next/app/styles/pages/study-*.css` hangs from
 * (including the token remap that puts the visualizers on the shell inks).
 */
export default function StudyPageShell({
	className,
	children,
}: {
	/** The page's own root class (`pg-study-index`, `pg-study-course`, …). */
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={className ? `pg-study ${className}` : 'pg-study'} data-pagefind-body>
			{children}
		</div>
	);
}
