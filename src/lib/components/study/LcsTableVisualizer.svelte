<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { LcsTableCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { fade } from 'svelte/transition';

	let { copy }: { copy: LcsTableCopy } = $props();

	let step = $state(0);
	const motion = useReducedMotion();

	type Role = keyof LcsTableCopy['roleLabels'];
	type Provenance = 'diagonal' | 'top' | 'left' | 'tie';

	interface Cell {
		i: number;
		j: number;
	}

	interface LcsFrame {
		/** Highest row index filled so far. Row 0 and column 0 are always visible. */
		filledRow: number;
		/** Row being filled in this frame, or -1 while backtracking. */
		focusRow: number;
		/** Cells the backtrack walk has reached, oldest first; the last one is current. */
		path: Cell[];
		/** Characters the walk has taken, in walk order. */
		taken: string[];
		/** Whether this frame took a character (a diagonal step). */
		justTook: boolean;
		/** Whether the bottom-right cell is flagged as the answer. */
		answer: boolean;
		/** The reconstructed subsequence, set once the walk ends. */
		result?: string;
	}

	// Worked example: x = BLOG down the rows, y = BOG across the columns.
	const X = ['B', 'L', 'O', 'G'];
	const Y = ['B', 'O', 'G'];
	const EMPTY = '∅';

	// L[i][j] = LCS length of the prefixes x[1..i] and y[1..j].
	const TABLE: number[][] = [
		[0, 0, 0, 0],
		[0, 1, 1, 1],
		[0, 1, 1, 1],
		[0, 1, 2, 2],
		[0, 1, 2, 3],
	];

	// Where each filled cell took its value from; null across the base row/column.
	const FROM: (Provenance | null)[][] = [
		[null, null, null, null],
		[null, 'diagonal', 'left', 'left'],
		[null, 'top', 'tie', 'tie'],
		[null, 'top', 'diagonal', 'left'],
		[null, 'top', 'top', 'diagonal'],
	];

	const ARROWS: Record<Provenance, string> = {
		diagonal: '↖',
		top: '↑',
		left: '←',
		tie: '↑←',
	};

	// Five fill frames (one per row) then four backtrack frames.
	const frames: LcsFrame[] = [
		{ filledRow: 0, focusRow: 0, path: [], taken: [], justTook: false, answer: false },
		{ filledRow: 1, focusRow: 1, path: [], taken: [], justTook: false, answer: false },
		{ filledRow: 2, focusRow: 2, path: [], taken: [], justTook: false, answer: false },
		{ filledRow: 3, focusRow: 3, path: [], taken: [], justTook: false, answer: false },
		{ filledRow: 4, focusRow: 4, path: [], taken: [], justTook: false, answer: true },
		{
			filledRow: 4,
			focusRow: -1,
			path: [{ i: 4, j: 3 }],
			taken: ['G'],
			justTook: true,
			answer: true,
		},
		{
			filledRow: 4,
			focusRow: -1,
			path: [
				{ i: 4, j: 3 },
				{ i: 3, j: 2 },
			],
			taken: ['G', 'O'],
			justTook: true,
			answer: true,
		},
		{
			filledRow: 4,
			focusRow: -1,
			path: [
				{ i: 4, j: 3 },
				{ i: 3, j: 2 },
				{ i: 2, j: 1 },
			],
			taken: ['G', 'O'],
			justTook: false,
			answer: true,
		},
		{
			filledRow: 4,
			focusRow: -1,
			path: [
				{ i: 4, j: 3 },
				{ i: 3, j: 2 },
				{ i: 2, j: 1 },
				{ i: 1, j: 1 },
			],
			taken: ['G', 'O', 'B'],
			justTook: true,
			answer: true,
			result: 'BOG',
		},
	];

	const frame = $derived(frames[step]);
	const current = $derived(frame.path.length > 0 ? frame.path[frame.path.length - 1] : null);
	const backtracking = $derived(current !== null);
	const activeRow = $derived(current ? current.i : frame.focusRow);
	const activeCol = $derived(current ? current.j : -1);

	const COL_W = 62;
	const ROW_H = 40;
	const HEAD_W = 46;
	const HEAD_H = 32;

	// Column headers: index 0 is the empty prefix, then y[1..3].
	const columnHeads = [EMPTY, ...Y].map((label, index) => ({
		index,
		label,
		x: HEAD_W + index * COL_W + COL_W / 2,
	}));

	// Row headers: index 0 is the empty prefix, then x[1..4].
	const rowHeads = [EMPTY, ...X].map((label, index) => ({
		index,
		label,
		y: HEAD_H + index * ROW_H,
	}));

	interface CellView {
		key: string;
		x: number;
		y: number;
		value: number | null;
		arrow: string | null;
		role: Role | null;
		badge: boolean;
		walking: boolean;
	}

	// One view model per table cell: geometry here, narration in copy.steps.
	const grid = $derived.by(() => {
		const cells: CellView[] = [];
		TABLE.forEach((row, i) => {
			row.forEach((value, j) => {
				const key = `${i}-${j}`;
				const x = HEAD_W + j * COL_W;
				const y = HEAD_H + i * ROW_H;
				const base = i === 0 || j === 0;
				if (!base && i > frame.filledRow) {
					cells.push({
						key,
						x,
						y,
						value: null,
						arrow: null,
						role: null,
						badge: false,
						walking: false,
					});
					return;
				}
				const from = FROM[i][j];
				const onPath = frame.path.some((cell) => cell.i === i && cell.j === j);
				const walking = current !== null && current.i === i && current.j === j;
				let role: Role | null = null;
				let badge = false;
				if (onPath) {
					role = 'backtrack';
					badge = walking;
				} else if (frame.answer && i === TABLE.length - 1 && j === row.length - 1) {
					role = 'answer';
					badge = true;
				} else if (base) {
					role = 'base';
					badge = frame.focusRow === 0;
				} else if (i === frame.focusRow) {
					role = from === 'diagonal' ? 'match' : 'mismatch';
					badge = true;
				}
				cells.push({
					key,
					x,
					y,
					value,
					arrow: from ? ARROWS[from] : null,
					role,
					badge,
					walking,
				});
			});
		});
		return cells;
	});

	function cellClass(role: Role | null): string {
		if (role === 'match') return 'fill-highlight-med stroke-foam';
		if (role === 'mismatch') return 'fill-bg stroke-accent';
		if (role === 'backtrack' || role === 'answer') return 'fill-highlight-med stroke-gold';
		return 'fill-bg stroke-line';
	}

	function textClass(role: Role | null): string {
		if (role === 'match') return 'fill-foam';
		if (role === 'mismatch') return 'fill-accent';
		if (role === 'backtrack' || role === 'answer') return 'fill-gold';
		if (role === 'base') return 'fill-faint';
		return 'fill-muted';
	}

	function headClass(active: boolean): string {
		if (!active) return 'fill-muted';
		return backtracking ? 'fill-gold' : 'fill-foam';
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
		<svg viewBox="0 0 300 236" class="min-w-[17rem] max-w-full" role="img" aria-label={copy.title}>
			<text x={HEAD_W / 2} y="24" text-anchor="middle" class="fill-faint font-mono text-[9px]">
				x \ y
			</text>

			{#each columnHeads as head (head.index)}
				<g>
					<text x={head.x} y="12" text-anchor="middle" class="fill-faint font-mono text-[8px]">
						{head.index}
					</text>
					<text
						x={head.x}
						y="26"
						text-anchor="middle"
						class={`font-mono text-[13px] ${headClass(head.index === activeCol)}`}
					>
						{head.label}
					</text>
				</g>
			{/each}

			{#each rowHeads as head (head.index)}
				<g>
					<text x="14" y={head.y + 24} text-anchor="middle" class="fill-faint font-mono text-[8px]">
						{head.index}
					</text>
					<text
						x="32"
						y={head.y + 25}
						text-anchor="middle"
						class={`font-mono text-[13px] ${headClass(head.index === activeRow)}`}
					>
						{head.label}
					</text>
				</g>
			{/each}

			{#each grid as cell (cell.key)}
				{@const role = cell.role}
				<g>
					<rect
						x={cell.x + 1.5}
						y={cell.y + 1.5}
						width={COL_W - 3}
						height={ROW_H - 3}
						stroke-width={cell.walking ? 2.5 : 1.5}
						class={`transition-all duration-200 motion-reduce:transition-none ${cellClass(role)}`}
					/>
					{#if cell.arrow}
						<text
							x={cell.x + 8}
							y={cell.y + 15}
							text-anchor="start"
							class={`font-mono text-[9px] ${textClass(role)}`}
						>
							{cell.arrow}
						</text>
					{/if}
					{#if cell.value !== null}
						<text
							x={cell.x + COL_W / 2}
							y={cell.y + 25}
							text-anchor="middle"
							class={`font-mono text-[14px] ${textClass(role)}`}
						>
							{cell.value}
						</text>
					{/if}
					{#if cell.badge && role}
						<text
							in:fade={{ duration: motion.current ? 0 : 120 }}
							x={cell.x + COL_W / 2}
							y={cell.y + 35}
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

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.takenLabel}</span>
		<div class="mt-2 flex flex-wrap gap-2">
			{#if frame.taken.length === 0}
				<span class="border border-line px-2.5 py-1 font-mono text-sm text-faint">—</span>
			{:else}
				{#each frame.taken as char, index (`${char}-${index}`)}
					<span
						in:fade={{ duration: motion.current ? 0 : 120 }}
						class={`border px-2.5 py-1 font-mono text-sm ${
							frame.justTook && index === frame.taken.length - 1
								? 'border-gold text-gold'
								: 'border-accent bg-highlight-med text-accent'
						}`}
					>
						{char}
					</span>
				{/each}
			{/if}
		</div>
	</div>

	<p class="mt-4 font-mono text-xs uppercase tracking-wider text-faint">
		{copy.resultLabel}: <span class="text-accent normal-case">{frame.result ?? '—'}</span>
	</p>

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step] ?? ''}
	</p>
</article>
