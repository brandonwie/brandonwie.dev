<script lang="ts">
	import type { BinarySearchVisualizerCopy } from '$lib/data/study';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	let { copy }: { copy: BinarySearchVisualizerCopy } = $props();

	const values = [2, 5, 8, 13, 19, 21, 34];
	const target = 19;

	let step = $state(0);
	let reduceMotion = $state(false);
	const current = $derived(copy.frames[step]);
	type CellState = keyof BinarySearchVisualizerCopy['stateLabels'];

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	function previous() {
		step = Math.max(0, step - 1);
	}

	function next() {
		step = Math.min(copy.frames.length - 1, step + 1);
	}

	function reset() {
		step = 0;
	}

	function cellState(index: number, value: number): CellState {
		if (index === current.mid && value === target) return 'found';
		if (index === current.mid) return 'mid';
		if (index === current.low) return 'low';
		if (index === current.high) return 'high';
		if (index >= current.low && index <= current.high) return 'window';
		return 'eliminated';
	}

	function cellClass(state: CellState): string {
		if (state === 'found') return 'border-accent bg-highlight-med text-accent';
		if (state === 'mid') return 'border-gold border-dashed text-gold';
		if (state === 'low' || state === 'high') return 'border-foam text-foam';
		if (state === 'window') return 'border-line bg-bg text-muted';
		return 'border-line opacity-35 text-faint';
	}
</script>

<article class="min-w-0 border border-line bg-surface p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">
				{copy.targetLabel}: {target}. {current.note}
			</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{copy.frames.length}</span>
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

	<div class="mt-5 overflow-x-auto">
		<div class="grid min-w-[26rem] grid-cols-7 gap-2">
			{#each values as value, index (value)}
				{@const state = cellState(index, value)}
				<div
					in:fade={{ duration: reduceMotion ? 0 : 120 }}
					class={`border p-2 text-center font-mono text-sm transition-all duration-200 motion-reduce:transition-none ${cellClass(state)}`}
				>
					<span class="block text-[10px] text-faint">{index}</span>
					<span class="block text-[10px] uppercase">{copy.stateLabels[state]}</span>
					<span>{value}</span>
				</div>
			{/each}
		</div>
	</div>

	<div class="mt-5 grid gap-2">
		{#each copy.frames.slice(0, step + 1) as frame, index (`${frame.low}-${frame.mid}-${frame.high}`)}
			<p class="border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
				{index + 1}. {copy.traceLabels.low}
				{frame.low}, {copy.traceLabels.mid}
				{frame.mid},
				{copy.traceLabels.high}
				{frame.high}: {frame.note}
			</p>
		{/each}
	</div>
</article>
