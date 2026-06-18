<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';

	type ItemStatus = 'stable' | 'inserted' | 'shifted' | 'copied';
	interface Item {
		id: string;
		label: string;
		status: ItemStatus;
	}

	let {
		operationLabel = 'Operation',
		indexLabel = 'Index',
	}: { operationLabel?: string; indexLabel?: string } = $props();

	let items = $state<Item[]>([
		{ id: 'a', label: 'A', status: 'stable' },
		{ id: 'b', label: 'B', status: 'stable' },
		{ id: 'c', label: 'C', status: 'stable' },
		{ id: 'd', label: 'D', status: 'stable' },
	]);
	let capacity = $state(6);
	let operation = $state<'insert' | 'remove' | 'resize'>('insert');
	let index = $state(2);
	let nextId = $state(0);
	let copyRun = $state(0);
	let message = $state('Pick an operation, then apply it to watch positions change.');
	let reduceMotion = $state(false);

	const emptySlots = $derived(Math.max(capacity - items.length, 0));

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	function clean(itemsToClean = items): Item[] {
		return itemsToClean.map((item) => ({ ...item, status: 'stable' }));
	}

	function applyOperation() {
		if (operation === 'resize') {
			capacity *= 2;
			copyRun += 1;
			items = clean().map((item, itemIndex) => ({
				...item,
				id: `${item.id}-copy-${copyRun}-${itemIndex}`,
				status: 'copied',
			}));
			message = `Resize: copy ${items.length} items into a capacity-${capacity} backing array.`;
			return;
		}

		const safeIndex = Math.min(index, items.length);
		if (operation === 'insert') {
			if (items.length === capacity) capacity *= 2;
			const inserted = { id: `x${nextId}`, label: 'X', status: 'inserted' as const };
			nextId += 1;
			items = [
				...clean(items.slice(0, safeIndex)),
				inserted,
				...clean(items.slice(safeIndex)).map((item) => ({ ...item, status: 'shifted' as const })),
			];
			message = `Insert at index ${safeIndex}: new item lands, old items at and after the index shift right.`;
			return;
		}

		if (items.length === 0) return;
		const removeIndex = Math.min(index, items.length - 1);
		items = clean(items.filter((_, itemIndex) => itemIndex !== removeIndex)).map(
			(item, itemIndex) => ({
				...item,
				status: itemIndex >= removeIndex ? 'shifted' : 'stable',
			}),
		);
		message = `Remove at index ${removeIndex}: later items shift left to close the gap.`;
	}

	function reset() {
		capacity = 6;
		nextId = 0;
		copyRun = 0;
		items = [
			{ id: 'a', label: 'A', status: 'stable' },
			{ id: 'b', label: 'B', status: 'stable' },
			{ id: 'c', label: 'C', status: 'stable' },
			{ id: 'd', label: 'D', status: 'stable' },
		];
		message = 'Pick an operation, then apply it to watch positions change.';
	}

	function statusLabel(status: ItemStatus): string {
		if (status === 'inserted') return 'new';
		if (status === 'shifted') return 'shift';
		if (status === 'copied') return 'copy';
		return 'keep';
	}

	function statusClass(status: ItemStatus): string {
		if (status === 'inserted') return 'border-accent bg-highlight-med text-accent';
		if (status === 'shifted') return 'border-gold border-dashed text-gold';
		if (status === 'copied') return 'border-foam border-double text-foam';
		return 'border-line text-muted';
	}
</script>

<article class="min-w-0 border border-line bg-surface p-5">
	<h3 class="text-lg font-semibold text-ink">ArrayList backing array</h3>
	<p class="mt-2 text-sm leading-6 text-muted">{message}</p>

	<div class="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
		<div>
			<label class="font-mono text-xs uppercase tracking-wider text-faint" for="array-operation">
				{operationLabel}
			</label>
			<select
				id="array-operation"
				class="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm text-ink"
				bind:value={operation}
			>
				<option value="insert">addAtIndex</option>
				<option value="remove">removeAtIndex</option>
				<option value="resize">resize copy</option>
			</select>
		</div>
		<div>
			<label class="font-mono text-xs uppercase tracking-wider text-faint" for="array-index">
				{indexLabel}: {index}
			</label>
			<input
				id="array-index"
				class="mt-3 w-full accent-current"
				type="range"
				min="0"
				max={Math.max(items.length - (operation === 'insert' ? 0 : 1), 0)}
				step="1"
				bind:value={index}
				disabled={operation === 'resize'}
			/>
		</div>
		<button
			type="button"
			class="border border-line bg-bg px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
			onclick={applyOperation}
		>
			Apply
		</button>
		<button
			type="button"
			class="border border-line bg-bg px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
			onclick={reset}
		>
			Reset
		</button>
	</div>

	<div class="mt-5 overflow-x-auto">
		<div
			class="grid min-w-full gap-2"
			style={`grid-template-columns: repeat(${capacity}, minmax(2.75rem, 1fr));`}
		>
			{#each items as item, slot (item.id)}
				<div
					animate:flip={{ duration: reduceMotion ? 0 : 220 }}
					in:scale={{ duration: reduceMotion ? 0 : 160 }}
					class={`min-h-16 border bg-bg p-1 text-center font-mono text-sm motion-reduce:transition-none ${statusClass(item.status)}`}
				>
					<span class="block text-[10px] text-faint">index {slot}</span>
					<span class="block text-[10px] uppercase">{statusLabel(item.status)}</span>
					<span>{item.label}</span>
				</div>
			{/each}
			{#each Array.from({ length: emptySlots }) as _, offset (`empty-${offset}`)}
				<div class="min-h-16 border border-line bg-bg p-1 text-center">
					<span class="block font-mono text-[10px] text-faint">index {items.length + offset}</span>
					<span class="mt-3 block font-mono text-xs text-faint">empty</span>
				</div>
			{/each}
		</div>
	</div>
</article>
