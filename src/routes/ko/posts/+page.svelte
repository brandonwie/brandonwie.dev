<!--
  /ko/posts/+page.svelte - Korean Posts List Page (URL: /ko/posts)

  Thin wrapper: shares PostsListPage with the EN /posts route; basePath="/ko"
  drives Korean hrefs, canonical, and locale.
-->
<script lang="ts">
	import type { PageData } from './$types';
	import PostsListPage from '$lib/components/PostsListPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<PostsListPage posts={data.posts} basePath="/ko" />
