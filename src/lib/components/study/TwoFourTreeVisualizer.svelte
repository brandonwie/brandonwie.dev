<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { TwoFourVisualizerCopy } from '$lib/data/study';

	let { copy }: { copy: TwoFourVisualizerCopy } = $props();

	let step = $state(0);

	type Role = keyof TwoFourVisualizerCopy['roleLabels'];

	interface TfNode {
		id: string;
		x: number;
		y: number;
		keys: number[];
		role?: Role;
	}

	interface TfEdge {
		from: string;
		to: string;
	}

	interface TfFrame {
		nodes: TfNode[];
		edges: TfEdge[];
	}

	// Worked example: split on insert, then transfer and fusion on remove.
	// Geometry is owned here; copy.steps supplies localized narration.
	const frames: TfFrame[] = [
		{ nodes: [{ id: 'r', x: 180, y: 44, keys: [10, 20, 30] }], edges: [] },
		{ nodes: [{ id: 'r', x: 180, y: 44, keys: [10, 20, 30, 40], role: 'overflow' }], edges: [] },
		{
			nodes: [
				{ id: 'r', x: 180, y: 44, keys: [20], role: 'promote' },
				{ id: 'l', x: 96, y: 132, keys: [10] },
				{ id: 'm', x: 264, y: 132, keys: [30, 40] },
			],
			edges: [
				{ from: 'r', to: 'l' },
				{ from: 'r', to: 'm' },
			],
		},
		{
			nodes: [
				{ id: 'r', x: 180, y: 44, keys: [20] },
				{ id: 'l', x: 96, y: 132, keys: [], role: 'underflow' },
				{ id: 'm', x: 264, y: 132, keys: [30, 40] },
			],
			edges: [
				{ from: 'r', to: 'l' },
				{ from: 'r', to: 'm' },
			],
		},
		{
			nodes: [
				{ id: 'r', x: 180, y: 44, keys: [30] },
				{ id: 'l', x: 96, y: 132, keys: [20], role: 'transfer' },
				{ id: 'm', x: 264, y: 132, keys: [40] },
			],
			edges: [
				{ from: 'r', to: 'l' },
				{ from: 'r', to: 'm' },
			],
		},
		{
			nodes: [
				{ id: 'r', x: 180, y: 44, keys: [30] },
				{ id: 'l', x: 96, y: 132, keys: [], role: 'underflow' },
				{ id: 'm', x: 264, y: 132, keys: [40] },
			],
			edges: [
				{ from: 'r', to: 'l' },
				{ from: 'r', to: 'm' },
			],
		},
		{ nodes: [{ id: 'r', x: 180, y: 44, keys: [30, 40], role: 'fusion' }], edges: [] },
	];

	const frame = $derived(frames[step]);
	const nodeById = $derived(new Map(frame.nodes.map((node) => [node.id, node])));

	const KEY_W = 26;

	function nodeWidth(keys: number[]): number {
		return Math.max(30, keys.length * KEY_W + 12);
	}

	function keyX(node: TfNode, index: number): number {
		return node.x - ((node.keys.length - 1) * KEY_W) / 2 + index * KEY_W;
	}

	function rectClass(role: Role | undefined): string {
		if (role === 'overflow' || role === 'underflow') return 'fill-bg stroke-crit';
		if (role === 'transfer') return 'fill-bg stroke-foam';
		if (role === 'promote' || role === 'fusion') return 'fill-highlight-med stroke-accent';
		return 'fill-bg stroke-line';
	}

	function textClass(role: Role | undefined): string {
		if (role === 'overflow' || role === 'underflow') return 'fill-crit';
		if (role === 'transfer') return 'fill-foam';
		if (role === 'promote' || role === 'fusion') return 'fill-accent';
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
		<svg viewBox="0 0 360 200" class="min-w-[20rem] max-w-full" role="img" aria-label={copy.title}>
			{#each frame.edges as edge (`${edge.from}-${edge.to}`)}
				{@const from = nodeById.get(edge.from)}
				{@const to = nodeById.get(edge.to)}
				{#if from && to}
					<line
						x1={from.x}
						y1={from.y + 16}
						x2={to.x}
						y2={to.y - 16}
						class="stroke-line"
						stroke-width="1.5"
					/>
				{/if}
			{/each}

			{#each frame.nodes as node (node.id)}
				{@const role = node.role}
				{@const width = nodeWidth(node.keys)}
				<g>
					<rect
						x={node.x - width / 2}
						y={node.y - 16}
						{width}
						height="32"
						rx="6"
						stroke-width="1.5"
						stroke-dasharray={role === 'underflow' ? '3 3' : undefined}
						class={`transition-colors duration-200 motion-reduce:transition-none ${rectClass(role)}`}
					/>
					{#each node.keys as key, index (index)}
						<text
							x={keyX(node, index)}
							y={node.y + 5}
							text-anchor="middle"
							class={`font-mono text-[13px] ${textClass(role)}`}
						>
							{key}
						</text>
					{/each}
					{#if role}
						<text
							x={node.x}
							y={node.y - 24}
							text-anchor="middle"
							class={`font-mono text-[8px] uppercase tracking-wider ${textClass(role)}`}
						>
							{copy.roleLabels[role]}
						</text>
					{/if}
				</g>
			{/each}
		</svg>
	</div>

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step] ?? ''}
	</p>
</article>
