/**
 * The HashMap visualizer's table, as a pure state machine.
 *
 * WHY IT LEFT THE COMPONENT. In the Svelte original the insert step reads
 * `size` immediately after assigning `chains`, and gets the new value: `size`
 * is a `$derived`, and a derived re-computes on read. React has no equivalent
 * — `useState` values are constant for the render that closed over them — so a
 * literal transcription would test the load factor against the size from
 * before the insert and resize one step late. Every state that participates in
 * that decision therefore moves into one object and one pure transition, where
 * "after the insert" is just the next value.
 *
 * The second reason is evidence. `assert-slice2-motion.ts` drives `insert`
 * eight times and checks the whole collision, probe and resize sequence
 * without a browser, a DOM, or React. That is only possible because the model
 * is a function of its input.
 *
 * The arithmetic, the queue, and the messages are unchanged from
 * `src/lib/components/study/HashMapVisualizer.svelte`.
 */

export type Strategy = 'chaining' | 'probing';
export type SlotStatus = 'placed' | 'collision' | 'probed';

export interface ChainNode {
	id: string;
	key: number;
	status: SlotStatus;
}

export interface ProbeSlot {
	key: number;
	status: SlotStatus;
}

export type MessageState =
	| { kind: 'initial' }
	| { kind: 'place'; key: number; index: number }
	| { kind: 'collide'; key: number; index: number }
	| { kind: 'probe'; key: number; from: number; to: number }
	| { kind: 'resize'; capacity: number }
	| { kind: 'full' };

export interface TableState {
	strategy: Strategy;
	capacity: number;
	cursor: number;
	nodeId: number;
	chains: ChainNode[][];
	slots: (ProbeSlot | null)[];
	message: MessageState;
}

export const INITIAL_CAPACITY = 7;
export const RESIZE_CAPACITY = 17;
export const LOAD_FACTOR_LIMIT = 0.75;
// All ≡ 5 (mod 7) so every key collides at bucket 5; trailing keys spread after a resize.
export const INSERT_QUEUE = [5, 12, 19, 26, 33, 40, 3, 8];

export function emptyChains(size: number): ChainNode[][] {
	return Array.from({ length: size }, () => []);
}

export function emptySlots(size: number): (ProbeSlot | null)[] {
	return Array.from({ length: size }, () => null);
}

export function reset(strategy: Strategy): TableState {
	return {
		strategy,
		capacity: INITIAL_CAPACITY,
		cursor: 0,
		nodeId: 0,
		chains: emptyChains(INITIAL_CAPACITY),
		slots: emptySlots(INITIAL_CAPACITY),
		message: { kind: 'initial' },
	};
}

export function sizeOf(state: TableState): number {
	return state.strategy === 'chaining'
		? state.chains.reduce((total, chain) => total + chain.length, 0)
		: state.slots.filter((slot) => slot !== null).length;
}

export function loadFactor(state: TableState): number {
	return state.capacity === 0 ? 0 : sizeOf(state) / state.capacity;
}

export function isExhausted(state: TableState): boolean {
	return state.cursor >= INSERT_QUEUE.length;
}

function clearChainStatus(source: ChainNode[][]): ChainNode[][] {
	return source.map((chain) => chain.map((node) => ({ ...node, status: 'placed' as const })));
}

function clearSlotStatus(source: (ProbeSlot | null)[]): (ProbeSlot | null)[] {
	return source.map((slot) => (slot === null ? null : { ...slot, status: 'placed' as const }));
}

function liveKeys(state: TableState): number[] {
	if (state.strategy === 'chaining') {
		return state.chains.flatMap((chain) => chain.map((node) => node.key));
	}
	return state.slots.filter((slot): slot is ProbeSlot => slot !== null).map((slot) => slot.key);
}

/** Rehash every live key into a fresh capacity-17 table for the active strategy. */
function rehash(state: TableState): TableState {
	const keys = liveKeys(state);
	if (state.strategy === 'chaining') {
		const next = emptyChains(RESIZE_CAPACITY);
		let nodeId = state.nodeId;
		for (const key of keys) {
			next[key % RESIZE_CAPACITY].push({ id: `n${nodeId++}`, key, status: 'placed' });
		}
		return {
			...state,
			capacity: RESIZE_CAPACITY,
			nodeId,
			chains: next,
			message: { kind: 'resize', capacity: RESIZE_CAPACITY },
		};
	}
	const next = emptySlots(RESIZE_CAPACITY);
	for (const key of keys) {
		let probe = key % RESIZE_CAPACITY;
		while (next[probe] !== null) probe = (probe + 1) % RESIZE_CAPACITY;
		next[probe] = { key, status: 'placed' };
	}
	return {
		...state,
		capacity: RESIZE_CAPACITY,
		slots: next,
		message: { kind: 'resize', capacity: RESIZE_CAPACITY },
	};
}

function insertChaining(state: TableState, key: number): TableState {
	const index = key % state.capacity;
	const wasEmpty = state.chains[index].length === 0;
	const node: ChainNode = {
		id: `n${state.nodeId}`,
		key,
		status: wasEmpty ? 'placed' : 'collision',
	};
	return {
		...state,
		nodeId: state.nodeId + 1,
		chains: clearChainStatus(state.chains).map((chain, slot) =>
			slot === index ? [...chain, node] : chain,
		),
		message: wasEmpty ? { kind: 'place', key, index } : { kind: 'collide', key, index },
	};
}

function insertProbing(state: TableState, key: number): TableState {
	const home = key % state.capacity;
	let landing = home;
	while (state.slots[landing] !== null) landing = (landing + 1) % state.capacity;
	const probed = landing !== home;
	const next = clearSlotStatus(state.slots);
	next[landing] = { key, status: probed ? 'probed' : 'placed' };
	return {
		...state,
		slots: next,
		message: probed
			? { kind: 'probe', key, from: home, to: landing }
			: { kind: 'place', key, index: home },
	};
}

export function insert(state: TableState): TableState {
	if (isExhausted(state)) {
		return { ...state, message: { kind: 'full' } };
	}
	const key = INSERT_QUEUE[state.cursor];
	const advanced = { ...state, cursor: state.cursor + 1 };
	const inserted =
		state.strategy === 'chaining' ? insertChaining(advanced, key) : insertProbing(advanced, key);
	return loadFactor(inserted) > LOAD_FACTOR_LIMIT ? rehash(inserted) : inserted;
}
