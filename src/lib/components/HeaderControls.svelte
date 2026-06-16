<script lang="ts">
	/**
	 * HeaderControls — shared control cluster (theme + language).
	 *
	 * Single source of truth so every shell that exposes the language toggle
	 * also exposes the theme toggle, with consistent spacing/order.
	 */
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
</script>

<div class="flex items-center gap-2">
	<ThemeToggle />
	<LanguageToggle />
</div>
