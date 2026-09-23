import { AppLink } from '@/components/AppLink';
import { NAV_ITEMS, base, hrefFor, type NavKey } from '@/data/nav';
import type { ShellCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';

function navHref(key: NavKey, locale: Locale): string {
	const item = NAV_ITEMS.find((i) => i.key === key);
	if (!item) throw new Error(`TerminalFooter: no NAV_ITEMS entry for '${key}'`);
	return hrefFor(item, locale);
}

type FooterLink = { href: string; label: string; external?: boolean };

/**
 * The `~/.plan` frame — the site footer: tagline, `site/ more/ connect/`
 * columns of numbered links `[1]`–`[9]` (D4: decorative, `aria-hidden`), and
 * both copyright lines. Labels come from the message catalogue; the lowercase
 * look is CSS, so screen readers get the catalogue strings unchanged.
 */
export function TerminalFooter({ locale, copy }: { locale: Locale; copy: ShellCopy }) {
	const prefix = base(locale);
	const columns: { heading: string; links: FooterLink[] }[] = [
		{
			heading: copy.footerColSite,
			links: [
				{ href: navHref('about', locale), label: copy.nav.about },
				{ href: navHref('posts', locale), label: copy.nav.posts },
				{ href: navHref('study', locale), label: copy.nav.study },
			],
		},
		{
			heading: copy.footerColMore,
			links: [
				{ href: navHref('system', locale), label: copy.nav.system },
				{ href: `${prefix}/projects`, label: copy.navProjects },
				{ href: `${prefix}/tags`, label: copy.navTags },
			],
		},
		{
			heading: copy.footerColConnect,
			links: [
				{ href: `${prefix}/contact`, label: copy.navContact },
				{ href: 'https://github.com/brandonwie', label: 'GitHub', external: true },
				{ href: 'https://linkedin.com/in/brandonwie', label: 'LinkedIn', external: true },
			],
		},
	];

	let n = 0;
	return (
		<footer className="term-frame term-plan">
			<span className="term-frame__title" aria-hidden="true">
				~/.plan
			</span>
			<div className="term-plan__grid">
				<p className="term-plan__tagline">{copy.footerTagline}</p>
				<nav className="term-plan__cols" aria-label={copy.footerNavigation}>
					{columns.map((column) => (
						<div className="term-plan__col" key={column.heading}>
							<p className="term-plan__ch">{column.heading}/</p>
							{column.links.map((link) => {
								n += 1;
								const body = (
									<>
										<span className="n" aria-hidden="true">
											[{n}]
										</span>
										{link.label}
										{link.external ? <span aria-hidden="true"> ↗</span> : null}
									</>
								);
								if (link.external) {
									return (
										<a
											key={link.href}
											className="term-lnk"
											href={link.href}
											target="_blank"
											rel="noopener noreferrer"
										>
											{body}
										</a>
									);
								}
								return (
									<AppLink key={link.href} className="term-lnk" href={link.href}>
										{body}
									</AppLink>
								);
							})}
						</div>
					))}
				</nav>
			</div>
			<div className="term-plan__copy">
				<span>{copy.footerCopyPrimary}</span>
				<span>{copy.footerCopySecondary}</span>
			</div>
		</footer>
	);
}
