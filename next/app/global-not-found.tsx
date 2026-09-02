import { DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';

export default function GlobalNotFound() {
	return (
		<DocumentShell lang="en" title="Page not found | Brandon Wie" standaloneHead>
			<SiteShell locale="en">
				<section className="failure-panel" aria-labelledby="not-found-title">
					<p>404</p>
					<h1 id="not-found-title">Page not found</h1>
					<p>The requested page is not part of this static export.</p>
					<a className="home-link" href="/">
						Return home
					</a>
				</section>
			</SiteShell>
		</DocumentShell>
	);
}
