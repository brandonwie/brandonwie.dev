import { hasLocaleVariant, pathForLocale } from '@/data/nav';
import type { Locale } from '@/i18n/locale';

/**
 * LanguageToggle — the title bar's `en / ko` switch, the current locale amber.
 * Originally ported from `src/lib/components/LanguageToggle.svelte`.
 *
 * The Svelte original derives its locale from `page.url.pathname`. Here the
 * pathname arrives as a prop from `TerminalTitleBar`, which reads it once via
 * `usePathname()`, and the locale arrives separately from the route group —
 * the server already knows it, so re-deriving it from the URL would add a
 * second answer to a settled question.
 *
 * ENGLISH-ONLY ROUTES GET NO LINK. `hasLocaleVariant` gates the link
 * (`LanguageToggle.svelte:21`): a route such as `/talks` has no Korean twin, so
 * offering the switch would both mislead the reader and, on the Svelte side,
 * point the SSG crawler at a path that does not exist. Those routes (and the
 * error routes) show the current locale as a plain label instead.
 *
 * NOT A SERVER COMPONENT, despite carrying no `'use client'` directive. It is
 * imported by the client `TerminalTitleBar`, so React compiles it into the
 * client graph. That is legal -- a module without
 * the directive is compiled for whichever graph imports it, and only a
 * `server-only` import or a server API would make it an error -- and it is
 * cheap here, because this file imports nothing but `@/data/nav` and types. The
 * design intent it must not break is that Paraglide stays out of the client
 * bundle: the copy arrives as a prop, already resolved. The locale switch
 * crosses root layouts — `(en)` to `(ko)` — so
 * it must stay a native anchor performing a full document navigation, which
 * `shell/document.tsx:88-89` records as a deliberate decision.
 */
export function LanguageToggle({
	locale,
	pathname,
	copy,
	suppress = false,
}: {
	locale: Locale;
	pathname: string;
	copy: { switchToEnglish: string; switchToKorean: string };
	/**
	 * Error routes pin the toggle off. Their static HTML is rendered with
	 * `/_not-found` (excluded by `hasLocaleVariant`), but the client hydrates
	 * with the real unmatched URL, which passes the check — the server says no
	 * toggle and the client says toggle, which is hydration error #418. The
	 * flag makes both renders agree on the no-toggle output.
	 */
	suppress?: boolean;
}) {
	// No twin to switch to: show the current locale as a plain label (the 404's
	// `en`, a talk's `en`) instead of a link that would lead nowhere.
	if (suppress || !hasLocaleVariant(pathname)) {
		return (
			<span className="language-toggle is-static">
				<span className="is-current">{locale}</span>
			</span>
		);
	}

	const isKorean = locale === 'ko';
	const toggleUrl = pathForLocale(pathname, isKorean ? 'en' : 'ko');

	return (
		<a
			className="language-toggle"
			href={toggleUrl}
			aria-label={isKorean ? copy.switchToEnglish : copy.switchToKorean}
		>
			<span className={isKorean ? undefined : 'is-current'}>en</span>
			<span className="language-toggle__sep"> / </span>
			<span className={isKorean ? 'is-current' : undefined}>ko</span>
		</a>
	);
}
