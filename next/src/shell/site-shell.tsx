import type { ReactNode } from 'react';

import type { Locale } from './document';

const ARTICLE_PATH = {
	en: '/posts/giscus-sveltekit-integration',
	ko: '/ko/posts/giscus-sveltekit-integration',
} as const;

const COPY = {
	en: {
		skip: 'Skip to content',
		brandLabel: 'Brandon Wie home',
		navigation: 'Primary navigation',
		home: 'Home',
		article: 'Article',
		footer: 'Site footer',
		footerText: 'Engineering notes by Brandon Wie.',
	},
	ko: {
		skip: '본문으로 건너뛰기',
		brandLabel: 'Brandon Wie 홈',
		navigation: '주요 탐색',
		home: '홈',
		article: '글',
		footer: '사이트 하단',
		footerText: 'Brandon Wie의 엔지니어링 기록.',
	},
} as const;

export function SiteShell({ locale, children }: { locale: Locale; children: ReactNode }) {
	const copy = COPY[locale];

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
							<a href={ARTICLE_PATH[locale]}>{copy.article}</a>
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
