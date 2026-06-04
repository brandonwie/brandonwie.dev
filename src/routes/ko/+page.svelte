<script lang="ts">
	import BlogHome from '$lib/components/BlogHome.svelte';
	import { posts } from '$lib/stores/posts';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let { data } = $props();

	onMount(() => {
		posts.set(data.posts);
	});
</script>

<svelte:head>
	<title>{m.site_title()}</title>
</svelte:head>

<BlogHome posts={data.posts} basePath="/ko" />
