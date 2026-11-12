import { hasLocaleVariant, pathForLocale } from '@/data/nav';
import type { Locale } from '@/i18n/locale';

/**
 * The header's `EN / KO` switch. A route with no twin in the other locale (a
 * talk, an error page) shows the current locale as a plain label.
 *
 * The switch crosses root layouts, `(en)` to `(ko)`, so it is a native anchor
 * that loads a full document.
 *
 * @param suppress - error routes prerender as `/_not-found` and hydrate with the
 *   real URL; pinning the label keeps both renders identical
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
	suppress?: boolean;
}) {
	if (suppress || !hasLocaleVariant(pathname)) {
		return (
			<span className="site-tool language-toggle">
				<span className="is-current">{locale.toUpperCase()}</span>
			</span>
		);
	}

	const isKorean = locale === 'ko';

	return (
		<a
			className="site-tool language-toggle"
			href={pathForLocale(pathname, isKorean ? 'en' : 'ko')}
			hrefLang={isKorean ? 'en' : 'ko'}
			aria-label={isKorean ? copy.switchToEnglish : copy.switchToKorean}
			data-hotkey="l"
		>
			<span className="hotkey" aria-hidden="true">
				[L]
			</span>
			<span className={isKorean ? undefined : 'is-current'}>EN</span>
			<span aria-hidden="true">/</span>
			<span className={isKorean ? 'is-current' : undefined}>KO</span>
		</a>
	);
}
