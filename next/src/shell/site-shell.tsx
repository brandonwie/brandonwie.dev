import type { ReactNode } from 'react';

import { SLICE_1_ARTICLE_SLUG, articlePath } from '../content/article-contract';
import { shellCopy } from '../i18n/copy';
import type { Locale } from './document';

export function SiteShell({ locale, children }: { locale: Locale; children: ReactNode }) {
	const copy = shellCopy(locale);

	return (
		<div className="site-shell">
			<a className="skip-link" href="#main-content">
				{copy.skip}
			</a>
			<header className="site-header">
				<nav className="site-nav" aria-label={copy.navigation}>
					<a className="site-brand" href="/" aria-label={copy.brandLabel}>
						brandonwie.dev
					</a>
					<ul className="site-links">
						<li>
							<a href="/">{copy.home}</a>
						</li>
						<li>
							<a href={articlePath(SLICE_1_ARTICLE_SLUG, locale)}>{copy.article}</a>
						</li>
					</ul>
				</nav>
			</header>
			<main id="main-content" className="page-frame" tabIndex={-1}>
				{children}
			</main>
			<footer className="site-footer" aria-label={copy.footer}>
				<div className="site-footer-inner">{copy.footerText}</div>
			</footer>
		</div>
	);
}
