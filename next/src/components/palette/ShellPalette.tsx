'use client';

/**
 * ShellPalette — the client controller that owns the palette for a whole
 * locale subtree, and the only place the header button and the palette host
 * meet.
 *
 * WHY A CONTROLLER AND NOT A MOUNT INSIDE `SiteShell`. `global-error.tsx` is
 * `'use client'` and renders `SiteShell`, so anything mounted unconditionally
 * inside the shell compiles into the error route's client graph — a
 * conditional render would not help, because the static import stays in that
 * route's module graph either way. The shell exposes a `header` slot instead;
 * the two locale layouts fill it with this component, and the error routes
 * keep the plain header with no palette code at all.
 *
 * WHY THE CHORD LIVES HERE. One piece of state gets one owner. The header
 * button and the Cmd/Ctrl+K chord are two ways to open the same palette, so
 * both are handled where `open` lives, and `PaletteHost` is left
 * presentational. The chord DECISIONS remain in `@/palette/shortcuts`, where
 * they are asserted without a DOM.
 *
 * WHY `useRouter().push` FOR INTRA-LOCALE AND `location.assign` FOR CROSS-ROOT.
 * In PR 2d, the palette adopts the client router for intra-locale targets,
 * matching AppLink. Cross-root navigations (crossing (en) and (ko)) cross Next.js
 * root layout route groups and must perform a full document navigation via
 * `location.assign`, as do external URLs.
 *
 * READINESS IS ATTACHMENT, NOT RENDER. `data-palette-ready` is set in the same
 * effect that registers the listener and cleared in that effect's cleanup, so
 * a browser probe that waits on the marker is waiting on a palette that can
 * actually answer a chord.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import PaletteHost from '@/components/palette/PaletteHost';
import { SiteHeader } from '@/components/SiteHeader';
import type { ShellCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { isKorean, type PalettePost } from '@/palette/items';
import { planGlobalChord } from '@/palette/shortcuts';

/** The marker a browser probe waits on. Set with the listener, cleared with it. */
export const PALETTE_READY_ATTRIBUTE = 'data-palette-ready';

/** Resolves the header palette button as the fallback opener when chording from BODY. */
export function getFallbackOpener(): HTMLElement | null {
	return typeof document !== 'undefined'
		? document.querySelector<HTMLElement>('.site-nav__cmd')
		: null;
}

/** Resolves the opener: a usable focused control, or fallback to the header palette button. */
export function resolveOpener(candidate?: HTMLElement | null): HTMLElement | null {
	if (typeof document === 'undefined') return null;
	if (candidate && candidate !== document.body && candidate !== document.documentElement) {
		return candidate;
	}
	return getFallbackOpener();
}

export default function ShellPalette({
	locale,
	copy,
	posts,
}: {
	locale: Locale;
	copy: ShellCopy;
	posts: PalettePost[];
}) {
	const pathname = usePathname();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [opener, setOpener] = useState<HTMLElement | null>(null);

	// Client navigation via router.push for intra-locale targets, matching AppLink.
	// Cross-root navigations (crossing (en) and (ko)) or external URLs use
	// window.location.assign.
	const navigate = useCallback(
		(href: string) => {
			if (/^(https?:)?\/\//.test(href) || isKorean(pathname) !== isKorean(href)) {
				window.location.assign(href);
			} else {
				router.push(href);
			}
		},
		[pathname, router],
	);

	const handleOpen = useCallback((event?: React.MouseEvent<HTMLElement>) => {
		const element = (event?.currentTarget as HTMLElement | null) ?? null;
		setOpener(resolveOpener(element ?? (document.activeElement as HTMLElement | null)));
		setOpen(true);
	}, []);

	const handleClose = useCallback(() => {
		setOpener(null);
		setOpen(false);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const plan = planGlobalChord(event, {
				pathname,
				targetTag: target?.tagName ?? '',
				targetEditable: Boolean(target?.isContentEditable),
			});

			if (plan.kind === 'ignore') return;
			// Cmd+P prints and Cmd+F opens the browser find bar otherwise.
			event.preventDefault();
			if (plan.kind === 'open-palette') {
				const active = document.activeElement as HTMLElement | null;
				setOpener(resolveOpener(active));
				setOpen(true);
			} else {
				navigate(plan.href);
			}
		};

		window.addEventListener('keydown', onKeyDown);
		document.body.setAttribute(PALETTE_READY_ATTRIBUTE, 'true');
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			document.body.removeAttribute(PALETTE_READY_ATTRIBUTE);
		};
	}, [navigate, pathname]);

	return (
		<>
			<SiteHeader locale={locale} copy={copy} onOpenPalette={handleOpen} />
			<PaletteHost
				posts={posts}
				pathname={pathname}
				locale={locale}
				navigate={navigate}
				open={open}
				onClose={handleClose}
				opener={opener}
			/>
		</>
	);
}
