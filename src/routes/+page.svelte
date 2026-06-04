<script lang="ts">
	import BlogHome from '$lib/components/BlogHome.svelte';

	let { data } = $props();

	// The posts store is hydrated globally in +layout.ts/+layout.svelte (ARCH-1),
	// so the home page no longer needs to populate it on mount.
</script>

<svelte:head>
	<title>Brandon Wie | Software Engineer</title>
</svelte:head>

<BlogHome posts={data.posts} />
