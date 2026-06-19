<script lang="ts">
	import StudyHeader from '$lib/components/study/StudyHeader.svelte';
	import type { StudyLocale, StudyNavLabels } from '$lib/data/study';
	import type { Snippet } from 'svelte';

	let {
		locale = 'en',
		nav,
		active = 'study',
		children,
	}: {
		locale?: StudyLocale;
		nav: StudyNavLabels;
		active?: 'study' | 'about' | 'posts' | 'system';
		children: Snippet;
	} = $props();
</script>

<div class="min-h-screen bg-bg">
	<StudyHeader {locale} {nav} {active} />

	<main id="main-content" data-pagefind-body class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
		{@render children()}
	</main>
</div>
