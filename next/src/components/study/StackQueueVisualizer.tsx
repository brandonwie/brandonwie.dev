'use client';

import { useState } from 'react';

import type { StackQueueVisualizerCopy } from '../../data/study';
import { KeyedMotion } from '../../motion/KeyedMotion';
import { useReducedMotion } from '../../motion/useReducedMotion';

interface Item {
	id: number;
	label: string;
}

const initialItems = (): Item[] => [
	{ id: 0, label: 'A' },
	{ id: 1, label: 'B' },
	{ id: 2, label: 'C' },
];

/**
 * PORT NOTE — flip without the fly. The Svelte original pairs
 * `animate:flip` (180 ms) with `in:fly`/`out:fly` intros and outros;
 * `KeyedMotion` ports flip plus fade/scale enters only, and outros are
 * absent by design (see its contract), so the lists keep the flip and the
 * fly becomes an instant appear. Same tradeoff the Slice 4 WIP ports made
 * for `in:fade` (Mst, GraphTraversal render those statically).
 */
export default function StackQueueVisualizer({ copy }: { copy: StackQueueVisualizerCopy }) {
	const [stackItems, setStackItems] = useState<Item[]>(initialItems);
	const [nextStackId, setNextStackId] = useState(3);
	const [queueItems, setQueueItems] = useState<Item[]>(initialItems);
	const [nextQueueId, setNextQueueId] = useState(3);
	const reduced = useReducedMotion();

	const flipDuration = reduced ? 0 : 180;

	function nextLabel(length: number): string {
		const letter = String.fromCharCode(65 + (length % 26));
		const round = Math.floor(length / 26);
		return round === 0 ? letter : `${letter}${round + 1}`;
	}

	function addStack() {
		if (stackItems.length < 6) {
			setStackItems([...stackItems, { id: nextStackId, label: nextLabel(stackItems.length) }]);
			setNextStackId(nextStackId + 1);
		}
	}

	function popStack() {
		if (stackItems.length > 0) setStackItems(stackItems.slice(0, -1));
	}

	function enqueue() {
		if (queueItems.length < 6) {
			setQueueItems([...queueItems, { id: nextQueueId, label: nextLabel(nextQueueId) }]);
			setNextQueueId(nextQueueId + 1);
		}
	}

	function dequeue() {
		if (queueItems.length > 0) setQueueItems(queueItems.slice(1));
	}

	function reset() {
		setStackItems(initialItems());
		setNextStackId(3);
		setQueueItems(initialItems());
		setNextQueueId(3);
	}

	return (
		<article className="study-card min-w-0 p-5 lg:col-span-2">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
					<p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
				</div>
				<button className="study-btn" type="button" onClick={reset}>
					↺ {copy.resetLabel}
				</button>
			</div>

			<div className="mt-5 grid gap-5 md:grid-cols-2">
				<div>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="font-mono text-xs uppercase tracking-wider text-faint">
							{copy.stackLabel}
						</p>
						<div className="flex flex-wrap gap-2">
							<button className="study-btn" type="button" onClick={addStack}>
								+ {copy.pushLabel}
							</button>
							<button className="study-btn" type="button" onClick={popStack}>
								- {copy.popLabel}
							</button>
						</div>
					</div>
					<KeyedMotion className="mt-3 flex min-h-28 flex-col-reverse gap-2 border border-line bg-bg p-3">
						{stackItems.map((item, index) => (
							<div
								key={item.id}
								data-motion-key={item.id}
								data-motion-flip={flipDuration}
								className="border border-accent px-3 py-2 text-center font-mono text-sm text-accent"
							>
								<span className="mr-2 text-[10px] uppercase text-faint">
									{index === stackItems.length - 1 ? copy.stackRoles.top : copy.stackRoles.held}
								</span>
								{item.label}
							</div>
						))}
					</KeyedMotion>
				</div>

				<div>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="font-mono text-xs uppercase tracking-wider text-faint">
							{copy.queueLabel}
						</p>
						<div className="flex flex-wrap gap-2">
							<button className="study-btn" type="button" onClick={enqueue}>
								+ {copy.enqueueLabel}
							</button>
							<button className="study-btn" type="button" onClick={dequeue}>
								- {copy.dequeueLabel}
							</button>
						</div>
					</div>
					<KeyedMotion className="mt-3 flex min-h-28 items-center gap-2 overflow-x-auto border border-line bg-bg p-3">
						{queueItems.map((item, index) => (
							<div
								key={item.id}
								data-motion-key={item.id}
								data-motion-flip={flipDuration}
								className="min-w-16 border border-foam px-3 py-2 text-center font-mono text-sm text-foam"
							>
								<span className="block text-[10px] uppercase text-faint">
									{index === 0
										? copy.queueRoles.front
										: index === queueItems.length - 1
											? copy.queueRoles.back
											: copy.queueRoles.wait}
								</span>
								{item.label}
							</div>
						))}
					</KeyedMotion>
				</div>
			</div>
		</article>
	);
}
