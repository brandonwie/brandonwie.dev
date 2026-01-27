<script lang="ts">
	/**
	 * Giscus Comments Component
	 *
	 * WHAT: Embeds GitHub Discussions-based comments using giscus.
	 * WHY: Provides commenting without a database - comments stored in GitHub Discussions.
	 * HOW: Dynamically loads giscus script with post slug as the discussion term.
	 *
	 * DESIGN DECISION: Uses slug (not pathname) for discussion mapping so that
	 * /posts/my-post and /ko/posts/my-post share the same comment thread.
	 *
	 * REFERENCE: https://giscus.app
	 */
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		slug: string;
		lang?: 'en' | 'ko';
	}

	let { slug, lang = 'en' }: Props = $props();
	let containerRef: HTMLDivElement;

	onMount(() => {
		const script = document.createElement('script');
		script.src = 'https://giscus.app/client.js';
		script.async = true;
		script.crossOrigin = 'anonymous';

		// Configuration from giscus.app
		script.dataset.repo = 'brandonwie/brandonwie.dev';
		script.dataset.repoId = 'R_kgDORBkERA';
		script.dataset.category = 'Blog Comments';
		script.dataset.categoryId = 'DIC_kwDORBkERM4C1gHN';
		script.dataset.mapping = 'specific';
		script.dataset.term = slug; // Shared between EN/KO versions
		script.dataset.strict = '0';
		script.dataset.reactionsEnabled = '1';
		script.dataset.emitMetadata = '0';
		script.dataset.inputPosition = 'top';
		script.dataset.theme = 'dark_dimmed';
		script.dataset.lang = lang;
		script.dataset.loading = 'lazy';

		containerRef.appendChild(script);
	});
</script>

<section class="mt-16 border-t border-terminal-border pt-12">
	<h2 class="mb-8 text-xl font-semibold text-terminal-text-primary">
		{m.comments_title()}
	</h2>
	<div bind:this={containerRef} class="giscus-container"></div>
</section>
