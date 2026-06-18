<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let scrollY = $state(0);
	let progress = $derived.by(() => {
		if (typeof document === 'undefined') return 0;
		const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
		return docHeight > 0 ? Math.min((scrollY / docHeight) * 100, 100) : 0;
	});
</script>

<svelte:window bind:scrollY />

<div
	class="fixed top-0 left-0 z-50 h-0.5 bg-terminal-accent-orange transition-[width] duration-100 ease-out"
	style="width: {progress}%"
	role="progressbar"
	aria-label={m.reading_progress()}
	aria-valuenow={Math.round(progress)}
	aria-valuemin={0}
	aria-valuemax={100}
></div>
