<!--
  /ko/tags/+page.svelte — Korean Tags index (URL: /ko/tags)

  Thin wrapper sharing TagsPage with the EN route. The root +layout load returns
  Korean post metadata for /ko/*, so this index is a real KO-locale tag list
  (tag names stay English per the category convention); no fallback needed.
-->
<script lang="ts">
	import type { PageData } from './$types';
	import TagsPage from '$lib/components/TagsPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<TagsPage locale="ko" posts={data.posts} />
