<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { GraphTraversalCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { fade } from 'svelte/transition';

	let { copy }: { copy: GraphTraversalCopy } = $props();

	type TraversalMode = 'bfs' | 'dfs';
	type VertexId = 'A' | 'B' | 'C' | 'D' | 'E';
	type Role = keyof GraphTraversalCopy['roleLabels'];

	interface Vertex {
		id: VertexId;
		x: number;
		y: number;
	}

	interface Edge {
		from: VertexId;
		to: VertexId;
	}

	interface TraversalFrame {
		mode: TraversalMode;
		roles: Record<VertexId, Role>;
		/** Queue contents for BFS, call stack (bottom → top) for DFS. */
		frontier: VertexId[];
		order: VertexId[];
	}

	// Undirected, unweighted graph: 5 vertices, 5 edges. Positions are fixed so
	// both traversals run over the same picture, and no edge passes over a node.
	const vertices: Vertex[] = [
		{ id: 'A', x: 160, y: 26 },
		{ id: 'B', x: 78, y: 84 },
		{ id: 'C', x: 242, y: 84 },
		{ id: 'D', x: 160, y: 130 },
		{ id: 'E', x: 160, y: 176 },
	];

	const edges: Edge[] = [
		{ from: 'A', to: 'B' },
		{ from: 'A', to: 'C' },
		{ from: 'B', to: 'D' },
		{ from: 'C', to: 'D' },
		{ from: 'D', to: 'E' },
	];

	// Fixed neighbor order. Both traversals follow it, and it is what makes the
	// two visit orders diverge.
	const adjacency: { id: VertexId; neighbors: VertexId[] }[] = [
		{ id: 'A', neighbors: ['B', 'C'] },
		{ id: 'B', neighbors: ['A', 'D'] },
		{ id: 'C', neighbors: ['A', 'D'] },
		{ id: 'D', neighbors: ['B', 'C', 'E'] },
		{ id: 'E', neighbors: ['D'] },
	];

	// BFS from A, marking on enqueue: one frame per dequeue.
	const bfsFrames: TraversalFrame[] = [
		{
			mode: 'bfs',
			roles: { A: 'current', B: 'queued', C: 'queued', D: 'unvisited', E: 'unvisited' },
			frontier: ['B', 'C'],
			order: ['A'],
		},
		{
			mode: 'bfs',
			roles: { A: 'visited', B: 'current', C: 'queued', D: 'queued', E: 'unvisited' },
			frontier: ['C', 'D'],
			order: ['A', 'B'],
		},
		{
			mode: 'bfs',
			roles: { A: 'visited', B: 'visited', C: 'current', D: 'queued', E: 'unvisited' },
			frontier: ['D'],
			order: ['A', 'B', 'C'],
		},
		{
			mode: 'bfs',
			roles: { A: 'visited', B: 'visited', C: 'visited', D: 'current', E: 'queued' },
			frontier: ['E'],
			order: ['A', 'B', 'C', 'D'],
		},
		{
			mode: 'bfs',
			roles: { A: 'visited', B: 'visited', C: 'visited', D: 'visited', E: 'current' },
			frontier: [],
			order: ['A', 'B', 'C', 'D', 'E'],
		},
	];

	// Recursive DFS from A, marking on visit: one frame per visit.
	const dfsFrames: TraversalFrame[] = [
		{
			mode: 'dfs',
			roles: { A: 'current', B: 'unvisited', C: 'unvisited', D: 'unvisited', E: 'unvisited' },
			frontier: ['A'],
			order: ['A'],
		},
		{
			mode: 'dfs',
			roles: { A: 'visited', B: 'current', C: 'unvisited', D: 'unvisited', E: 'unvisited' },
			frontier: ['A', 'B'],
			order: ['A', 'B'],
		},
		{
			mode: 'dfs',
			roles: { A: 'visited', B: 'visited', C: 'unvisited', D: 'current', E: 'unvisited' },
			frontier: ['A', 'B', 'D'],
			order: ['A', 'B', 'D'],
		},
		{
			mode: 'dfs',
			roles: { A: 'visited', B: 'visited', C: 'current', D: 'visited', E: 'unvisited' },
			frontier: ['A', 'B', 'D', 'C'],
			order: ['A', 'B', 'D', 'C'],
		},
		{
			mode: 'dfs',
			roles: { A: 'visited', B: 'visited', C: 'backtrack', D: 'visited', E: 'current' },
			frontier: ['A', 'B', 'D', 'E'],
			order: ['A', 'B', 'D', 'C', 'E'],
		},
	];

	// One continuous walkthrough: the five BFS dequeues, then the five DFS visits.
	// Length must stay equal to copy.steps.length.
	const frames: TraversalFrame[] = [...bfsFrames, ...dfsFrames];

	const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
	const adjacencyText = adjacency
		.map((entry) => `${entry.id}: ${entry.neighbors.join(', ')}`)
		.join(' · ');

	let step = $state(0);
	const motion = useReducedMotion();

	const frame = $derived(frames[step]);
	// Mode follows the frame, so stepping across the BFS/DFS boundary keeps the
	// select, the graph and the frontier label in agreement.
	const mode = $derived(frame.mode);
	const currentMode = $derived(copy.modes[mode]);

	function nodeClass(role: Role): string {
		if (role === 'current') return 'fill-bg stroke-gold';
		if (role === 'queued') return 'fill-bg stroke-foam';
		if (role === 'visited') return 'fill-highlight-med stroke-accent';
		if (role === 'backtrack') return 'fill-bg stroke-accent';
		return 'fill-bg stroke-line';
	}

	function nodeTextClass(role: Role): string {
		if (role === 'current') return 'fill-gold';
		if (role === 'queued') return 'fill-foam';
		if (role === 'visited' || role === 'backtrack') return 'fill-accent';
		return 'fill-faint';
	}

	function chipClass(role: Role): string {
		if (role === 'current') return 'border-gold text-gold';
		if (role === 'queued') return 'border-foam text-foam';
		if (role === 'visited') return 'border-accent bg-highlight-med text-accent';
		if (role === 'backtrack') return 'border-accent text-accent';
		return 'border-line text-faint';
	}

	// Role badges sit on the outward side of each vertex so a wide label never
	// runs past the right edge of the viewBox.
	function badgeX(vertex: Vertex): number {
		return vertex.x > 200 ? vertex.x - 24 : vertex.x + 24;
	}

	function badgeAnchor(vertex: Vertex): 'start' | 'end' {
		return vertex.x > 200 ? 'end' : 'start';
	}

	// Each mode owns its own frame array, so switching jumps to that array's
	// first frame instead of carrying the old index over.
	function changeMode(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value as TraversalMode;
		step = next === 'bfs' ? 0 : bfsFrames.length;
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

	<div class="mt-5 sm:max-w-xs">
		<label class="font-mono text-xs uppercase tracking-wider text-faint" for="graph-traversal-mode">
			{copy.modeLabel}
		</label>
		<select
			id="graph-traversal-mode"
			class="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm text-ink"
			value={mode}
			onchange={changeMode}
		>
			<option value="bfs">{copy.modes.bfs.label}</option>
			<option value="dfs">{copy.modes.dfs.label}</option>
		</select>
	</div>

	<p class="mt-3 text-sm leading-6 text-muted">{currentMode.note}</p>

	<Stepper length={frames.length} bind:step labels={copy} />

	<div class="mt-5 overflow-x-auto">
		<svg viewBox="0 0 320 200" class="min-w-[20rem] max-w-full" role="img" aria-label={copy.title}>
			{#each edges as edge (`${edge.from}-${edge.to}`)}
				{@const from = vertexById.get(edge.from)}
				{@const to = vertexById.get(edge.to)}
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

			{#each vertices as vertex (vertex.id)}
				{@const role = frame.roles[vertex.id]}
				<g>
					<circle
						cx={vertex.x}
						cy={vertex.y}
						r="18"
						stroke-width={role === 'current' ? 2.5 : 1.5}
						stroke-dasharray={role === 'backtrack' ? '3 3' : undefined}
						class={`transition-all duration-200 motion-reduce:transition-none ${nodeClass(role)}`}
					/>
					<text
						x={vertex.x}
						y={vertex.y}
						text-anchor="middle"
						dominant-baseline="central"
						class={`font-mono text-[14px] ${nodeTextClass(role)}`}
					>
						{vertex.id}
					</text>
					<text
						x={badgeX(vertex)}
						y={vertex.y + 4}
						text-anchor={badgeAnchor(vertex)}
						class={`font-mono text-[8px] uppercase tracking-wider ${nodeTextClass(role)}`}
					>
						{copy.roleLabels[role]}
					</text>
				</g>
			{/each}
		</svg>
	</div>

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">
			{currentMode.frontierLabel}
		</span>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each frame.frontier as id, index (`${id}-${index}`)}
				<span
					in:fade={{ duration: motion.current ? 0 : 120 }}
					class={`border px-2.5 py-1 font-mono text-sm ${chipClass(frame.roles[id])}`}
				>
					{id}
				</span>
			{:else}
				<span class="font-mono text-sm text-faint">{copy.emptyLabel}</span>
			{/each}
		</div>
	</div>

	<div class="mt-4">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">
			{copy.visitOrderLabel}
		</span>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each frame.order as id, index (`${id}-${index}`)}
				<span
					in:fade={{ duration: motion.current ? 0 : 120 }}
					class={`border px-2.5 py-1 font-mono text-sm ${chipClass(frame.roles[id])}`}
				>
					{id}
				</span>
			{/each}
		</div>
	</div>

	<p class="mt-4 font-mono text-xs text-faint">
		{copy.adjacencyLabel}: {adjacencyText}
	</p>

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step] ?? ''}
	</p>
</article>
