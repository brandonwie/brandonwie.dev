<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { IterativeSortCopy } from '$lib/data/study';

	let { copy }: { copy: IterativeSortCopy } = $props();

	let step = $state(0);

	type CellState = 'sorted' | 'swap' | 'compare' | 'idle';

	interface SortFrame {
		values: number[];
		compare: [number, number] | null;
		swapped: boolean;
		sorted: number[];
	}

	// Worked example: bubble sort [5,1,4,2,8] with the last-swap optimisation.
	const frames: SortFrame[] = [
		{ values: [5, 1, 4, 2, 8], compare: null, swapped: false, sorted: [] },
		{ values: [1, 5, 4, 2, 8], compare: [0, 1], swapped: true, sorted: [] },
		{ values: [1, 4, 5, 2, 8], compare: [1, 2], swapped: true, sorted: [] },
		{ values: [1, 4, 2, 5, 8], compare: [2, 3], swapped: true, sorted: [] },
		{ values: [1, 4, 2, 5, 8], compare: [3, 4], swapped: false, sorted: [4] },
		{ values: [1, 2, 4, 5, 8], compare: [1, 2], swapped: true, sorted: [4] },
		{ values: [1, 2, 4, 5, 8], compare: [2, 3], swapped: false, sorted: [3, 4] },
		{ values: [1, 2, 4, 5, 8], compare: null, swapped: false, sorted: [0, 1, 2, 3, 4] },
	];

	const frame = $derived(frames[step]);

	const CELL = 46;
	const GAP = 10;

	function cellState(index: number): CellState {
		if (frame.sorted.includes(index)) return 'sorted';
		if (frame.compare && (index === frame.compare[0] || index === frame.compare[1])) {
			return frame.swapped ? 'swap' : 'compare';
		}
		return 'idle';
	}

	function cellClass(state: CellState): string {
		if (state === 'sorted') return 'fill-highlight-med stroke-foam';
		if (state === 'swap') return 'fill-highlight-med stroke-accent';
		if (state === 'compare') return 'fill-bg stroke-foam';
		return 'fill-bg stroke-line';
	}

	function textClass(state: CellState): string {
		if (state === 'sorted' || state === 'compare') return 'fill-foam';
		if (state === 'swap') return 'fill-accent';
		return 'fill-muted';
	}
</script>

<article class="study-card min-w-0 p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{frames.length}</span>
	</div>

	<Stepper length={frames.length} bind:step labels={copy} />

	<div class="mt-5 overflow-x-auto">
		<svg viewBox="0 0 272 72" class="min-w-[17rem] max-w-full" role="img" aria-label={copy.title}>
			{#each frame.values as value, index (index)}
				{@const state = cellState(index)}
				{@const x = index * (CELL + GAP)}
				<g>
					<rect
						{x}
						y="13"
						width={CELL}
						height={CELL}
						rx="6"
						stroke-width="1.5"
						class={`transition-colors duration-200 motion-reduce:transition-none ${cellClass(state)}`}
					/>
					<text
						x={x + CELL / 2}
						y="42"
						text-anchor="middle"
						class={`font-mono text-[16px] ${textClass(state)}`}
					>
						{value}
					</text>
				</g>
			{/each}
		</svg>
	</div>

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step] ?? ''}
	</p>
</article>
