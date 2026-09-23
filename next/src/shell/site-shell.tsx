import type { ReactNode } from 'react';

import { shellCopy } from '@/i18n/copy';
import type { Locale } from './document';
import { ShellPrompt } from './ShellPrompt';
import { StatusLine } from './StatusLine';
import { TerminalFooter } from './TerminalFooter';
import { TerminalTitleBar } from './TerminalTitleBar';

/**
 * SiteShell — the Phosphor Fade terminal every page lives in: skip link, one
 * full-bleed CRT enclosure (the page edges are its bezel), the title bar with
 * the primary navigation, the page body (`main`), the `~/.plan` footer, an idle
 * prompt, and the tmux status line.
 *
 * The copy is resolved ONCE here and passed down, so the client pieces (title
 * bar, status line) never pull the Paraglide message modules into the client
 * bundle for strings the server already knows.
 *
 * THE TITLE BAR IS A SLOT, and that is what keeps the palette off the error
 * boundary. `global-error.tsx` is `'use client'`, so anything mounted
 * unconditionally here compiles into its client graph — a truthiness check
 * would not help, because the static import stays in that route's module
 * graph. The locale layouts pass `ShellPalette` (client) as `header`, which
 * renders the title bar with a working `⌘K` plus the palette host; without it
 * the plain title bar's `⌘K` is a link to the search page.
 *
 * `errorRoute` pins the cwd to `~`, marks no status window and shows a plain
 * locale label. The error routes prerender as `/_not-found` while the browser
 * hydrates with the requested URL, so anything derived from the pathname would
 * disagree between the two renders (hydration error #418).
 */
export function SiteShell({
	locale,
	header,
	errorRoute = false,
	children,
}: {
	locale: Locale;
	header?: ReactNode;
	errorRoute?: boolean;
	children: ReactNode;
}) {
	const copy = shellCopy(locale);
	const pinnedCwd = errorRoute ? '~' : undefined;

	return (
		<div className="site-shell term-page">
			<a className="skip-link" href="#main-content">
				{copy.skip}
			</a>
			<div className="term-crt">
				<div className="term-glass">
					<span className="term-ghost" aria-hidden="true">
						3B
					</span>
					{header ?? (
						<TerminalTitleBar
							locale={locale}
							copy={copy}
							pinnedCwd={pinnedCwd}
							suppressLocaleToggle={errorRoute}
						/>
					)}
					<div className="term-body">
						<main id="main-content" className="term-main" tabIndex={-1}>
							{children}
						</main>
						<TerminalFooter locale={locale} copy={copy} />
						<ShellPrompt pinnedCwd={pinnedCwd} />
					</div>
					<StatusLine locale={locale} plain={errorRoute} />
				</div>
			</div>
		</div>
	);
}
