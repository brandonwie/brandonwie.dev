<script lang="ts">
	/**
	 * Language Toggle Component
	 *
	 * Inline toggle button for EN/KR switching.
	 * Designed to be placed inside headers for proper alignment.
	 *
	 * Uses URL path to detect locale (works with SSG).
	 */
	import { page } from '$app/state';
	import { localeOf, pathForLocale } from '$lib/data/nav';
	import { m } from '$lib/paraglide/messages';

	// Detect locale from URL path (works during SSG)
	const locale = $derived(localeOf(page.url.pathname));
	const isKorean = $derived(locale === 'ko');

	// Get toggle URL based on current path
	const toggleUrl = $derived(pathForLocale(page.url.pathname, isKorean ? 'en' : 'ko'));
</script>

<a
	href={toggleUrl}
	class="shrink-0 rounded-sm border border-line bg-bg px-2 py-1 font-mono text-xs text-muted no-underline transition-all duration-200 hover:border-accent"
	aria-label={isKorean
		? m.language_switch_to_english({}, { locale })
		: m.language_switch_to_korean({}, { locale })}
>
	<span class={!isKorean ? 'text-accent font-semibold' : ''}>EN</span>
	<span class="mx-0.5 opacity-50">/</span>
	<span class={isKorean ? 'text-accent font-semibold' : ''}>KR</span>
</a>
