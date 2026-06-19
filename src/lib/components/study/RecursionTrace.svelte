<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { RecursionTraceCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { fly, scale } from 'svelte/transition';

	let { copy }: { copy: RecursionTraceCopy } = $props();

	let step = $state(0);
	const motion = useReducedMotion();
	const current = $derived(copy.steps[step]);
</script>

<article class="study-card min-w-0 p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{current.note}</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{copy.steps.length}</span>
	</div>

	<Stepper length={copy.steps.length} bind:step labels={copy} />

	<div class="mt-5 grid gap-2">
		{#each current.frames as frame, index (frame)}
			<div
				in:fly={{ y: -10, duration: motion.current ? 0 : 180 }}
				out:scale={{ duration: motion.current ? 0 : 120 }}
				class={`border px-3 py-2 font-mono text-sm ${
					current.mode === 'unwind' || current.mode === 'done'
						? 'border-gold border-dashed text-gold'
						: current.mode === 'base' && index === current.frames.length - 1
							? 'border-accent bg-highlight-med text-accent'
							: 'border-line text-muted'
				}`}
			>
				<span class="mr-2 text-[10px] uppercase text-faint">
					{current.mode === 'unwind' || current.mode === 'done'
						? copy.frameLabels.return
						: copy.frameLabels.call}
				</span>
				{frame}
			</div>
		{/each}
	</div>
</article>
