import { postsHref } from '@/data/nav';
import type { Locale } from '@/i18n/locale';

/**
 * BackToPosts — deterministic, locale-aware "back to the posts list" link.
 *
 * Ported from `src/lib/components/BackToPosts.svelte`.
 */
export function BackToPosts({
	locale = 'en',
	label = 'Back to posts',
}: {
	locale?: Locale;
	label?: string;
}) {
	return (
		<a
			href={postsHref(locale)}
			className="inline-flex items-center gap-1 text-sm text-muted no-underline transition-colors hover:text-accent"
		>
			<span aria-hidden="true">←</span>
			<span>{label}</span>
		</a>
	);
}
