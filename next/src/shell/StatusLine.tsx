'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { AppLink } from '@/components/AppLink';
import type { Locale } from '@/i18n/locale';
import { StatusClock } from './StatusClock';
import {
	EXTRA_WINDOW_INDEX,
	STATUS_WINDOWS,
	normalizePathname,
	statusWindowFor,
	windowHref,
} from './terminal-path';

/**
 * The tmux status line — the site's primary navigation.
 *
 * Every window is a real link with the route's own href, reachable by Tab; the
 * current one carries `aria-current="page"` and the trailing `*`. Off-nav
 * routes append a temporary `5:<name>*` window pointing at the current page
 * (D3). On narrow screens the line scrolls inside itself, never the page, and
 * brings the current window into view on load.
 *
 * `plain` is for the error routes: their prerender sees `/_not-found` while
 * the browser sees the requested URL, so they mark no window and use plain
 * anchors (the 404 is not a place in the site).
 */
export function StatusLine({
	locale,
	label,
	plain = false,
}: {
	locale: Locale;
	/** Accessible name of the nav landmark (`primary_navigation`). */
	label: string;
	plain?: boolean;
}) {
	const pathname = usePathname();
	const scrollerRef = useRef<HTMLElement>(null);
	const state = plain ? { active: null, extra: null } : statusWindowFor(pathname);

	useEffect(() => {
		const scroller = scrollerRef.current;
		const current = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!scroller || !current || scroller.scrollWidth <= scroller.clientWidth) return;
		// scrollIntoView would also scroll the page to the bottom; move only the line.
		const overflowRight = current.offsetLeft + current.offsetWidth - scroller.clientWidth;
		if (overflowRight > 0) scroller.scrollLeft = overflowRight + 16;
	}, [pathname]);

	return (
		<nav className="term-status" aria-label={label} ref={scrollerRef}>
			<span className="term-status__sess" aria-hidden="true">
				[brandonwie]
			</span>
			{STATUS_WINDOWS.map((win) => {
				const on = win.key === state.active;
				const text = `${win.index}:${win.label}`;
				const href = windowHref(win.key, locale);
				const content = (
					<>
						{text}
						{on ? <span aria-hidden="true">*</span> : null}
					</>
				);
				return plain ? (
					<a key={win.key} href={href}>
						{content}
					</a>
				) : (
					<AppLink
						key={win.key}
						href={href}
						className={on ? 'is-on' : undefined}
						aria-current={on ? 'page' : undefined}
					>
						{content}
					</AppLink>
				);
			})}
			{state.extra ? (
				<AppLink href={normalizePathname(pathname)} className="is-on" aria-current="page">
					{`${EXTRA_WINDOW_INDEX}:${state.extra}`}
					<span aria-hidden="true">*</span>
				</AppLink>
			) : null}
			<span className="term-status__right" aria-hidden="true">
				<span>&quot;brandonwie.dev&quot;</span>
				<StatusClock />
			</span>
		</nav>
	);
}
