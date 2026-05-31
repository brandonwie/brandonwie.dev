<script lang="ts">
	import type { PageData } from './$types';
	import System3bPage from '$lib/components/System3bPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<System3bPage locale="ko" snapshot={data.snapshot} />
