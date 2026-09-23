'use client';

import { usePathname } from 'next/navigation';

import { AppLink } from '@/components/AppLink';
import { LanguageToggle } from '@/components/LanguageToggle';
import { homeHref, searchHref } from '@/data/nav';
import type { ShellCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import {
	HEADER_LINKS,
	cwdFor,
	headerHref,
	headerLinkFor,
	type HeaderLinkKey,
} from './terminal-path';

function headerLabel(key: HeaderLinkKey, copy: ShellCopy): string {
	switch (key) {
		case 'home':
			return copy.home;
		case 'projects':
			return copy.navProjects;
		case 'tags':
			return copy.navTags;
		case 'contact':
			return copy.navContact;
		default:
			return copy.nav[key];
	}
}

/**
 * The enclosure's title bar: window dots, `brandon@seoul:<cwd>` as brand and
 * breadcrumb (the `~` links home), and the tools — `en / ko` and `⌘K search`;
 * below them the primary navigation landmark, every internal destination in
 * `HEADER_LINKS` order with the current section marked `is-on` +
 * `aria-current="page"`. Pinned (error) routes mark nothing and use plain
 * anchors, for the same prerender/hydration reason as the cwd.
 *
 * The cwd is the real URL path (D2), read with `usePathname()`; under
 * `output: 'export'` each route prerenders with its own. `pinnedCwd` serves
 * the error routes, whose prerender and browser pathnames differ.
 *
 * `⌘K search` opens the palette when a controller supplies `onOpenPalette`.
 * Without one (the error boundary carries no palette code) it is a plain link
 * to the search page rather than an inert button. The `site-nav__cmd` class is
 * the palette's fallback-opener hook (`ShellPalette.getFallbackOpener`).
 */
export function TerminalTitleBar({
	locale,
	copy,
	onOpenPalette,
	pinnedCwd,
	suppressLocaleToggle = false,
}: {
	locale: Locale;
	copy: ShellCopy;
	onOpenPalette?: (event?: React.MouseEvent<HTMLElement>) => void;
	pinnedCwd?: string;
	suppressLocaleToggle?: boolean;
}) {
	const pathname = usePathname();
	const cwd = pinnedCwd ?? cwdFor(pathname);
	const home = homeHref(locale);
	const rest = cwd.slice(1);
	const pinned = pinnedCwd !== undefined;
	const current = pinned ? null : headerLinkFor(pathname);

	const cmdLabel = (
		<>
			<b aria-hidden="true">⌘K</b>
			<span className="term-bar__cmd-label">{copy.search}</span>
		</>
	);

	return (
		<header className="term-bar">
			<div className="term-bar__row">
				<span className="term-bar__dots" aria-hidden="true">
					<i />
					<i />
					<i />
				</span>
				<span className="term-bar__path">
					<span className="term-bar__host">brandon@seoul:</span>
					{pinned ? (
						<a href={home} aria-label={copy.home}>
							~
						</a>
					) : (
						<AppLink href={home} aria-label={copy.home}>
							~
						</AppLink>
					)}
					{rest ? <span className="term-bar__cwd">{rest}</span> : null}
				</span>
				<span className="term-bar__tools">
					<LanguageToggle
						locale={locale}
						pathname={pathname}
						copy={{ switchToEnglish: copy.switchToEnglish, switchToKorean: copy.switchToKorean }}
						suppress={suppressLocaleToggle}
					/>
					{onOpenPalette ? (
						<button type="button" className="term-bar__cmd site-nav__cmd" onClick={onOpenPalette}>
							{cmdLabel}
						</button>
					) : (
						<a className="term-bar__cmd site-nav__cmd" href={searchHref(locale)}>
							{cmdLabel}
						</a>
					)}
				</span>
			</div>
			<nav className="term-bar__nav" aria-label={copy.navigation}>
				{HEADER_LINKS.map((key) => {
					const href = headerHref(key, locale);
					const label = headerLabel(key, copy);
					if (pinned) {
						return (
							<a key={key} href={href}>
								{label}
							</a>
						);
					}
					const on = key === current;
					return (
						<AppLink
							key={key}
							href={href}
							className={on ? 'is-on' : undefined}
							aria-current={on ? 'page' : undefined}
						>
							{label}
						</AppLink>
					);
				})}
			</nav>
		</header>
	);
}
