<script lang="ts">
	/**
	 * Language Toggle Component
	 *
	 * Fixed-position toggle button in top-right corner.
	 * Switches between English (EN) and Korean (KR).
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
	class="fixed top-4 right-4 z-50 font-mono text-sm px-3 py-2 bg-terminal-bg-secondary border border-terminal-border rounded text-terminal-text-muted no-underline transition-all duration-200 hover:border-terminal-accent-orange"
	aria-label={isKorean ? 'Switch to English' : '한국어로 전환'}
>
	<span class={!isKorean ? 'text-terminal-accent-orange font-semibold' : ''}>EN</span>
	<span class="mx-1 opacity-50">/</span>
	<span class={isKorean ? 'text-terminal-accent-orange font-semibold' : ''}>KR</span>
</a>
