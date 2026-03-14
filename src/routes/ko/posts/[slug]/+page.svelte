<script lang="ts">
	import type { PageData } from './$types';
	import PostDetail from '$lib/components/PostDetail.svelte';

	let { data }: { data: PageData } = $props();
</script>

<PostDetail
	meta={data.meta}
	content={data.content}
	locale="ko"
	isFallback={data.isFallback}
	headings={data.headings}
/>
