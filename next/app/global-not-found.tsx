import { DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';

/**
 * The one 404 page of the static export. It serves both locales, so the
 * message is written in both.
 */
export default function GlobalNotFound() {
	return (
		<DocumentShell lang="en" title="Page not found | Brandon Wie" standaloneHead>
			<SiteShell locale="en" errorRoute>
				<section className="notice-page" aria-labelledby="notice-title">
					<p className="eyebrow">404</p>
					<h1 id="notice-title">Page not found</h1>
					<p>This address has no page. The post may have moved, or the link may be wrong.</p>
					<p lang="ko">
						이 주소에는 페이지가 없습니다. 글이 옮겨졌거나 링크가 잘못되었을 수 있습니다.
					</p>
					<p className="notice-page__actions">
						<a className="button" href="/">
							All posts
						</a>
						<a className="button" href="/ko" lang="ko">
							모든 글
						</a>
					</p>
				</section>
			</SiteShell>
		</DocumentShell>
	);
}
