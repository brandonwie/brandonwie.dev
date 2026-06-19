<script lang="ts">
	import type { BigOVisualizerCopy } from '$lib/data/study';
	import { curveMonotoneX, line } from 'd3-shape';
	import { Tween } from 'svelte/motion';

	let { copy }: { copy: BigOVisualizerCopy } = $props();

	const series = [
		{ label: 'O(1)', tone: 'var(--color-muted)', dash: '', value: (_n: number) => 1 },
		{
			label: 'O(log n)',
			tone: 'var(--color-foam)',
			dash: '4 5',
			value: (n: number) => Math.log2(n),
		},
		{ label: 'O(n)', tone: 'var(--color-accent)', dash: '', value: (n: number) => n },
		{
			label: 'O(n log n)',
			tone: 'var(--color-gold)',
			dash: '8 5',
			value: (n: number) => n * Math.log2(n),
		},
		{ label: 'O(n²)', tone: 'var(--color-rose)', dash: '2 4', value: (n: number) => n * n },
	];

	const sampleNs = [4, 8, 16, 32, 64, 128];
	let inputSize = $state(32);
	let useLogScale = $state(true);
	const animatedInputSize = new Tween(32, { duration: 180 });

	const chartWidth = 520;
	const chartHeight = 250;
	const pad = { top: 18, right: 24, bottom: 34, left: 42 };
	const plotWidth = chartWidth - pad.left - pad.right;
	const plotHeight = chartHeight - pad.top - pad.bottom;

	const maxLinear = $derived(
		Math.max(...series.flatMap((row) => sampleNs.map((n) => row.value(n)))),
	);
	const yMax = $derived(useLogScale ? Math.log10(maxLinear + 1) : maxLinear);

	/** Maps an input size `n` to an x pixel coordinate within the plot area. */
	function x(n: number): number {
		const min = sampleNs[0];
		const max = sampleNs[sampleNs.length - 1];
		return pad.left + ((n - min) / (max - min)) * plotWidth;
	}

	/** Maps a raw operation count to a y pixel coordinate, honoring the linear/log scale toggle. */
	function y(raw: number): number {
		const value = useLogScale ? Math.log10(raw + 1) : raw;
		return pad.top + plotHeight - (value / yMax) * plotHeight;
	}

	/** Builds the SVG path `d` for one Big-O series across the sample input sizes. */
	function linePath(row: (typeof series)[number]): string {
		const points = sampleNs.map((n) => ({ n, value: row.value(n) }));
		return (
			line<{ n: number; value: number }>()
				.x((point) => x(point.n))
				.y((point) => y(point.value))
				.curve(curveMonotoneX)(points) ?? ''
		);
	}

	$effect(() => {
		animatedInputSize.target = inputSize;
	});

	const displayInputSize = $derived(animatedInputSize.current);
	const cursorX = $derived(x(displayInputSize));
	const currentRows = $derived(
		series.map((row) => ({
			...row,
			display: Math.round(row.value(displayInputSize)).toLocaleString(),
		})),
	);

	function handleInput(event: Event) {
		inputSize = Number((event.currentTarget as HTMLInputElement).value);
	}
</script>

<article class="min-w-0 border border-line bg-surface p-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
		</div>
		<label class="flex items-center gap-2 font-mono text-xs text-faint">
			<input type="checkbox" bind:checked={useLogScale} class="accent-current" />
			{copy.logScaleLabel}
		</label>
	</div>

	<label class="mt-5 block font-mono text-xs uppercase tracking-wider text-faint" for="big-o-input">
		{copy.inputSizeLabel}: {Math.round(displayInputSize)}
	</label>
	<input
		id="big-o-input"
		class="mt-3 w-full accent-current"
		type="range"
		min="4"
		max="128"
		step="4"
		value={inputSize}
		oninput={handleInput}
	/>

	<div class="mt-5 overflow-x-auto">
		<svg
			viewBox={`0 0 ${chartWidth} ${chartHeight}`}
			class="w-full min-w-[28rem]"
			role="img"
			aria-label={copy.chartAriaLabel}
		>
			<line
				x1={pad.left}
				y1={pad.top}
				x2={pad.left}
				y2={pad.top + plotHeight}
				stroke="var(--color-line)"
			/>
			<line
				x1={pad.left}
				y1={pad.top + plotHeight}
				x2={pad.left + plotWidth}
				y2={pad.top + plotHeight}
				stroke="var(--color-line)"
			/>
			{#each sampleNs as n (n)}
				<line
					x1={x(n)}
					y1={pad.top}
					x2={x(n)}
					y2={pad.top + plotHeight}
					stroke="var(--color-line)"
					stroke-opacity="0.35"
				/>
				<text
					x={x(n)}
					y={chartHeight - 10}
					text-anchor="middle"
					class="fill-faint font-mono text-[10px]"
				>
					{n}
				</text>
			{/each}
			<line
				x1={cursorX}
				y1={pad.top}
				x2={cursorX}
				y2={pad.top + plotHeight}
				stroke="var(--color-accent)"
				stroke-width="2"
			/>
			{#each series as row (row.label)}
				<path
					d={linePath(row)}
					fill="none"
					stroke={row.tone}
					stroke-width="3"
					stroke-dasharray={row.dash}
					stroke-linecap="round"
					stroke-linejoin="round"
					class="transition-all duration-300 ease-out motion-reduce:transition-none"
				/>
				<circle cx={cursorX} cy={y(row.value(displayInputSize))} r="4" fill={row.tone} />
			{/each}
			<text
				x={pad.left - 10}
				y={pad.top + 8}
				text-anchor="end"
				class="fill-faint font-mono text-[10px]"
			>
				{copy.operationsAxisLabel}
			</text>
			<text
				x={pad.left + plotWidth}
				y={chartHeight - 10}
				text-anchor="end"
				class="fill-faint font-mono text-[10px]"
			>
				{copy.inputAxisLabel}
			</text>
		</svg>
	</div>

	<div class="mt-4 grid gap-2 sm:grid-cols-5">
		{#each currentRows as row (row.label)}
			<div class="border border-line bg-bg p-3">
				<div class="flex items-center gap-2">
					<span class="h-0.5 w-6" style={`background: ${row.tone}`}></span>
					<span class="font-mono text-xs text-muted">{row.label}</span>
				</div>
				<p class="mt-2 font-mono text-sm text-ink">{row.display}</p>
			</div>
		{/each}
	</div>
</article>
