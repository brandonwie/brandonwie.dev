import type { ReactNode } from 'react';

import { shellCopy } from '@/i18n/copy';
import type { Locale } from './document';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * The frame every page lives in: skip link, header, `main`, footer.
 *
 * @param extras - client pieces a locale layout adds to the footer (the
 *   shortcut help). A slot, so the `'use client'` error route, which renders
 *   this shell too, does not pull them into its bundle.
 * @param errorRoute - marks the 404 and error pages; see `SiteHeader`
 */
export function SiteShell({
	locale,
	extras,
	errorRoute = false,
	children,
}: {
	locale: Locale;
	extras?: ReactNode;
	errorRoute?: boolean;
	children: ReactNode;
}) {
	const copy = shellCopy(locale);

	return (
		<div className="site-shell">
			<a className="skip-link" href="#main-content">
				{copy.skip}
			</a>
			<SiteHeader locale={locale} copy={copy} errorRoute={errorRoute} />
			<main id="main-content" className="site-main" tabIndex={-1}>
				{children}
			</main>
			<SiteFooter locale={locale} copy={copy}>
				{extras}
			</SiteFooter>
		</div>
	);
}
