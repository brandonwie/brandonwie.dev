import type { ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import { base } from '@/data/nav';
import type { ShellCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { SITE_AUTHOR, SOCIAL } from '../../../src/lib/seo';

/**
 * The site footer: author, feeds and contact links.
 *
 * @param children - the keyboard-shortcut trigger, absent on error pages
 */
export function SiteFooter({
	locale,
	copy,
	children,
}: {
	locale: Locale;
	copy: ShellCopy;
	children?: ReactNode;
}) {
	const prefix = base(locale);

	return (
		<footer className="site-footer">
			<div className="wrap site-footer__in">
				<p>© {SITE_AUTHOR}</p>
				<nav className="site-footer__links" aria-label={copy.footerNavigation}>
					<a href={`${prefix}/rss.xml`}>RSS</a>
					<AppLink href={`${prefix}/feed`}>{copy.feed}</AppLink>
					<a href={SOCIAL.github} rel="me noopener noreferrer" target="_blank">
						GitHub
					</a>
					<a href={SOCIAL.linkedin} rel="me noopener noreferrer" target="_blank">
						LinkedIn
					</a>
					<a href={SOCIAL.x} rel="me noopener noreferrer" target="_blank">
						X
					</a>
					<a href={`mailto:${SOCIAL.email}`}>Email</a>
				</nav>
				{children}
			</div>
		</footer>
	);
}
