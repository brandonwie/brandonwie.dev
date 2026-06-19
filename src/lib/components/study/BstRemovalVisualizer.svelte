<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { BstRemovalCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { fade } from 'svelte/transition';

	let { copy }: { copy: BstRemovalCopy } = $props();

	let step = $state(0);
	const motion = useReducedMotion();

	type Role = keyof BstRemovalCopy['roleLabels'];

	interface TreeNode {
		id: string;
		x: number;
		y: number;
	}

	interface TreeEdge {
		from: string;
		to: string;
	}

	// Fixed 7-node perfect BST. Geometry is owned by the component.
	const nodes: TreeNode[] = [
		{ id: 'n4', x: 170, y: 26 },
		{ id: 'n2', x: 92, y: 88 },
		{ id: 'n6', x: 248, y: 88 },
		{ id: 'n1', x: 48, y: 150 },
		{ id: 'n3', x: 132, y: 150 },
		{ id: 'n5', x: 208, y: 150 },
		{ id: 'n7', x: 292, y: 150 },
	];

	const edges: TreeEdge[] = [
		{ from: 'n4', to: 'n2' },
		{ from: 'n4', to: 'n6' },
		{ from: 'n2', to: 'n1' },
		{ from: 'n2', to: 'n3' },
		{ from: 'n6', to: 'n5' },
		{ from: 'n6', to: 'n7' },
	];

	const nodeById = new Map(nodes.map((node) => [node.id, node]));

	// Scenario = remove(4) via in-order SUCCESSOR.
	// Root (n4) is relabeled 4 -> 5 at step 3 (promotion).
	// The old successor node (n5, at n6.left) is removed at step 4.
	const rootLabel = $derived(step >= 3 ? '5' : '4');
	const oldFiveRemoved = $derived(step >= 4);

	const baseLabels: Record<string, string> = {
		n4: '4',
		n2: '2',
		n6: '6',
		n1: '1',
		n3: '3',
		n5: '5',
		n7: '7',
	};

	function labelFor(id: string): string {
		if (id === 'n4') return rootLabel;
		return baseLabels[id];
	}

	// Edge n6 -> n5 disappears once the old successor is removed.
	const visibleEdges = $derived(
		edges.filter((edge) => !(oldFiveRemoved && edge.from === 'n6' && edge.to === 'n5')),
	);

	// Per-step role assignment for highlighting.
	function roleFor(id: string): Role | null {
		switch (step) {
			case 0:
				return id === 'n4' ? 'target' : null;
			case 1:
				if (id === 'n4') return 'target';
				return null;
			case 2:
				if (id === 'n4') return 'target';
				if (id === 'n5') return 'successor';
				return null;
			case 3:
				return id === 'n4' ? 'promoted' : null;
			case 4:
				if (id === 'n4') return 'promoted';
				if (id === 'n5') return 'removed';
				return null;
			default:
				return null;
		}
	}

	function nodeClass(role: Role | null, removed: boolean): string {
		if (removed) return 'fill-bg stroke-line opacity-40';
		if (role === 'target') return 'fill-highlight-med stroke-accent';
		if (role === 'successor') return 'fill-bg stroke-foam';
		if (role === 'promoted') return 'fill-highlight-med stroke-accent';
		if (role === 'removed') return 'fill-bg stroke-crit opacity-50';
		return 'fill-bg stroke-line';
	}

	function nodeTextClass(role: Role | null, removed: boolean): string {
		if (removed) return 'fill-faint';
		if (role === 'target' || role === 'promoted') return 'fill-accent';
		if (role === 'successor') return 'fill-foam';
		if (role === 'removed') return 'fill-faint';
		return 'fill-muted';
	}

	function tagClass(role: Role): string {
		if (role === 'target' || role === 'promoted') return 'fill-accent';
		if (role === 'successor') return 'fill-foam';
		return 'fill-crit';
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
		<svg viewBox="0 0 340 210" class="min-w-[20rem] max-w-full" role="img" aria-label={copy.title}>
			{#each visibleEdges as edge (`${edge.from}-${edge.to}`)}
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

			{#each nodes as node (node.id)}
				{@const removed = node.id === 'n5' && oldFiveRemoved}
				{@const role = roleFor(node.id)}
				<g class="transition-opacity duration-200 motion-reduce:transition-none">
					<circle
						cx={node.x}
						cy={node.y}
						r="16"
						stroke-width="1.5"
						stroke-dasharray={role === 'removed' || removed ? '3 3' : undefined}
						class={`transition-colors duration-200 motion-reduce:transition-none ${nodeClass(role, removed)}`}
					/>
					<text
						x={node.x}
						y={node.y + 5}
						text-anchor="middle"
						class={`font-mono text-[14px] ${nodeTextClass(role, removed)}`}
					>
						{removed ? '' : labelFor(node.id)}
					</text>
					{#if role && !removed}
						<text
							in:fade={{ duration: motion.current ? 0 : 120 }}
							x={node.x}
							y={node.y - 22}
							text-anchor="middle"
							class={`font-mono text-[8px] uppercase tracking-wider ${tagClass(role)}`}
						>
							{copy.roleLabels[role]}
						</text>
					{:else if removed}
						<text
							in:fade={{ duration: motion.current ? 0 : 120 }}
							x={node.x}
							y={node.y - 22}
							text-anchor="middle"
							class="font-mono text-[8px] uppercase tracking-wider fill-crit"
						>
							{copy.roleLabels.removed}
						</text>
					{/if}
				</g>
			{/each}
		</svg>
	</div>

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step]}
	</p>
</article>
