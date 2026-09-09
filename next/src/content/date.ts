import type { Locale } from '../i18n/locale';

/** Returns updated date if available and different from date, otherwise date */
export function effectiveDate(date: string, updated?: string): string {
	if (!updated) return date;
	return new Date(updated).getTime() !== new Date(date).getTime() ? updated : date;
}

/**
 * Format Korean date as YYYY.MM.DD, matching SvelteKit's formatKoreanDate
 * but evaluated in UTC so build machines in any timezone produce identical bytes.
 */
export function formatKoreanDate(dateStr: string): string {
	const d = new Date(dateStr);
	const y = d.getUTCFullYear();
	const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}.${mo}.${day}`;
}

/**
 * Format date for post cards and list pages (short month: "Sep 3, 2026" / "2026.09.03").
 * Evaluated with UTC timezone for cross-platform deterministic builds.
 */
export function formatDateShort(dateStr: string, locale: Locale): string {
	if (locale === 'ko') return formatKoreanDate(dateStr);
	return new Date(dateStr).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	});
}
