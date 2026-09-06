import { LanguageToggle } from '@/components/LanguageToggle';
import type { Locale } from '@/i18n/locale';

/**
 * HeaderControls — the shared control cluster, ported from
 * `src/lib/components/HeaderControls.svelte`.
 *
 * Language is the lone control: the theme toggle was removed in the terminal
 * redesign (dark-only), and the Svelte original's docblock says so. The
 * component is kept rather than inlined because it is the single source of
 * truth for the header control row — the seam a second control would land on.
 */
export function HeaderControls({
	locale,
	pathname,
	copy,
}: {
	locale: Locale;
	pathname: string;
	copy: { switchToEnglish: string; switchToKorean: string };
}) {
	return (
		<div className="header-controls">
			<LanguageToggle locale={locale} pathname={pathname} copy={copy} />
		</div>
	);
}
