'use client';

import { useRef, useState } from 'react';

import type { HashMapVisualizerCopy } from '../../data/study';
import { useKeyedMotion } from '../../motion/useKeyedMotion';
import { useReducedMotion } from '../../motion/useReducedMotion';
import {
	insert as insertStep,
	isExhausted,
	loadFactor,
	reset as resetState,
	sizeOf,
	type MessageState,
	type SlotStatus,
	type Strategy,
	type TableState,
} from '../../study/hash-map-model';

/**
 * Sample 2 of 2 for the Slice 2 calibration: the keyed-list FLIP behavior
 * class, which covers four of the seventeen study visualizers and is the half
 * with no React equivalent.
 *
 * PORT NOTE — TWO SHAPE CHANGES, BOTH FORCED.
 *
 * The table state left the component for `study/hash-map-model.ts`, because
 * the insert step reads the post-insert size to decide whether to resize and
 * React state cannot be read that way mid-handler. See that file.
 *
 * `animate:flip` and `in:scale` became attributes read by `useKeyedMotion`.
 * Svelte's directives work because a keyed `{#each}` knows which children
 * survived; React does not, so the hook measures instead. The durations still
 * carry reduced motion the way the Svelte template did — `motion.current ? 0 :
 * 220` is now `reduced ? 0 : 220` written into `data-motion-flip`.
 *
 * The ref sits on the outer scroll container rather than the chaining grid, so
 * it survives a strategy switch. If it sat on the grid, switching away and
 * back would remount the container while the hook still held the old
 * measurements, and the first insert afterwards — which reuses id `n0`,
 * because a reset restarts the counter — would flip from a box that belonged
 * to a different node.
 */

function statusLabel(copy: HashMapVisualizerCopy, status: SlotStatus): string {
	if (status === 'collision') return copy.statusLabels.collision;
	if (status === 'probed') return copy.statusLabels.probed;
	return copy.statusLabels.placed;
}

function statusClass(status: SlotStatus): string {
	if (status === 'collision') return 'border-gold border-dashed text-gold';
	if (status === 'probed') return 'border-foam text-foam';
	return 'border-accent bg-highlight-med text-accent';
}

function messageText(copy: HashMapVisualizerCopy, message: MessageState): string {
	if (message.kind === 'place') return copy.messages.place(message.key, message.index);
	if (message.kind === 'collide') return copy.messages.collide(message.key, message.index);
	if (message.kind === 'probe') return copy.messages.probe(message.key, message.from, message.to);
	if (message.kind === 'resize') return copy.messages.resize(message.capacity);
	if (message.kind === 'full') return copy.messages.full;
	return copy.messages.initial;
}

export default function HashMapVisualizer({ copy }: { copy: HashMapVisualizerCopy }) {
	const [state, setState] = useState<TableState>(() => resetState('chaining'));
	const reduced = useReducedMotion();
	const tableRef = useRef<HTMLDivElement>(null);
	useKeyedMotion(tableRef);

	const exhausted = isExhausted(state);
	const loadFactorText = `${sizeOf(state)} / ${state.capacity} = ${loadFactor(state).toFixed(2)}`;

	const onStrategyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setState(resetState(event.currentTarget.value as Strategy));
	};

	const flipDuration = reduced ? 0 : 220;
	const enterDuration = reduced ? 0 : 160;

	return (
		<article className="study-card min-w-0 p-5">
			<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
			<p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
			<p className="mt-2 text-sm leading-6 text-muted">{messageText(copy, state.message)}</p>

			<div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
				<div>
					<label
						className="font-mono text-xs uppercase tracking-wider text-faint"
						htmlFor="hashmap-strategy"
					>
						{copy.strategyLabel}
					</label>
					<select
						id="hashmap-strategy"
						className="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm text-ink"
						value={state.strategy}
						onChange={onStrategyChange}
					>
						<option value="chaining">{copy.strategies.chaining}</option>
						<option value="probing">{copy.strategies.probing}</option>
					</select>
				</div>
				<button
					type="button"
					className="study-btn"
					onClick={() => setState(insertStep)}
					disabled={exhausted}
				>
					{copy.insertLabel}
				</button>
				<button
					type="button"
					className="study-btn"
					onClick={() => setState(resetState(state.strategy))}
				>
					{copy.resetLabel}
				</button>
			</div>

			<p className="mt-4 font-mono text-xs uppercase tracking-wider text-faint">
				{copy.loadFactorLabel}: <span className="text-muted normal-case">{loadFactorText}</span>
			</p>

			<div ref={tableRef} className="mt-5 overflow-x-auto">
				{state.strategy === 'chaining' ? (
					<div className="grid min-w-[26rem] gap-2">
						{state.chains.map((chain, index) => (
							<div key={index} className="flex items-center gap-2">
								<span className="w-8 shrink-0 text-right font-mono text-xs text-faint">
									{index}
								</span>
								<span className="shrink-0 font-mono text-xs text-faint">→</span>
								{chain.length === 0 ? (
									<span className="font-mono text-xs text-faint">{copy.emptyLabel}</span>
								) : (
									<div className="flex flex-wrap items-center gap-2">
										{chain.map((node, position) => (
											<div
												key={node.id}
												data-motion-key={node.id}
												data-motion-flip={flipDuration}
												data-motion-enter={`scale:${enterDuration}`}
												className="flex items-center gap-2 motion-reduce:transition-none"
											>
												{position > 0 ? (
													<span className="font-mono text-xs text-faint">→</span>
												) : null}
												<div
													className={`min-w-12 border bg-bg p-1 text-center font-mono text-sm ${statusClass(node.status)}`}
												>
													<span className="block text-[10px] uppercase">
														{statusLabel(copy, node.status)}
													</span>
													<span>{node.key}</span>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						))}
					</div>
				) : (
					<div
						className="grid min-w-full gap-2"
						style={{ gridTemplateColumns: `repeat(${state.capacity}, minmax(2.75rem, 1fr))` }}
					>
						{state.slots.map((slot, index) => (
							<div
								key={index}
								className={`min-h-16 border bg-bg p-1 text-center font-mono text-sm motion-reduce:transition-none ${slot === null ? 'border-line' : statusClass(slot.status)}`}
							>
								<span className="block text-[10px] text-faint">{index}</span>
								{slot === null ? (
									<span className="mt-3 block text-xs text-faint">{copy.emptyLabel}</span>
								) : (
									<>
										<span className="block text-[10px] uppercase">
											{statusLabel(copy, slot.status)}
										</span>
										<span>{slot.key}</span>
									</>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</article>
	);
}
