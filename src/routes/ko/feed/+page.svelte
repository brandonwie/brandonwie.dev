<script lang="ts">
	import type { PageData } from './$types';
	import SocialFeedPage from '$lib/components/SocialFeedPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<SocialFeedPage campaigns={data.campaigns} />
