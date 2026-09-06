import { hasLocaleVariant, pathForLocale } from '@/data/nav';
import type { Locale } from '@/i18n/locale';

/**
 * LanguageToggle — inline EN/KR switch, ported from
 * `src/lib/components/LanguageToggle.svelte`.
 *
 * The Svelte original derives its locale from `page.url.pathname`. Here the
 * pathname arrives as a prop from `SiteHeader`, which reads it once via
 * `usePathname()`, and the locale arrives separately from the route group —
 * the server already knows it, so re-deriving it from the URL would add a
 * second answer to a settled question.
 *
 * ENGLISH-ONLY ROUTES RENDER NOTHING. `hasLocaleVariant` gates the link
 * (`LanguageToggle.svelte:21`): a route such as `/talks` has no Korean twin, so
 * offering the switch would both mislead the reader and, on the Svelte side,
 * point the SSG crawler at a path that does not exist. The Next candidate has
 * no crawler, but the reader-facing half of that reason is unchanged.
 *
 * This stays a server component: it renders a plain anchor and reads no
 * browser API. The locale switch crosses root layouts — `(en)` to `(ko)` — so
 * it must stay a native anchor performing a full document navigation, which
 * `shell/document.tsx:88-89` records as a deliberate decision.
 */
export function LanguageToggle({
	locale,
	pathname,
	copy,
}: {
	locale: Locale;
	pathname: string;
	copy: { switchToEnglish: string; switchToKorean: string };
}) {
	if (!hasLocaleVariant(pathname)) return null;

	const isKorean = locale === 'ko';
	const toggleUrl = pathForLocale(pathname, isKorean ? 'en' : 'ko');

	return (
		<a
			className="language-toggle"
			href={toggleUrl}
			aria-label={isKorean ? copy.switchToEnglish : copy.switchToKorean}
		>
			<span className={isKorean ? undefined : 'is-current'}>EN</span>
			<span className="language-toggle__sep">/</span>
			<span className={isKorean ? 'is-current' : undefined}>KR</span>
		</a>
	);
}
