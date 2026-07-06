<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { DivideConquerSortCopy } from '$lib/data/study';

	let { copy }: { copy: DivideConquerSortCopy } = $props();

	let step = $state(0);

	type Mode = 'start' | 'split' | 'merge' | 'sorted';

	interface DcFrame {
		groups: number[][];
		mode: Mode;
	}

	// Worked example: merge sort [5,1,4,2] — split down to singletons, merge up.
	const frames: DcFrame[] = [
		{ groups: [[5, 1, 4, 2]], mode: 'start' },
		{
			groups: [
				[5, 1],
				[4, 2],
			],
			mode: 'split',
		},
		{ groups: [[5], [1], [4], [2]], mode: 'split' },
		{
			groups: [
				[1, 5],
				[2, 4],
			],
			mode: 'merge',
		},
		{ groups: [[1, 2, 4, 5]], mode: 'sorted' },
	];

	const frame = $derived(frames[step]);

	const CELL = 40;
	const GAP = 6;
	const GROUP_GAP = 24;
	const VIEW_W = 320;

	interface PlacedCell {
		key: string;
		value: number;
		x: number;
	}

	// Lay groups left-to-right, then centre the whole row in the viewBox.
	const layout = $derived.by(() => {
		const cells: PlacedCell[] = [];
		let cursor = 0;
		frame.groups.forEach((group, gi) => {
			if (gi > 0) cursor += GROUP_GAP;
			group.forEach((value, ci) => {
				if (ci > 0) cursor += GAP;
				cells.push({ key: `${gi}-${ci}`, value, x: cursor });
				cursor += CELL;
			});
		});
		const offset = (VIEW_W - cursor) / 2;
		return cells.map((cell) => ({ ...cell, x: cell.x + offset }));
	});

	function cellClass(mode: Mode): string {
		if (mode === 'split') return 'fill-bg stroke-foam';
		if (mode === 'merge') return 'fill-highlight-med stroke-accent';
		if (mode === 'sorted') return 'fill-highlight-med stroke-foam';
		return 'fill-bg stroke-line';
	}

	function textClass(mode: Mode): string {
		if (mode === 'merge') return 'fill-accent';
		if (mode === 'split' || mode === 'sorted') return 'fill-foam';
		return 'fill-muted';
	}
</script>

<article class="study-card min-w-0 p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{copy.steps.length}</span>
	</div>

	<Stepper length={copy.steps.length} bind:step labels={copy} />

	<div class="mt-5 overflow-x-auto">
		<svg viewBox="0 0 320 64" class="min-w-[18rem] max-w-full" role="img" aria-label={copy.title}>
			{#each layout as cell (cell.key)}
				<g>
					<rect
						x={cell.x}
						y="11"
						width={CELL}
						height={CELL}
						rx="6"
						stroke-width="1.5"
						class={`transition-colors duration-200 motion-reduce:transition-none ${cellClass(frame.mode)}`}
					/>
					<text
						x={cell.x + CELL / 2}
						y="37"
						text-anchor="middle"
						class={`font-mono text-[15px] ${textClass(frame.mode)}`}
					>
						{cell.value}
					</text>
				</g>
			{/each}
		</svg>
	</div>

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step]}
	</p>
</article>
