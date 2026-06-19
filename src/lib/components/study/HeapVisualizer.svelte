<script lang="ts">
	import type { HeapVisualizerCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';

	type NodeStatus = 'settled' | 'inserted' | 'swapped' | 'root';
	interface HeapNode {
		id: string;
		value: number;
		status: NodeStatus;
	}
	type MessageState =
		| { kind: 'initial' }
		| { kind: 'add'; value: number }
		| { kind: 'removeMin'; value: number }
		| { kind: 'empty' };

	let { copy }: { copy: HeapVisualizerCopy } = $props();

	// Deterministic add source consumed in order; cycles when exhausted.
	const ADD_QUEUE = [5, 3, 8, 1, 4, 9, 2, 7];

	// 1-indexed backing array: index 0 is unused (null sentinel).
	let heap = $state<(HeapNode | null)[]>([null]);
	let cursor = $state(0);
	let nextId = $state(0);
	let message = $state<MessageState>({ kind: 'initial' });
	const motion = useReducedMotion();

	const size = $derived(heap.length - 1);
	const arrayCells = $derived.by<{ index: number; node: HeapNode }[]>(() => {
		const out: { index: number; node: HeapNode }[] = [];
		for (let i = 1; i <= size; i += 1) {
			const node = heap[i];
			if (node) out.push({ index: i, node });
		}
		return out;
	});
	const messageText = $derived.by(() => {
		if (message.kind === 'add') return copy.messages.add(message.value);
		if (message.kind === 'removeMin') return copy.messages.removeMin(message.value);
		if (message.kind === 'empty') return copy.messages.empty;
		return copy.messages.initial;
	});

	// SVG geometry: viewBox width is fixed; height grows with depth.
	const VIEW_W = 460;
	const NODE_R = 16;
	const ROW_GAP = 46;
	const TOP_Y = 28;
	const maxDepth = $derived(size > 0 ? Math.floor(Math.log2(size)) : 0);
	const viewHeight = $derived(TOP_Y + maxDepth * ROW_GAP + NODE_R + 8);

	interface PlacedNode {
		index: number;
		node: HeapNode;
		x: number;
		y: number;
	}
	interface PlacedEdge {
		id: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	function nodeXY(index: number): { x: number; y: number } {
		const depth = Math.floor(Math.log2(index));
		const slots = 2 ** depth;
		const posInLevel = index - slots;
		const x = (VIEW_W * (posInLevel + 0.5)) / slots;
		const y = TOP_Y + depth * ROW_GAP;
		return { x, y };
	}

	const placedNodes = $derived.by<PlacedNode[]>(() => {
		const out: PlacedNode[] = [];
		for (let i = 1; i <= size; i += 1) {
			const node = heap[i];
			if (!node) continue;
			out.push({ index: i, node, ...nodeXY(i) });
		}
		return out;
	});

	const placedEdges = $derived.by<PlacedEdge[]>(() => {
		const out: PlacedEdge[] = [];
		for (let i = 2; i <= size; i += 1) {
			if (!heap[i]) continue;
			const parent = Math.floor(i / 2);
			const a = nodeXY(parent);
			const b = nodeXY(i);
			out.push({ id: `edge-${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
		}
		return out;
	});

	function settleAll(arr: (HeapNode | null)[]): (HeapNode | null)[] {
		return arr.map((n, i) =>
			n ? { ...n, status: i === 1 ? ('root' as const) : ('settled' as const) } : n,
		);
	}

	function add() {
		if (cursor >= ADD_QUEUE.length) cursor = 0;
		const value = ADD_QUEUE[cursor];
		cursor += 1;

		const arr = settleAll(heap);
		const inserted: HeapNode = { id: `n${nextId}`, value, status: 'inserted' };
		nextId += 1;
		arr.push(inserted);

		// Swim up: while i > 1 and arr[i] < arr[floor(i/2)], swap with parent.
		let i = arr.length - 1;
		while (i > 1) {
			const parent = Math.floor(i / 2);
			const child = arr[i];
			const par = arr[parent];
			if (!child || !par || child.value >= par.value) break;
			arr[i] = { ...par, status: 'swapped' };
			arr[parent] = { ...child, status: 'swapped' };
			i = parent;
		}
		if (arr[1]) arr[1] = { ...arr[1], status: arr[1].status === 'swapped' ? 'swapped' : 'root' };

		heap = arr;
		message = { kind: 'add', value };
	}

	function removeMin() {
		if (size === 0) {
			message = { kind: 'empty' };
			return;
		}
		const arr = settleAll(heap);
		const root = arr[1];
		const removed = root ? root.value : 0;

		// Move last into root, drop last slot.
		const last = arr.pop();
		if (arr.length > 1 && last) {
			arr[1] = { ...last, status: 'swapped' };
		}
		const newSize = arr.length - 1;

		// Sink from i = 1: pick the smaller existing child; swap if child < arr[i].
		let i = 1;
		while (true) {
			const left = 2 * i;
			const right = 2 * i + 1;
			let smaller = -1;
			if (left <= newSize && arr[left]) smaller = left;
			if (right <= newSize && arr[right]) {
				const r = arr[right];
				const l = smaller >= 0 ? arr[smaller] : null;
				if (r && (!l || r.value < l.value)) smaller = right;
			}
			if (smaller < 0) break;
			const cur = arr[i];
			const child = arr[smaller];
			if (!cur || !child || child.value >= cur.value) break;
			arr[i] = { ...child, status: 'swapped' };
			arr[smaller] = { ...cur, status: 'swapped' };
			i = smaller;
		}
		if (arr[1]) arr[1] = { ...arr[1], status: arr[1].status === 'swapped' ? 'swapped' : 'root' };

		heap = arr;
		message = { kind: 'removeMin', value: removed };
	}

	function reset() {
		heap = [null];
		cursor = 0;
		nextId = 0;
		message = { kind: 'initial' };
	}

	function statusLabel(status: NodeStatus): string {
		if (status === 'inserted') return copy.statusLabels.inserted;
		if (status === 'swapped') return copy.statusLabels.swapped;
		if (status === 'root') return copy.statusLabels.root;
		return copy.statusLabels.settled;
	}

	function statusClass(status: NodeStatus): string {
		if (status === 'inserted') return 'border-accent bg-highlight-med text-accent';
		if (status === 'swapped') return 'border-gold border-dashed text-gold';
		if (status === 'root') return 'border-foam text-foam';
		return 'border-line text-muted';
	}

	function strokeColor(status: NodeStatus): string {
		if (status === 'inserted') return 'var(--color-accent)';
		if (status === 'swapped') return 'var(--color-gold)';
		if (status === 'root') return 'var(--color-foam)';
		return 'var(--color-line)';
	}

	function fillColor(status: NodeStatus): string {
		if (status === 'inserted') return 'var(--color-highlight-med)';
		return 'var(--color-bg)';
	}

	function textColor(status: NodeStatus): string {
		if (status === 'inserted') return 'var(--color-accent)';
		if (status === 'swapped') return 'var(--color-gold)';
		if (status === 'root') return 'var(--color-foam)';
		return 'var(--color-muted)';
	}
</script>

<article class="study-card min-w-0 p-5">
	<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
	<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
	<p class="mt-2 text-sm leading-6 text-muted">{messageText}</p>

	<div class="mt-5 flex flex-wrap gap-2">
		<button type="button" class="study-btn" onclick={add}>{copy.addLabel}</button>
		<button type="button" class="study-btn" onclick={removeMin} disabled={size === 0}>
			{copy.removeLabel}
		</button>
		<button type="button" class="study-btn" onclick={reset}>{copy.resetLabel}</button>
	</div>

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.arrayLabel}</span>
		<div class="mt-2 overflow-x-auto">
			<div class="flex min-w-full gap-2">
				<div
					class="min-h-16 min-w-[2.75rem] flex-1 border border-line border-dashed bg-bg p-1 text-center opacity-50"
				>
					<span class="block font-mono text-[10px] text-faint">0</span>
					<span class="mt-3 block font-mono text-xs text-faint">{copy.emptyLabel}</span>
				</div>
				{#each arrayCells as cell (cell.node.id)}
					<div
						animate:flip={{ duration: motion.current ? 0 : 220 }}
						in:scale={{ duration: motion.current ? 0 : 160 }}
						class={`min-h-16 min-w-[2.75rem] flex-1 border bg-bg p-1 text-center font-mono text-sm motion-reduce:transition-none ${statusClass(cell.node.status)}`}
					>
						<span class="block text-[10px] text-faint">{cell.index}</span>
						<span class="block text-[10px] uppercase">{statusLabel(cell.node.status)}</span>
						<span>{cell.node.value}</span>
					</div>
				{/each}
				{#if size === 0}
					<div
						class="flex min-h-16 min-w-[2.75rem] flex-1 items-center justify-center border border-line bg-bg p-1 text-center font-mono text-xs text-faint"
					>
						{copy.emptyLabel}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.treeLabel}</span>
		<div class="mt-2 overflow-x-auto">
			{#if size > 0}
				<svg
					viewBox={`0 0 ${VIEW_W} ${viewHeight}`}
					class="min-w-[26rem] w-full"
					role="img"
					aria-label={copy.treeLabel}
				>
					{#each placedEdges as edge (edge.id)}
						<line
							x1={edge.x1}
							y1={edge.y1}
							x2={edge.x2}
							y2={edge.y2}
							stroke="var(--color-line)"
							stroke-width="1.5"
						/>
					{/each}
					{#each placedNodes as placed (placed.node.id)}
						<g>
							<circle
								cx={placed.x}
								cy={placed.y}
								r={NODE_R}
								fill={fillColor(placed.node.status)}
								stroke={strokeColor(placed.node.status)}
								stroke-width="2"
							/>
							<text
								x={placed.x}
								y={placed.y + 4}
								text-anchor="middle"
								class="font-mono text-[11px]"
								fill={textColor(placed.node.status)}
							>
								{placed.node.value}
							</text>
							<text
								x={placed.x}
								y={placed.y - NODE_R - 4}
								text-anchor="middle"
								class="font-mono text-[9px]"
								fill="var(--color-faint)"
							>
								{placed.index}
							</text>
						</g>
					{/each}
				</svg>
			{:else}
				<p class="border border-line bg-bg px-3 py-6 text-center text-sm text-faint">
					{copy.emptyLabel}
				</p>
			{/if}
		</div>
	</div>

	{#if heap[1]}
		<p class="mt-4 text-sm text-muted">
			<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.minLabel}</span>
			<span class="ml-2 font-mono text-foam">{heap[1].value}</span>
		</p>
	{/if}
</article>
