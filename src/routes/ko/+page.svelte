<script lang="ts">
	/**
	 * Korean Home Page (/ko)
	 *
	 * Same as English home but with Korean locale active.
	 * Terminal component will display Korean translations.
	 */
	import { goto } from '$app/navigation';
	import Terminal from '$lib/components/terminal/Terminal.svelte';
	import { posts } from '$lib/stores/posts';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	// PAGE DATA FROM +page.ts
	let { data } = $props();

	// Populate posts store with Korean posts
	onMount(() => {
		posts.set(data.posts);
	});

	function handleNavigateToPost(slug: string) {
		goto(`/ko/posts/${slug}`);
	}
</script>

<svelte:head>
	<title>{m.site_title()}</title>
</svelte:head>

<Terminal onNavigateToPost={handleNavigateToPost} />
