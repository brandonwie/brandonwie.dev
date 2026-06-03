<script lang="ts">
	import { goto } from '$app/navigation';
	import Terminal from '$lib/components/terminal/Terminal.svelte';
	import BlogHome from '$lib/components/BlogHome.svelte';
	import { viewMode } from '$lib/stores/viewMode';

	let { data } = $props();

	// The posts store is hydrated globally in +layout.ts/+layout.svelte (ARCH-1),
	// so the home page no longer needs to populate it on mount.

	function handleNavigateToPost(slug: string) {
		goto(`/posts/${slug}`);
	}
</script>

<svelte:head>
	<title>Brandon Wie | Software Engineer</title>
</svelte:head>

{#if $viewMode === 'terminal'}
	<Terminal onNavigateToPost={handleNavigateToPost} />
{:else}
	<BlogHome posts={data.posts} />
{/if}
