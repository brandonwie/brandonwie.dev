<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { BstTraversalCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { fade } from 'svelte/transition';

	let { copy }: { copy: BstTraversalCopy } = $props();

	type TraversalMode = 'inorder' | 'preorder' | 'postorder';

	interface TreeNode {
		value: number;
		x: number;
		y: number;
		left: TreeNode | null;
		right: TreeNode | null;
	}

	const node = (
		value: number,
		x: number,
		y: number,
		left: TreeNode | null = null,
		right: TreeNode | null = null,
	): TreeNode => ({ value, x, y, left, right });

	// Fixed 6-node BST. 13 is root; leaves are 5, 11, 19.
	const tree: TreeNode = node(
		13,
		160,
		28,
		node(7, 92, 90, node(5, 50, 152), node(11, 132, 152)),
		node(29, 240, 90, node(19, 200, 152), null),
	);

	// Edges drawn under the nodes: parent value → child value.
	const edges = [
		{ from: 13, to: 7 },
		{ from: 13, to: 29 },
		{ from: 7, to: 5 },
		{ from: 7, to: 11 },
		{ from: 29, to: 19 },
	];

	const nodes = $derived.by(() => {
		const flat: TreeNode[] = [];
		const collect = (n: TreeNode | null) => {
			if (!n) return;
			flat.push(n);
			collect(n.left);
			collect(n.right);
		};
		collect(tree);
		return flat;
	});

	function nodeByValue(value: number): TreeNode | undefined {
		return nodes.find((n) => n.value === value);
	}

	// Sequences derived by recursion, never hardcoded.
	function inorder(n: TreeNode | null, out: number[]): void {
		if (!n) return;
		inorder(n.left, out);
		out.push(n.value);
		inorder(n.right, out);
	}
	function preorder(n: TreeNode | null, out: number[]): void {
		if (!n) return;
		out.push(n.value);
		preorder(n.left, out);
		preorder(n.right, out);
	}
	function postorder(n: TreeNode | null, out: number[]): void {
		if (!n) return;
		postorder(n.left, out);
		postorder(n.right, out);
		out.push(n.value);
	}

	const sequences: Record<TraversalMode, number[]> = $derived.by(() => {
		const into: number[] = [];
		const pre: number[] = [];
		const post: number[] = [];
		inorder(tree, into);
		preorder(tree, pre);
		postorder(tree, post);
		return { inorder: into, preorder: pre, postorder: post };
	});

	let mode = $state<TraversalMode>('inorder');
	let step = $state(0);
	const motion = useReducedMotion();

	const sequence = $derived(sequences[mode]);
	const currentMode = $derived(copy.modes[mode]);
	const visited = $derived(sequence.slice(0, step + 1));
	const currentValue = $derived(sequence[step]);
	// Insertion order = pre-order from root (how the tree was built).
	const builtFrom = $derived(sequences.preorder);

	type NodeState = 'current' | 'visited' | 'unvisited';

	function nodeState(value: number): NodeState {
		if (value === currentValue) return 'current';
		if (visited.includes(value)) return 'visited';
		return 'unvisited';
	}

	function circleClass(state: NodeState): string {
		if (state === 'current') return 'fill-bg stroke-gold';
		if (state === 'visited') return 'fill-highlight-med stroke-accent';
		return 'fill-bg stroke-line';
	}

	function textClass(state: NodeState): string {
		if (state === 'current') return 'fill-gold';
		if (state === 'visited') return 'fill-accent';
		return 'fill-faint';
	}

	function changeMode(event: Event) {
		mode = (event.currentTarget as HTMLSelectElement).value as TraversalMode;
		step = 0;
	}
</script>

<article class="study-card min-w-0 p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{sequence.length}</span>
	</div>

	<div class="mt-5 sm:max-w-xs">
		<label class="font-mono text-xs uppercase tracking-wider text-faint" for="bst-traversal-order">
			{copy.orderLabel}
		</label>
		<select
			id="bst-traversal-order"
			class="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm text-ink"
			value={mode}
			onchange={changeMode}
		>
			<option value="inorder">{copy.modes.inorder.label}</option>
			<option value="preorder">{copy.modes.preorder.label}</option>
			<option value="postorder">{copy.modes.postorder.label}</option>
		</select>
	</div>

	<p class="mt-3 text-sm leading-6 text-muted">{currentMode.note}</p>

	<Stepper length={sequence.length} bind:step labels={copy} />

	<div class="mt-5 overflow-x-auto">
		<svg viewBox="0 0 320 190" role="img" aria-label={copy.title} class="min-w-[20rem] max-w-full">
			{#each edges as edge (`${edge.from}-${edge.to}`)}
				{@const a = nodeByValue(edge.from)}
				{@const b = nodeByValue(edge.to)}
				{#if a && b}
					<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="stroke-line" stroke-width="1.5" />
				{/if}
			{/each}

			{#each nodes as n (n.value)}
				{@const state = nodeState(n.value)}
				<g class="transition-all duration-200 motion-reduce:transition-none">
					<circle
						cx={n.x}
						cy={n.y}
						r="18"
						stroke-width={state === 'current' ? 2.5 : 1.5}
						class={`transition-all duration-200 motion-reduce:transition-none ${circleClass(state)}`}
					/>
					<text
						x={n.x}
						y={n.y}
						text-anchor="middle"
						dominant-baseline="central"
						class={`font-mono text-[13px] ${textClass(state)}`}
					>
						{n.value}
					</text>
				</g>
			{/each}
		</svg>
	</div>

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.outputLabel}</span>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each visited as value, index (`${value}-${index}`)}
				<span
					in:fade={{ duration: motion.current ? 0 : 120 }}
					class={`border px-2.5 py-1 font-mono text-sm ${
						index === visited.length - 1
							? 'border-gold text-gold'
							: 'border-accent bg-highlight-med text-accent'
					}`}
				>
					{value}
				</span>
			{/each}
		</div>
	</div>

	<p class="mt-4 font-mono text-xs text-faint">
		{copy.builtFromLabel}: {builtFrom.join(', ')}
	</p>
</article>
