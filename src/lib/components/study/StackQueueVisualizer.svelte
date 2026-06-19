<script lang="ts">
	import type { StackQueueVisualizerCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';

	interface Item {
		id: number;
		label: string;
	}

	let { copy }: { copy: StackQueueVisualizerCopy } = $props();

	const initialItems = (): Item[] => [
		{ id: 0, label: 'A' },
		{ id: 1, label: 'B' },
		{ id: 2, label: 'C' },
	];

	let stackItems = $state<Item[]>(initialItems());
	let nextStackId = $state(3);
	let queueItems = $state<Item[]>(initialItems());
	let nextQueueId = $state(3);
	const motion = useReducedMotion();

	function nextLabel(length: number): string {
		const letter = String.fromCharCode(65 + (length % 26));
		const round = Math.floor(length / 26);
		return round === 0 ? letter : `${letter}${round + 1}`;
	}

	function addStack() {
		if (stackItems.length < 6) {
			stackItems = [...stackItems, { id: nextStackId, label: nextLabel(stackItems.length) }];
			nextStackId += 1;
		}
	}

	function popStack() {
		if (stackItems.length > 0) stackItems = stackItems.slice(0, -1);
	}

	function enqueue() {
		if (queueItems.length < 6) {
			queueItems = [...queueItems, { id: nextQueueId, label: nextLabel(nextQueueId) }];
			nextQueueId += 1;
		}
	}

	function dequeue() {
		if (queueItems.length > 0) queueItems = queueItems.slice(1);
	}

	function reset() {
		stackItems = initialItems();
		nextStackId = 3;
		queueItems = initialItems();
		nextQueueId = 3;
	}
</script>

<article class="study-card min-w-0 p-5 lg:col-span-2">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
		</div>
		<button class="study-btn" type="button" onclick={reset}>
			↺ {copy.resetLabel}
		</button>
	</div>

	<div class="mt-5 grid gap-5 md:grid-cols-2">
		<div>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="font-mono text-xs uppercase tracking-wider text-faint">{copy.stackLabel}</p>
				<div class="flex flex-wrap gap-2">
					<button class="study-btn" type="button" onclick={addStack}>+ {copy.pushLabel}</button>
					<button class="study-btn" type="button" onclick={popStack}>- {copy.popLabel}</button>
				</div>
			</div>
			<div class="mt-3 flex min-h-28 flex-col-reverse gap-2 border border-line bg-bg p-3">
				{#each stackItems as item, index (item.id)}
					<div
						animate:flip={{ duration: motion.current ? 0 : 180 }}
						in:fly={{ y: -12, duration: motion.current ? 0 : 160 }}
						out:fly={{ y: -12, duration: motion.current ? 0 : 120 }}
						class="border border-accent px-3 py-2 text-center font-mono text-sm text-accent"
					>
						<span class="mr-2 text-[10px] uppercase text-faint">
							{index === stackItems.length - 1 ? copy.stackRoles.top : copy.stackRoles.held}
						</span>
						{item.label}
					</div>
				{/each}
			</div>
		</div>

		<div>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="font-mono text-xs uppercase tracking-wider text-faint">{copy.queueLabel}</p>
				<div class="flex flex-wrap gap-2">
					<button class="study-btn" type="button" onclick={enqueue}>+ {copy.enqueueLabel}</button>
					<button class="study-btn" type="button" onclick={dequeue}>- {copy.dequeueLabel}</button>
				</div>
			</div>
			<div
				class="mt-3 flex min-h-28 items-center gap-2 overflow-x-auto border border-line bg-bg p-3"
			>
				{#each queueItems as item, index (item.id)}
					<div
						animate:flip={{ duration: motion.current ? 0 : 180 }}
						in:fly={{ x: 14, duration: motion.current ? 0 : 160 }}
						out:fly={{ x: -14, duration: motion.current ? 0 : 120 }}
						class="min-w-16 border border-foam px-3 py-2 text-center font-mono text-sm text-foam"
					>
						<span class="block text-[10px] uppercase text-faint">
							{index === 0
								? copy.queueRoles.front
								: index === queueItems.length - 1
									? copy.queueRoles.back
									: copy.queueRoles.wait}
						</span>
						{item.label}
					</div>
				{/each}
			</div>
		</div>
	</div>
</article>
