import { NAV_ITEMS, base, hrefFor } from '@/data/nav';
import type { NavKey } from '@/data/nav';
import type { Locale } from '@/i18n/locale';
import type { ShellCopy } from '@/i18n/copy';

/**
 * Footer — the single global site footer, ported from
 * `src/lib/components/Footer.svelte`.
 *
 * A brand block, three link columns, and a copy line. Hrefs come from
 * `@/data/nav` so the EN/KO mirrors resolve from one place.
 *
 * Uses and Now remain gated (no source yet) and are intentionally omitted, as
 * in the original. Tags, Projects and Contact are linked here rather than in
 * the lean top nav, and their hrefs are built from the locale base instead of
 * `NAV_ITEMS`, which stays scoped to the four header destinations.
 *
 * This is a server component: it needs the locale, which the route group knows,
 * and no browser API.
 */
function navHref(key: NavKey, locale: Locale): string {
	const item = NAV_ITEMS.find((i) => i.key === key);
	if (!item) throw new Error(`Footer: no NAV_ITEMS entry for '${key}'`);
	return hrefFor(item, locale);
}

export function Footer({ locale, copy }: { locale: Locale; copy: ShellCopy }) {
	const prefix = base(locale);

	return (
		<footer className="site-footer">
			<div className="site-footer__in">
				<div className="site-footer__grid">
					<div className="site-footer__brand">
						<div className="site-footer__cta">$ connect --brandon</div>
						<p className="site-footer__tagline">{copy.footerTagline}</p>
					</div>
					<nav className="site-footer__cols" aria-label={copy.footerNavigation}>
						<div className="site-footer__col">
							<div className="site-footer__ch">{copy.footerColSite}</div>
							<a href={navHref('about', locale)}>{copy.nav.about}</a>
							<a href={navHref('posts', locale)}>{copy.nav.posts}</a>
							<a href={navHref('study', locale)}>{copy.nav.study}</a>
						</div>
						<div className="site-footer__col">
							<div className="site-footer__ch">{copy.footerColMore}</div>
							<a href={navHref('system', locale)}>{copy.nav.system}</a>
							<a href={`${prefix}/projects`}>{copy.navProjects}</a>
							<a href={`${prefix}/tags`}>{copy.navTags}</a>
						</div>
						<div className="site-footer__col">
							<div className="site-footer__ch">{copy.footerColConnect}</div>
							<a href={`${prefix}/contact`}>{copy.navContact}</a>
							<a href="https://github.com/brandonwie" target="_blank" rel="noopener noreferrer">
								GitHub ↗
							</a>
							<a
								href="https://linkedin.com/in/brandonwie"
								target="_blank"
								rel="noopener noreferrer"
							>
								LinkedIn ↗
							</a>
						</div>
					</nav>
				</div>
				<div className="site-footer__copy">
					<span>{copy.footerCopyPrimary}</span>
					<span>{copy.footerCopySecondary}</span>
				</div>
			</div>
		</footer>
	);
}
