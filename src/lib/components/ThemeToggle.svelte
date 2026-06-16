<script lang="ts">
	/**
	 * Theme Toggle Component
	 *
	 * Inline sun/moon button for dark/light switching. Mirrors LanguageToggle's
	 * shape so the two sit together in HeaderControls. Dark is the default.
	 */
	import { onMount } from 'svelte';
	import { theme, toggleTheme, initTheme } from '$lib/stores/theme';

	// The no-FOUC script set <html data-theme> before paint; re-sync the store
	// on mount so the icon reflects the real persisted theme after hydration.
	onMount(initTheme);

	const isDark = $derived($theme === 'dark');
</script>

<button
	type="button"
	onclick={toggleTheme}
	class="font-mono text-xs px-2 py-1 bg-terminal-bg-primary border border-terminal-border rounded-sm text-terminal-text-muted transition-all duration-200 hover:border-terminal-accent-orange shrink-0 inline-flex items-center"
	aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
	title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
>
	{#if isDark}
		<!-- Sun: click to go light -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" />
			<path d="M12 20v2" />
			<path d="m4.93 4.93 1.41 1.41" />
			<path d="m17.66 17.66 1.41 1.41" />
			<path d="M2 12h2" />
			<path d="M20 12h2" />
			<path d="m6.34 17.66-1.41 1.41" />
			<path d="m19.07 4.93-1.41 1.41" />
		</svg>
	{:else}
		<!-- Moon: click to go dark -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</svg>
	{/if}
</button>
