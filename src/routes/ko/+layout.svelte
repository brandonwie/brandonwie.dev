<script lang="ts">
	/**
	 * Korean Layout - Sets the locale context for Korean routes
	 *
	 * This layout wraps all /ko/* routes and ensures the correct
	 * locale is set for Paraglide message functions.
	 */
	import { setLocale } from '$lib/paraglide/runtime';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Set Korean locale on mount (client-side)
	onMount(() => {
		setLocale('ko', { reload: false });
	});
</script>

{@render children()}
