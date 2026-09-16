'use client';

import { useState } from 'react';

import type { ArrayListVisualizerCopy } from '../../data/study';
import { KeyedMotion } from '../../motion/KeyedMotion';
import { useReducedMotion } from '../../motion/useReducedMotion';

type ItemStatus = 'stable' | 'inserted' | 'shifted' | 'copied';

interface Item {
	id: string;
	label: string;
	status: ItemStatus;
}

type MessageState =
	| { kind: 'initial' }
	| { kind: 'resize'; count: number; capacity: number }
	| { kind: 'insert'; index: number }
	| { kind: 'remove'; index: number };

const INITIAL_ITEMS: Item[] = [
	{ id: 'a', label: 'A', status: 'stable' },
	{ id: 'b', label: 'B', status: 'stable' },
	{ id: 'c', label: 'C', status: 'stable' },
	{ id: 'd', label: 'D', status: 'stable' },
];

const INITIAL_CAPACITY = 6;

function clean(itemsToClean: Item[]): Item[] {
	return itemsToClean.map((item) => ({ ...item, status: 'stable' as const }));
}

/**
 * PORT NOTE — same `KeyedMotion` shape as `HeapVisualizer`. The Svelte
 * original puts `animate:flip` (220 ms) and `in:scale` (160 ms) on each slot;
 * those become `data-motion-flip` / `data-motion-enter` attributes read by
 * the shared container. The empty-slot cells are static in both versions.
 */
export default function ArrayListVisualizer({ copy }: { copy: ArrayListVisualizerCopy }) {
	const [items, setItems] = useState<Item[]>(INITIAL_ITEMS);
	const [capacity, setCapacity] = useState(INITIAL_CAPACITY);
	const [operation, setOperation] = useState<'insert' | 'remove' | 'resize'>('insert');
	const [index, setIndex] = useState(2);
	const [nextId, setNextId] = useState(0);
	const [copyRun, setCopyRun] = useState(0);
	const [message, setMessage] = useState<MessageState>({ kind: 'initial' });
	const reduced = useReducedMotion();

	const flipDuration = reduced ? 0 : 220;
	const enterDuration = reduced ? 0 : 160;

	const emptySlots = Math.max(capacity - items.length, 0);
	let messageText = copy.messages.initial;
	if (message.kind === 'resize')
		messageText = copy.messages.resize(message.count, message.capacity);
	else if (message.kind === 'insert') messageText = copy.messages.insert(message.index);
	else if (message.kind === 'remove') messageText = copy.messages.remove(message.index);

	/**
	 * Applies the selected operation to the backing array:
	 * - `resize`: doubles capacity and re-ids every item so the copy animates as an insertion
	 * - `insert`: inserts a new item at the clamped index, shifting later items right; auto-resizes when full
	 * - `remove`: removes the item at the clamped index, shifting later items left to close the gap
	 */
	function applyOperation() {
		if (operation === 'resize') {
			const nextCapacity = capacity * 2;
			const nextRun = copyRun + 1;
			setCapacity(nextCapacity);
			setCopyRun(nextRun);
			setItems(
				clean(items).map((item, itemIndex) => ({
					...item,
					id: `${item.id}-copy-${nextRun}-${itemIndex}`,
					status: 'copied' as const,
				})),
			);
			setMessage({ kind: 'resize', count: items.length, capacity: nextCapacity });
			return;
		}

		const safeIndex = Math.min(index, items.length);
		if (operation === 'insert') {
			if (items.length === capacity) setCapacity(capacity * 2);
			const inserted: Item = { id: `x${nextId}`, label: 'X', status: 'inserted' };
			setNextId(nextId + 1);
			setItems([
				...clean(items.slice(0, safeIndex)),
				inserted,
				...clean(items.slice(safeIndex)).map((item) => ({ ...item, status: 'shifted' as const })),
			]);
			setMessage({ kind: 'insert', index: safeIndex });
			return;
		}

		if (items.length === 0) return;
		const removeIndex = Math.min(index, items.length - 1);
		setItems(
			clean(items.filter((_, itemIndex) => itemIndex !== removeIndex)).map((item, itemIndex) => ({
				...item,
				status: itemIndex >= removeIndex ? ('shifted' as const) : ('stable' as const),
			})),
		);
		setMessage({ kind: 'remove', index: removeIndex });
	}

	function reset() {
		setCapacity(INITIAL_CAPACITY);
		setNextId(0);
		setCopyRun(0);
		setItems(INITIAL_ITEMS);
		setMessage({ kind: 'initial' });
	}

	function statusLabel(status: ItemStatus): string {
		if (status === 'inserted') return copy.status.inserted;
		if (status === 'shifted') return copy.status.shifted;
		if (status === 'copied') return copy.status.copied;
		return copy.status.stable;
	}

	function statusClass(status: ItemStatus): string {
		if (status === 'inserted') return 'border-accent bg-highlight-med text-accent';
		if (status === 'shifted') return 'border-gold border-dashed text-gold';
		if (status === 'copied') return 'border-foam border-double text-foam';
		return 'border-line text-muted';
	}

	return (
		<article className="study-card min-w-0 p-5">
			<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
			<p className="mt-2 text-sm leading-6 text-muted">{messageText}</p>

			<div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
				<div>
					<label
						className="font-mono text-xs uppercase tracking-wider text-faint"
						htmlFor="array-operation"
					>
						{copy.operationLabel}
					</label>
					<select
						id="array-operation"
						className="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm text-ink"
						value={operation}
						onChange={(event) => setOperation(event.currentTarget.value as typeof operation)}
					>
						<option value="insert">{copy.options.insert}</option>
						<option value="remove">{copy.options.remove}</option>
						<option value="resize">{copy.options.resize}</option>
					</select>
				</div>
				<div>
					<label
						className="font-mono text-xs uppercase tracking-wider text-faint"
						htmlFor="array-index"
					>
						{copy.indexLabel}: {index}
					</label>
					<input
						id="array-index"
						className="mt-3 w-full accent-current"
						type="range"
						min="0"
						max={Math.max(items.length - (operation === 'insert' ? 0 : 1), 0)}
						step="1"
						value={index}
						onChange={(event) => setIndex(Number(event.currentTarget.value))}
						disabled={operation === 'resize'}
					/>
				</div>
				<button type="button" className="study-btn" onClick={applyOperation}>
					{copy.applyLabel}
				</button>
				<button type="button" className="study-btn" onClick={reset}>
					{copy.resetLabel}
				</button>
			</div>

			<KeyedMotion className="mt-5 overflow-x-auto">
				<div
					className="grid min-w-full gap-2"
					style={{ gridTemplateColumns: `repeat(${capacity}, minmax(2.75rem, 1fr))` }}
				>
					{items.map((item, slot) => (
						<div
							key={item.id}
							data-motion-key={item.id}
							data-motion-flip={flipDuration}
							data-motion-enter={`scale:${enterDuration}`}
							className={`min-h-16 border bg-bg p-1 text-center font-mono text-sm motion-reduce:transition-none ${statusClass(item.status)}`}
						>
							<span className="block text-[10px] text-faint">
								{copy.indexPrefix} {slot}
							</span>
							<span className="block text-[10px] uppercase">{statusLabel(item.status)}</span>
							<span>{item.label}</span>
						</div>
					))}
					{Array.from({ length: emptySlots }).map((_, offset) => (
						<div
							key={`empty-${offset}`}
							className="min-h-16 border border-line bg-bg p-1 text-center"
						>
							<span className="block font-mono text-[10px] text-faint">
								{copy.indexPrefix} {items.length + offset}
							</span>
							<span className="mt-3 block font-mono text-xs text-faint">{copy.emptyLabel}</span>
						</div>
					))}
				</div>
			</KeyedMotion>
		</article>
	);
}
