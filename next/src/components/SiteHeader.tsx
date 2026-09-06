'use client';

import { usePathname } from 'next/navigation';

import { HeaderControls } from '@/components/HeaderControls';
import { NAV_ITEMS, activeKey, homeHref, hrefFor } from '@/data/nav';
import type { Locale } from '@/i18n/locale';
import type { ShellCopy } from '@/i18n/copy';

/**
 * SiteHeader — the single global header for every route, ported from
 * `src/lib/components/SiteHeader.svelte`.
 *
 * A sticky bar with a pulse-dot brand, `~/path` nav links, a Cmd/Ctrl+K
 * command-palette button, and the language control. Hrefs and active section
 * come from `@/data/nav`; there is no per-page header.
 *
 * WHY THIS IS A CLIENT COMPONENT. Active state needs the current pathname, and
 * a layout is not given one. `usePathname()` supplies it, and under
 * `output: 'export'` each route is prerendered separately, so the exported HTML
 * carries that route's real active state rather than a placeholder. The
 * pathname is read once here and passed down, so the controls stay plain.
 *
 * The locale is a prop, not derived from the pathname. The route group already
 * knows it; deriving it again would create a second answer that can disagree
 * with the first.
 *
 * THE PALETTE BUTTON IS DELIBERATELY INERT IN THIS PR. The Svelte original
 * opens the palette from this button (`SiteHeader.svelte:28-30, :52`), but the
 * palette mount is PR 2b's — `PaletteHost` today exposes no opening interface,
 * only a private `useState` its own keydown effect can set. The button is
 * rendered because the chrome must match the baseline on exactly the rows the
 * shell suite asserts, and `onOpenPalette` is the named seam PR 2b fills.
 * Omitting the button instead would diverge from the baseline markup; wiring a
 * substitute action would invent behavior. Both are worse than an inert control
 * with a recorded successor.
 */
export function SiteHeader({
	locale,
	copy,
	sticky = true,
	onOpenPalette,
}: {
	locale: Locale;
	copy: ShellCopy;
	sticky?: boolean;
	/** Supplied by PR 2b's palette mount. Absent here: the button is inert. */
	onOpenPalette?: () => void;
}) {
	const pathname = usePathname();
	const active = activeKey(pathname);

	return (
		<header className={sticky ? 'site-nav site-nav--sticky' : 'site-nav'}>
			<div className="site-nav__in">
				<a className="site-brand" href={homeHref(locale)}>
					<span className="site-brand__dot" aria-hidden="true" />
					brandonwie.dev
				</a>
				<nav className="site-nav__links" aria-label={copy.navigation}>
					{NAV_ITEMS.map((item) => {
						const isActive = item.key === active;
						return (
							<a
								key={item.key}
								href={hrefFor(item, locale)}
								className={isActive ? 'site-nav__link is-active' : 'site-nav__link'}
								aria-current={isActive ? 'page' : undefined}
							>
								~/{copy.nav[item.key]}
							</a>
						);
					})}
					<button type="button" className="site-nav__cmd" onClick={onOpenPalette}>
						<span>{copy.search}</span>
						<kbd aria-hidden="true">⌘K</kbd>
					</button>
					<HeaderControls
						locale={locale}
						pathname={pathname}
						copy={{ switchToEnglish: copy.switchToEnglish, switchToKorean: copy.switchToKorean }}
					/>
				</nav>
			</div>
		</header>
	);
}
