<script lang="ts">
	/**
	 * StudyPageShell — shared `<main>` wrapper for the study pages.
	 *
	 * The header now lives once in the root layout (`SiteHeader`), so this shell
	 * only owns the study content column. It no longer renders or configures any
	 * navigation.
	 */
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="min-h-screen bg-bg">
	<main id="main-content" data-pagefind-body class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
		{@render children()}
	</main>
</div>
