<script lang="ts">
	import type { RecursionTraceCopy } from '$lib/data/study';
	import { onMount } from 'svelte';
	import { fly, scale } from 'svelte/transition';

	let { copy }: { copy: RecursionTraceCopy } = $props();

	let step = $state(0);
	let reduceMotion = $state(false);
	const current = $derived(copy.steps[step]);

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	function previous() {
		step = Math.max(0, step - 1);
	}

	function next() {
		step = Math.min(copy.steps.length - 1, step + 1);
	}

	function reset() {
		step = 0;
	}
</script>

<article class="min-w-0 border border-line bg-surface p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{current.note}</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{copy.steps.length}</span>
	</div>

	<div class="mt-4 flex gap-2">
		<button
			class="border border-line bg-bg px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
			type="button"
			onclick={previous}
			aria-label={copy.previousAriaLabel}
		>
			← {copy.previousLabel}
		</button>
		<button
			class="border border-line bg-bg px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
			type="button"
			onclick={next}
			aria-label={copy.nextAriaLabel}
		>
			{copy.nextLabel} →
		</button>
		<button
			class="border border-line bg-bg px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
			type="button"
			onclick={reset}
			aria-label={copy.resetAriaLabel}
		>
			↺ {copy.resetLabel}
		</button>
	</div>

	<div class="mt-5 grid gap-2">
		{#each current.frames as frame, index (frame)}
			<div
				in:fly={{ y: -10, duration: reduceMotion ? 0 : 180 }}
				out:scale={{ duration: reduceMotion ? 0 : 120 }}
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
