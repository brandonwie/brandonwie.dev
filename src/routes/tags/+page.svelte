<!--
  /tags/+page.svelte — Tags index (URL: /tags)

  Thin wrapper: TagsPage derives everything from the locale-aware posts list the
  root +layout load already provides. basePath/locale drive EN hrefs + canonical.
-->
<script lang="ts">
	import type { PageData } from './$types';
	import TagsPage from '$lib/components/TagsPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<TagsPage locale="en" posts={data.posts} />
