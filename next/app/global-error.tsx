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
			<SiteShell locale="en">
				<section className="failure-panel" aria-labelledby="error-title">
					<p>Error</p>
					<h1 id="error-title">Something went wrong</h1>
					<p>The page could not be rendered. Try again or return home.</p>
					<div className="failure-actions">
						<button type="button" onClick={reset}>
							Try again
						</button>
						<a className="home-link" href="/">
							Return home
						</a>
					</div>
				</section>
			</SiteShell>
		</DocumentShell>
	);
}
