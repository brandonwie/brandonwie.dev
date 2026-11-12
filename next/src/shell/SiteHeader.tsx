'use client';

import { usePathname } from 'next/navigation';

import { AppLink } from '@/components/AppLink';
import { LanguageToggle } from '@/components/LanguageToggle';
import { NAV_ITEMS, activeKey, homeHref, hrefFor } from '@/data/nav';
import type { ShellCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { ThemeToggle } from './ThemeToggle';

/**
 * The site header: brand, four section links, search, language and theme.
 * Every control carries `data-hotkey`; `Shortcuts` turns that key into a click.
 *
 * @param errorRoute - error pages prerender as `/_not-found` and hydrate with
 *   the real URL, so nothing here may depend on the pathname
 */
export function SiteHeader({
	locale,
	copy,
	errorRoute = false,
}: {
	locale: Locale;
	copy: ShellCopy;
	errorRoute?: boolean;
}) {
	const pathname = usePathname() ?? '/';
	const active = errorRoute ? null : activeKey(pathname);
	const home = homeHref(locale);

	return (
		<header className="site-header">
			<div className="wrap site-header__in">
				<AppLink className="brand" href={home}>
					brandonwie<span>.dev</span>
				</AppLink>
				<nav className="site-nav" aria-label={copy.navigation}>
					{NAV_ITEMS.map((item) => (
						<AppLink
							key={item.key}
							href={hrefFor(item, locale)}
							aria-current={active === item.key ? 'page' : undefined}
							data-hotkey={item.hotkey}
						>
							<span className="hotkey" aria-hidden="true">
								[{item.hotkey.toUpperCase()}]
							</span>
							{copy.nav[item.key]}
						</AppLink>
					))}
				</nav>
				<div className="site-tools">
					<AppLink
						className="site-tool"
						href={`${home}#search`}
						data-hotkey="/"
						onClick={(event) => {
							// On the index the box is already here: focus it. From any other
							// page the link opens the index, which focuses it on arrival.
							const box = document.getElementById('search');
							if (!box) return;
							event.preventDefault();
							box.focus();
						}}
					>
						<span className="hotkey" aria-hidden="true">
							[/]
						</span>
						{copy.search}
					</AppLink>
					<LanguageToggle locale={locale} pathname={pathname} copy={copy} suppress={errorRoute} />
					<ThemeToggle label={copy.theme} />
				</div>
			</div>
		</header>
	);
}
