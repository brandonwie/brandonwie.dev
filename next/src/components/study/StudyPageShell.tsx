import type { ReactNode } from 'react';

/**
 * StudyPageShell — shared `<main>` wrapper for the study pages.
 *
 * Port of `src/lib/components/study/StudyPageShell.svelte`. The header lives
 * once in the root layout, so this shell only owns the study content column.
 * A server component: it holds no state, only the `main-content` landmark the
 * skip link targets and the Pagefind body marker.
 */
export default function StudyPageShell({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-bg">
			<main
				id="main-content"
				data-pagefind-body
				className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16"
			>
				{children}
			</main>
		</div>
	);
}
