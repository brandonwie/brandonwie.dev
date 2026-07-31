<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { MstCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { fade } from 'svelte/transition';

	let { copy }: { copy: MstCopy } = $props();

	let step = $state(0);
	const motion = useReducedMotion();

	type VertexRole = 'start' | 'visited' | 'frontier' | 'unvisited';
	type EdgeRole = 'mst' | 'discarded' | 'queued' | 'idle';

	interface Vertex {
		id: string;
		x: number;
		y: number;
		badgeX: number;
		badgeY: number;
		badgeAnchor: 'start' | 'middle' | 'end';
	}

	interface WeightedEdge {
		id: string;
		from: string;
		to: string;
		weight: number;
		labelX: number;
		labelY: number;
	}

	interface MstFrame {
		/** Vertex ids in the order Prim's visited them; the first one is the start vertex. */
		visited: string[];
		/** Edge ids still in the priority queue, cheapest first. */
		queue: string[];
		/** Edge ids accepted into the tree. */
		mst: string[];
		/** Edge ids dequeued but thrown away because both endpoints were already visited. */
		discarded: string[];
	}

	// Planar layout of the worked example: five vertices, no crossing edges.
	// Badge anchors are hand-placed so a role label never lands on an edge.
	const vertices: Vertex[] = [
		{ id: 'A', x: 50, y: 45, badgeX: 50, badgeY: 22, badgeAnchor: 'middle' },
		{ id: 'B', x: 165, y: 45, badgeX: 165, badgeY: 22, badgeAnchor: 'middle' },
		{ id: 'C', x: 110, y: 120, badgeX: 88, badgeY: 124, badgeAnchor: 'end' },
		{ id: 'D', x: 250, y: 110, badgeX: 272, badgeY: 114, badgeAnchor: 'start' },
		{ id: 'E', x: 170, y: 190, badgeX: 192, badgeY: 194, badgeAnchor: 'start' },
	];

	// Seven undirected edges, every weight distinct. Ids read in the direction the
	// trace names them (C-B is pushed from C after C joins the tree).
	const edges: WeightedEdge[] = [
		{ id: 'A-B', from: 'A', to: 'B', weight: 4, labelX: 108, labelY: 37 },
		{ id: 'A-C', from: 'A', to: 'C', weight: 1, labelX: 66, labelY: 86 },
		{ id: 'C-B', from: 'C', to: 'B', weight: 2, labelX: 152, labelY: 86 },
		{ id: 'B-D', from: 'B', to: 'D', weight: 5, labelX: 218, labelY: 71 },
		{ id: 'C-D', from: 'C', to: 'D', weight: 8, labelX: 180, labelY: 106 },
		{ id: 'C-E', from: 'C', to: 'E', weight: 10, labelX: 127, labelY: 160 },
		{ id: 'D-E', from: 'D', to: 'E', weight: 3, labelX: 222, labelY: 154 },
	];

	// Prim's from A. Each frame is the state after one loop decision, so queue[0]
	// is the edge the next frame dequeues. Geometry lives above; copy.steps
	// supplies the localized narration.
	const frames: MstFrame[] = [
		{ visited: [], queue: [], mst: [], discarded: [] },
		{ visited: ['A'], queue: ['A-C', 'A-B'], mst: [], discarded: [] },
		{
			visited: ['A', 'C'],
			queue: ['C-B', 'A-B', 'C-D', 'C-E'],
			mst: ['A-C'],
			discarded: [],
		},
		{
			visited: ['A', 'C', 'B'],
			queue: ['A-B', 'B-D', 'C-D', 'C-E'],
			mst: ['A-C', 'C-B'],
			discarded: [],
		},
		{
			visited: ['A', 'C', 'B'],
			queue: ['B-D', 'C-D', 'C-E'],
			mst: ['A-C', 'C-B'],
			discarded: ['A-B'],
		},
		{
			visited: ['A', 'C', 'B', 'D'],
			queue: ['D-E', 'C-D', 'C-E'],
			mst: ['A-C', 'C-B', 'B-D'],
			discarded: ['A-B'],
		},
		{
			visited: ['A', 'C', 'B', 'D', 'E'],
			queue: ['C-D', 'C-E'],
			mst: ['A-C', 'C-B', 'B-D', 'D-E'],
			discarded: ['A-B'],
		},
	];

	const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
	const edgeById = new Map(edges.map((edge) => [edge.id, edge]));

	const frame = $derived(frames[step]);

	// A vertex is on the frontier when it is unvisited and some queued edge reaches it.
	const frontier = $derived.by(() => {
		const open = frame.queue
			.map((id) => edgeById.get(id))
			.filter((edge): edge is WeightedEdge => edge !== undefined)
			.flatMap((edge) => [edge.from, edge.to])
			.filter((id) => !frame.visited.includes(id));
		return new Set(open);
	});

	const total = $derived(frame.mst.reduce((sum, id) => sum + (edgeById.get(id)?.weight ?? 0), 0));

	function edgeLabel(id: string): string {
		const edge = edgeById.get(id);
		return edge ? `${edge.from}–${edge.to} ${edge.weight}` : id;
	}

	function vertexRole(id: string): VertexRole {
		if (frame.visited[0] === id) return 'start';
		if (frame.visited.includes(id)) return 'visited';
		if (frontier.has(id)) return 'frontier';
		return 'unvisited';
	}

	function vertexClass(role: VertexRole): string {
		if (role === 'start') return 'fill-highlight-med stroke-gold';
		if (role === 'visited') return 'fill-highlight-med stroke-accent';
		if (role === 'frontier') return 'fill-bg stroke-foam';
		return 'fill-bg stroke-line';
	}

	function vertexTextClass(role: VertexRole): string {
		if (role === 'start') return 'fill-gold';
		if (role === 'visited') return 'fill-accent';
		if (role === 'frontier') return 'fill-foam';
		return 'fill-faint';
	}

	function badgeLabel(role: VertexRole): string {
		if (role === 'start') return copy.roleLabels.start;
		if (role === 'visited') return copy.roleLabels.visited;
		if (role === 'frontier') return copy.roleLabels.frontier;
		return '';
	}

	function edgeRole(id: string): EdgeRole {
		if (frame.mst.includes(id)) return 'mst';
		if (frame.discarded.includes(id)) return 'discarded';
		if (frame.queue.includes(id)) return 'queued';
		return 'idle';
	}

	function edgeClass(role: EdgeRole): string {
		if (role === 'mst') return 'stroke-accent';
		if (role === 'discarded') return 'stroke-crit';
		if (role === 'queued') return 'stroke-foam';
		return 'stroke-line';
	}

	function edgeWidth(role: EdgeRole): number {
		if (role === 'mst') return 2.5;
		if (role === 'queued') return 2;
		return 1.5;
	}

	function weightClass(role: EdgeRole): string {
		if (role === 'mst') return 'fill-accent';
		if (role === 'queued') return 'fill-foam';
		return 'fill-faint';
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
			{#each edges as edge (edge.id)}
				{@const from = vertexById.get(edge.from)}
				{@const to = vertexById.get(edge.to)}
				{@const role = edgeRole(edge.id)}
				{#if from && to}
					<g>
						<line
							x1={from.x}
							y1={from.y}
							x2={to.x}
							y2={to.y}
							stroke-width={edgeWidth(role)}
							stroke-dasharray={role === 'discarded' ? '4 3' : undefined}
							class={`transition-all duration-200 motion-reduce:transition-none ${edgeClass(role)}`}
						/>
						<text
							x={edge.labelX}
							y={edge.labelY}
							text-anchor="middle"
							class={`font-mono text-[11px] ${weightClass(role)}`}
						>
							{edge.weight}
						</text>
					</g>
				{/if}
			{/each}

			{#each vertices as vertex (vertex.id)}
				{@const role = vertexRole(vertex.id)}
				<g>
					<circle
						cx={vertex.x}
						cy={vertex.y}
						r="16"
						stroke-width="1.5"
						class={`transition-colors duration-200 motion-reduce:transition-none ${vertexClass(role)}`}
					/>
					<text
						x={vertex.x}
						y={vertex.y + 5}
						text-anchor="middle"
						class={`font-mono text-[14px] ${vertexTextClass(role)}`}
					>
						{vertex.id}
					</text>
					{#if role !== 'unvisited'}
						<text
							in:fade={{ duration: motion.current ? 0 : 120 }}
							x={vertex.badgeX}
							y={vertex.badgeY}
							text-anchor={vertex.badgeAnchor}
							class={`font-mono text-[8px] uppercase tracking-wider ${vertexTextClass(role)}`}
						>
							{badgeLabel(role)}
						</text>
					{/if}
				</g>
			{/each}
		</svg>
	</div>

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.queueLabel}</span>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each frame.queue as id (id)}
				<span
					in:fade={{ duration: motion.current ? 0 : 120 }}
					class="border border-foam px-2.5 py-1 font-mono text-sm text-foam"
				>
					{edgeLabel(id)}
				</span>
			{:else}
				<span class="font-mono text-sm text-faint">{copy.emptyLabel}</span>
			{/each}
		</div>
	</div>

	<div class="mt-5 flex items-baseline justify-between gap-3">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">
			{copy.roleLabels.inMst}
		</span>
		<span class="font-mono text-xs text-faint">
			{copy.totalLabel}
			<span class="text-accent">{total}</span>
		</span>
	</div>
	<div class="mt-2 flex flex-wrap gap-2">
		{#each frame.mst as id (id)}
			<span
				in:fade={{ duration: motion.current ? 0 : 120 }}
				class="border border-accent bg-highlight-med px-2.5 py-1 font-mono text-sm text-accent"
			>
				{edgeLabel(id)}
			</span>
		{:else}
			<span class="font-mono text-sm text-faint">{copy.emptyLabel}</span>
		{/each}
	</div>

	{#if frame.discarded.length > 0}
		<div class="mt-5">
			<span class="font-mono text-xs uppercase tracking-wider text-faint">
				{copy.roleLabels.discarded}
			</span>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each frame.discarded as id (id)}
					<span
						in:fade={{ duration: motion.current ? 0 : 120 }}
						class="border border-line px-2.5 py-1 font-mono text-sm text-faint line-through"
					>
						{edgeLabel(id)}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step] ?? ''}
	</p>
</article>
