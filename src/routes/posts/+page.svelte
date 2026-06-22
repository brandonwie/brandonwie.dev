<!--
  /posts/+page.svelte - Posts List Page (URL: /posts)

  Thin wrapper: all markup lives in the shared PostsListPage component, which
  also drives /ko/posts via the basePath prop.
-->
<script lang="ts">
	import type { PageData } from './$types';
	import PostsListPage from '$lib/components/PostsListPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<PostsListPage posts={data.posts} basePath="/" />
