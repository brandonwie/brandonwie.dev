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

	// Detect locale from URL path (works during SSG)
	const isKorean = $derived(page.url.pathname.startsWith('/ko'));

	// Get toggle URL based on current path
	const toggleUrl = $derived.by(() => {
		const path = page.url.pathname;
		if (isKorean) {
			// /ko/posts/slug → /posts/slug
			return path.replace(/^\/ko/, '') || '/';
		} else {
			// /posts/slug → /ko/posts/slug
			return '/ko' + path;
		}
	});
</script>

<a
	href={toggleUrl}
	class="font-mono text-xs px-2 py-1 bg-terminal-bg-primary border border-terminal-border rounded text-terminal-text-muted no-underline transition-all duration-200 hover:border-terminal-accent-orange shrink-0"
	aria-label={isKorean ? 'Switch to English' : '한국어로 전환'}
>
	<span class={!isKorean ? 'text-terminal-accent-orange font-semibold' : ''}>EN</span>
	<span class="mx-0.5 opacity-50">/</span>
	<span class={isKorean ? 'text-terminal-accent-orange font-semibold' : ''}>KR</span>
</a>
