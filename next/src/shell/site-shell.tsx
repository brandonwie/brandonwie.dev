import type { ReactNode } from 'react';

import { Footer } from '@/components/Footer';
import { SiteHeader } from '@/components/SiteHeader';
import { shellCopy } from '@/i18n/copy';
import type { Locale } from './document';

/**
 * SiteShell — skip link, global header, main landmark, global footer.
 *
 * Replaces the 38-line Slice 1 placeholder, whose two-link nav and one-line
 * footer existed only until the real chrome was ported. `SiteHeader` and
 * `Footer` now come from `@/components`, driven by `@/data/nav`.
 *
 * The copy is resolved ONCE here and passed down. Both children would otherwise
 * call `shellCopy(locale)` themselves, and `SiteHeader` is a client component —
 * resolving there would pull the Paraglide message modules into the client
 * bundle for strings the server already knows.
 *
 * `global-error.tsx` and `global-not-found.tsx` also render this shell. They
 * inherit the real chrome from this change and are otherwise untouched; those
 * routes belong to a later PR.
 *
 * THE HEADER IS A SLOT, and that is what keeps the palette off the error
 * routes. `global-error.tsx` is `'use client'`, so anything mounted
 * unconditionally here compiles into its client graph — a truthiness check
 * would not help, because the static import stays in that route's module
 * graph. The locale layouts pass `ShellPalette` (client) as `header`; the
 * error routes pass nothing and get the plain header below, with no palette
 * code in their bundle and no behavior to infer from a call site.
 */
export function SiteShell({
	locale,
	header,
	children,
}: {
	locale: Locale;
	header?: ReactNode;
	children: ReactNode;
}) {
	const copy = shellCopy(locale);

	return (
		<div className="site-shell">
			<a className="skip-link" href="#main-content">
				{copy.skip}
			</a>
			{header ?? <SiteHeader locale={locale} copy={copy} />}
			<main id="main-content" className="page-frame" tabIndex={-1}>
				{children}
			</main>
			<Footer locale={locale} copy={copy} />
		</div>
	);
}
