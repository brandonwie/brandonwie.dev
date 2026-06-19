<script lang="ts">
	import type { HashMapVisualizerCopy } from '$lib/data/study';
	import { useReducedMotion } from '$lib/useReducedMotion.svelte';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';

	let { copy }: { copy: HashMapVisualizerCopy } = $props();

	type Strategy = 'chaining' | 'probing';
	type SlotStatus = 'placed' | 'collision' | 'probed';

	interface ChainNode {
		id: string;
		key: number;
		status: SlotStatus;
	}
	interface ProbeSlot {
		key: number;
		status: SlotStatus;
	}

	type MessageState =
		| { kind: 'initial' }
		| { kind: 'place'; key: number; index: number }
		| { kind: 'collide'; key: number; index: number }
		| { kind: 'probe'; key: number; from: number; to: number }
		| { kind: 'resize'; capacity: number }
		| { kind: 'full' };

	const INITIAL_CAPACITY = 7;
	const RESIZE_CAPACITY = 17;
	const LOAD_FACTOR_LIMIT = 0.75;
	// All ≡ 5 (mod 7) so every key collides at bucket 5; trailing keys spread after a resize.
	const INSERT_QUEUE = [5, 12, 19, 26, 33, 40, 3, 8];

	const motion = useReducedMotion();

	let strategy = $state<Strategy>('chaining');
	let capacity = $state(INITIAL_CAPACITY);
	let cursor = $state(0);
	let nodeId = $state(0);
	let chains = $state<ChainNode[][]>(emptyChains(INITIAL_CAPACITY));
	let slots = $state<(ProbeSlot | null)[]>(emptySlots(INITIAL_CAPACITY));
	let message = $state<MessageState>({ kind: 'initial' });

	const size = $derived(
		strategy === 'chaining'
			? chains.reduce((total, chain) => total + chain.length, 0)
			: slots.filter((slot) => slot !== null).length,
	);
	const loadFactor = $derived(capacity === 0 ? 0 : size / capacity);
	const loadFactorText = $derived(`${size} / ${capacity} = ${loadFactor.toFixed(2)}`);
	const exhausted = $derived(cursor >= INSERT_QUEUE.length);

	const messageText = $derived.by(() => {
		if (message.kind === 'place') return copy.messages.place(message.key, message.index);
		if (message.kind === 'collide') return copy.messages.collide(message.key, message.index);
		if (message.kind === 'probe') return copy.messages.probe(message.key, message.from, message.to);
		if (message.kind === 'resize') return copy.messages.resize(message.capacity);
		if (message.kind === 'full') return copy.messages.full;
		return copy.messages.initial;
	});

	function emptyChains(size: number): ChainNode[][] {
		return Array.from({ length: size }, () => []);
	}

	function emptySlots(size: number): (ProbeSlot | null)[] {
		return Array.from({ length: size }, () => null);
	}

	function clearChainStatus(source: ChainNode[][]): ChainNode[][] {
		return source.map((chain) => chain.map((node) => ({ ...node, status: 'placed' as const })));
	}

	function clearSlotStatus(source: (ProbeSlot | null)[]): (ProbeSlot | null)[] {
		return source.map((slot) => (slot === null ? null : { ...slot, status: 'placed' as const }));
	}

	function liveKeys(): number[] {
		if (strategy === 'chaining') {
			return chains.flatMap((chain) => chain.map((node) => node.key));
		}
		return slots.filter((slot): slot is ProbeSlot => slot !== null).map((slot) => slot.key);
	}

	/** Rehash every live key into a fresh capacity-17 table for the active strategy. */
	function rehash() {
		const keys = liveKeys();
		capacity = RESIZE_CAPACITY;
		if (strategy === 'chaining') {
			const next = emptyChains(RESIZE_CAPACITY);
			for (const key of keys) {
				next[key % RESIZE_CAPACITY].push({ id: `n${nodeId++}`, key, status: 'placed' });
			}
			chains = next;
		} else {
			const next = emptySlots(RESIZE_CAPACITY);
			for (const key of keys) {
				let probe = key % RESIZE_CAPACITY;
				while (next[probe] !== null) probe = (probe + 1) % RESIZE_CAPACITY;
				next[probe] = { key, status: 'placed' };
			}
			slots = next;
		}
		message = { kind: 'resize', capacity: RESIZE_CAPACITY };
	}

	function insertChaining(key: number) {
		const index = key % capacity;
		const wasEmpty = chains[index].length === 0;
		const node: ChainNode = {
			id: `n${nodeId++}`,
			key,
			status: wasEmpty ? 'placed' : 'collision',
		};
		chains = clearChainStatus(chains).map((chain, slot) =>
			slot === index ? [...chain, node] : chain,
		);
		message = wasEmpty ? { kind: 'place', key, index } : { kind: 'collide', key, index };
	}

	function insertProbing(key: number) {
		const home = key % capacity;
		let landing = home;
		while (slots[landing] !== null) landing = (landing + 1) % capacity;
		const probed = landing !== home;
		const next = clearSlotStatus(slots);
		next[landing] = { key, status: probed ? 'probed' : 'placed' };
		slots = next;
		message = probed
			? { kind: 'probe', key, from: home, to: landing }
			: { kind: 'place', key, index: home };
	}

	function insert() {
		if (exhausted) {
			message = { kind: 'full' };
			return;
		}
		const key = INSERT_QUEUE[cursor];
		cursor += 1;
		if (strategy === 'chaining') insertChaining(key);
		else insertProbing(key);
		if (size / capacity > LOAD_FACTOR_LIMIT) rehash();
	}

	function reset() {
		capacity = INITIAL_CAPACITY;
		cursor = 0;
		nodeId = 0;
		chains = emptyChains(INITIAL_CAPACITY);
		slots = emptySlots(INITIAL_CAPACITY);
		message = { kind: 'initial' };
	}

	function onStrategyChange() {
		reset();
	}

	function statusLabel(status: SlotStatus): string {
		if (status === 'collision') return copy.statusLabels.collision;
		if (status === 'probed') return copy.statusLabels.probed;
		return copy.statusLabels.placed;
	}

	function statusClass(status: SlotStatus): string {
		if (status === 'collision') return 'border-gold border-dashed text-gold';
		if (status === 'probed') return 'border-foam text-foam';
		return 'border-accent bg-highlight-med text-accent';
	}
</script>

<article class="study-card min-w-0 p-5">
	<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
	<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
	<p class="mt-2 text-sm leading-6 text-muted">{messageText}</p>

	<div class="mt-5 grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
		<div>
			<label class="font-mono text-xs uppercase tracking-wider text-faint" for="hashmap-strategy">
				{copy.strategyLabel}
			</label>
			<select
				id="hashmap-strategy"
				class="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm text-ink"
				bind:value={strategy}
				onchange={onStrategyChange}
			>
				<option value="chaining">{copy.strategies.chaining}</option>
				<option value="probing">{copy.strategies.probing}</option>
			</select>
		</div>
		<button type="button" class="study-btn" onclick={insert} disabled={exhausted}>
			{copy.insertLabel}
		</button>
		<button type="button" class="study-btn" onclick={reset}>
			{copy.resetLabel}
		</button>
	</div>

	<p class="mt-4 font-mono text-xs uppercase tracking-wider text-faint">
		{copy.loadFactorLabel}: <span class="text-muted normal-case">{loadFactorText}</span>
	</p>

	<div class="mt-5 overflow-x-auto">
		{#if strategy === 'chaining'}
			<div class="grid min-w-[26rem] gap-2">
				{#each chains as chain, index (index)}
					<div class="flex items-center gap-2">
						<span class="w-8 shrink-0 text-right font-mono text-xs text-faint">{index}</span>
						<span class="shrink-0 font-mono text-xs text-faint">→</span>
						{#if chain.length === 0}
							<span class="font-mono text-xs text-faint">{copy.emptyLabel}</span>
						{:else}
							<div class="flex flex-wrap items-center gap-2">
								{#each chain as node, position (node.id)}
									<div
										animate:flip={{ duration: motion.current ? 0 : 220 }}
										in:scale={{ duration: motion.current ? 0 : 160 }}
										class="flex items-center gap-2 motion-reduce:transition-none"
									>
										{#if position > 0}
											<span class="font-mono text-xs text-faint">→</span>
										{/if}
										<div
											class={`min-w-12 border bg-bg p-1 text-center font-mono text-sm ${statusClass(node.status)}`}
										>
											<span class="block text-[10px] uppercase">{statusLabel(node.status)}</span>
											<span>{node.key}</span>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div
				class="grid min-w-full gap-2"
				style={`grid-template-columns: repeat(${capacity}, minmax(2.75rem, 1fr));`}
			>
				{#each slots as slot, index (index)}
					<div
						class={`min-h-16 border bg-bg p-1 text-center font-mono text-sm motion-reduce:transition-none ${slot === null ? 'border-line' : statusClass(slot.status)}`}
					>
						<span class="block text-[10px] text-faint">{index}</span>
						{#if slot === null}
							<span class="mt-3 block text-xs text-faint">{copy.emptyLabel}</span>
						{:else}
							<span class="block text-[10px] uppercase">{statusLabel(slot.status)}</span>
							<span>{slot.key}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</article>
