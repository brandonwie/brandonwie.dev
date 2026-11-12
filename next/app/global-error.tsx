'use client';

import { DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';

export default function GlobalError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<DocumentShell lang="en" title="Something went wrong | Brandon Wie" standaloneHead>
			<SiteShell locale="en" errorRoute>
				<section className="notice-page" aria-labelledby="notice-title">
					<p className="eyebrow">Error</p>
					<h1 id="notice-title">Something went wrong</h1>
					<p>The page could not be rendered. Try again, or go back to the posts.</p>
					<p className="notice-page__actions">
						<button type="button" className="button" onClick={reset}>
							Try again
						</button>
						<a className="button" href="/">
							All posts
						</a>
					</p>
				</section>
			</SiteShell>
		</DocumentShell>
	);
}
