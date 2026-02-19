<script lang="ts">
	import { goto } from '$app/navigation';
	import Terminal from '$lib/components/terminal/Terminal.svelte';
	import BlogHome from '$lib/components/BlogHome.svelte';
	import { posts } from '$lib/stores/posts';
	import { viewMode } from '$lib/stores/viewMode';
	import { onMount } from 'svelte';

	let { data } = $props();

	onMount(() => {
		posts.set(data.posts);
	});

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
