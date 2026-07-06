<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { AvlVisualizerCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { fade } from 'svelte/transition';

	let { copy }: { copy: AvlVisualizerCopy } = $props();

	let step = $state(0);
	const motion = useReducedMotion();

	type Role = keyof AvlVisualizerCopy['roleLabels'];

	interface AvlNode {
		id: string;
		x: number;
		y: number;
		label: string;
		bf: number;
		role?: Role;
	}

	interface AvlEdge {
		from: string;
		to: string;
	}

	interface AvlFrame {
		nodes: AvlNode[];
		edges: AvlEdge[];
	}

	// Worked example: insert 10, 5, 7 -> left-right imbalance -> double rotation.
	// Node ids stay stable across frames (a=10, b=5, c=7) so shape changes read
	// as motion. Geometry is owned here; copy.steps supplies localized narration.
	const frames: AvlFrame[] = [
		{
			nodes: [{ id: 'a', x: 170, y: 40, label: '10', bf: 0, role: 'insert' }],
			edges: [],
		},
		{
			nodes: [
				{ id: 'a', x: 170, y: 40, label: '10', bf: 1 },
				{ id: 'b', x: 110, y: 112, label: '5', bf: 0, role: 'insert' },
			],
			edges: [{ from: 'a', to: 'b' }],
		},
		{
			nodes: [
				{ id: 'a', x: 170, y: 40, label: '10', bf: 2, role: 'imbalance' },
				{ id: 'b', x: 110, y: 112, label: '5', bf: -1 },
				{ id: 'c', x: 150, y: 182, label: '7', bf: 0, role: 'insert' },
			],
			edges: [
				{ from: 'a', to: 'b' },
				{ from: 'b', to: 'c' },
			],
		},
		{
			nodes: [
				{ id: 'a', x: 170, y: 40, label: '10', bf: 2, role: 'imbalance' },
				{ id: 'c', x: 110, y: 112, label: '7', bf: 1, role: 'rotate' },
				{ id: 'b', x: 60, y: 182, label: '5', bf: 0, role: 'rotate' },
			],
			edges: [
				{ from: 'a', to: 'c' },
				{ from: 'c', to: 'b' },
			],
		},
		{
			nodes: [
				{ id: 'c', x: 170, y: 40, label: '7', bf: 0, role: 'balanced' },
				{ id: 'b', x: 110, y: 112, label: '5', bf: 0, role: 'balanced' },
				{ id: 'a', x: 230, y: 112, label: '10', bf: 0, role: 'balanced' },
			],
			edges: [
				{ from: 'c', to: 'b' },
				{ from: 'c', to: 'a' },
			],
		},
		{
			nodes: [
				{ id: 'c', x: 170, y: 40, label: '7', bf: 1 },
				{ id: 'b', x: 110, y: 112, label: '5', bf: 1 },
				{ id: 'a', x: 230, y: 112, label: '10', bf: 0 },
				{ id: 'd', x: 70, y: 182, label: '3', bf: 0, role: 'insert' },
			],
			edges: [
				{ from: 'c', to: 'b' },
				{ from: 'c', to: 'a' },
				{ from: 'b', to: 'd' },
			],
		},
		{
			nodes: [
				{ id: 'c', x: 170, y: 40, label: '7', bf: 2, role: 'imbalance' },
				{ id: 'b', x: 110, y: 112, label: '5', bf: 1 },
				{ id: 'd', x: 70, y: 182, label: '3', bf: 0 },
				{ id: 'a', x: 230, y: 112, label: '10', bf: 0, role: 'remove' },
			],
			edges: [
				{ from: 'c', to: 'b' },
				{ from: 'b', to: 'd' },
				{ from: 'c', to: 'a' },
			],
		},
		{
			nodes: [
				{ id: 'b', x: 170, y: 40, label: '5', bf: 0, role: 'balanced' },
				{ id: 'd', x: 110, y: 112, label: '3', bf: 0, role: 'balanced' },
				{ id: 'c', x: 230, y: 112, label: '7', bf: 0, role: 'balanced' },
			],
			edges: [
				{ from: 'b', to: 'd' },
				{ from: 'b', to: 'c' },
			],
		},
	];

	const frame = $derived(frames[step]);
	const nodeById = $derived(new Map(frame.nodes.map((node) => [node.id, node])));

	function nodeClass(role: Role | undefined): string {
		if (role === 'insert') return 'fill-bg stroke-foam';
		if (role === 'imbalance' || role === 'remove') return 'fill-bg stroke-crit';
		if (role === 'rotate' || role === 'balanced') return 'fill-highlight-med stroke-accent';
		return 'fill-bg stroke-line';
	}

	function nodeTextClass(role: Role | undefined): string {
		if (role === 'insert') return 'fill-foam';
		if (role === 'imbalance') return 'fill-crit';
		if (role === 'remove') return 'fill-faint';
		if (role === 'rotate' || role === 'balanced') return 'fill-accent';
		return 'fill-muted';
	}

	function bfClass(bf: number, role: Role | undefined): string {
		if (role === 'imbalance' || Math.abs(bf) >= 2) return 'fill-crit';
		return 'fill-faint';
	}

	function formatBf(bf: number): string {
		return bf > 0 ? `+${bf}` : `${bf}`;
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
		<svg viewBox="0 0 340 210" class="min-w-[20rem] max-w-full" role="img" aria-label={copy.title}>
			{#each frame.edges as edge (`${edge.from}-${edge.to}`)}
				{@const from = nodeById.get(edge.from)}
				{@const to = nodeById.get(edge.to)}
				{#if from && to}
					<line
						x1={from.x}
						y1={from.y}
						x2={to.x}
						y2={to.y}
						class="stroke-line"
						stroke-width="1.5"
					/>
				{/if}
			{/each}

			{#each frame.nodes as node (node.id)}
				{@const role = node.role}
				<g>
					<circle
						cx={node.x}
						cy={node.y}
						r="16"
						stroke-width="1.5"
						stroke-dasharray={role === 'remove' ? '3 3' : undefined}
						class={`transition-colors duration-200 motion-reduce:transition-none ${nodeClass(role)}`}
					/>
					<text
						x={node.x}
						y={node.y + 5}
						text-anchor="middle"
						class={`font-mono text-[14px] ${nodeTextClass(role)}`}
					>
						{node.label}
					</text>
					<text
						x={node.x}
						y={node.y - 22}
						text-anchor="middle"
						class={`font-mono text-[8px] uppercase tracking-wider ${bfClass(node.bf, role)}`}
					>
						{copy.balanceFactorLabel}
						{formatBf(node.bf)}
					</text>
					{#if role}
						<text
							in:fade={{ duration: motion.current ? 0 : 120 }}
							x={node.x + 24}
							y={node.y + 4}
							text-anchor="start"
							class={`font-mono text-[8px] uppercase tracking-wider ${nodeTextClass(role)}`}
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
