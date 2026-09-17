'use client';

import { useState } from 'react';

import type { IterativeSortCopy } from '../../data/study';
import Stepper from './Stepper';

type CellState = 'sorted' | 'swap' | 'compare' | 'idle';

interface SortFrame {
	values: number[];
	compare: [number, number] | null;
	swapped: boolean;
	sorted: number[];
}

// Worked example: bubble sort [5,1,4,2,8] with the last-swap optimisation.
const frames: SortFrame[] = [
	{ values: [5, 1, 4, 2, 8], compare: null, swapped: false, sorted: [] },
	{ values: [1, 5, 4, 2, 8], compare: [0, 1], swapped: true, sorted: [] },
	{ values: [1, 4, 5, 2, 8], compare: [1, 2], swapped: true, sorted: [] },
	{ values: [1, 4, 2, 5, 8], compare: [2, 3], swapped: true, sorted: [] },
	{ values: [1, 4, 2, 5, 8], compare: [3, 4], swapped: false, sorted: [4] },
	{ values: [1, 2, 4, 5, 8], compare: [1, 2], swapped: true, sorted: [4] },
	{ values: [1, 2, 4, 5, 8], compare: [2, 3], swapped: false, sorted: [3, 4] },
	{ values: [1, 2, 4, 5, 8], compare: null, swapped: false, sorted: [0, 1, 2, 3, 4] },
];

const CELL = 46;
const GAP = 10;

export default function IterativeSortVisualizer({ copy }: { copy: IterativeSortCopy }) {
	const [step, setStep] = useState(0);
	const frame = frames[step];

	function cellState(index: number): CellState {
		if (frame.sorted.includes(index)) return 'sorted';
		if (frame.compare && (index === frame.compare[0] || index === frame.compare[1])) {
			return frame.swapped ? 'swap' : 'compare';
		}
		return 'idle';
	}

	function cellClass(state: CellState): string {
		if (state === 'sorted') return 'fill-highlight-med stroke-foam';
		if (state === 'swap') return 'fill-highlight-med stroke-accent';
		if (state === 'compare') return 'fill-bg stroke-foam';
		return 'fill-bg stroke-line';
	}

	function textClass(state: CellState): string {
		if (state === 'sorted' || state === 'compare') return 'fill-foam';
		if (state === 'swap') return 'fill-accent';
		return 'fill-muted';
	}

	return (
		<article className="study-card min-w-0 p-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
					<p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
				</div>
				<span className="font-mono text-xs text-faint">
					{step + 1}/{frames.length}
				</span>
			</div>

			<Stepper length={frames.length} step={step} onStepChange={setStep} labels={copy} />

			<div className="mt-5 overflow-x-auto">
				<svg
					viewBox="0 0 272 72"
					className="min-w-[17rem] max-w-full"
					role="img"
					aria-label={copy.title}
				>
					{frame.values.map((value, index) => {
						const state = cellState(index);
						const x = index * (CELL + GAP);
						return (
							<g key={index}>
								<rect
									x={x}
									y="13"
									width={CELL}
									height={CELL}
									rx="6"
									strokeWidth="1.5"
									className={`transition-colors duration-200 motion-reduce:transition-none ${cellClass(state)}`}
								/>
								<text
									x={x + CELL / 2}
									y="42"
									textAnchor="middle"
									className={`font-mono text-[16px] ${textClass(state)}`}
								>
									{value}
								</text>
							</g>
						);
					})}
				</svg>
			</div>

			<p className="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
				{step + 1}. {copy.steps[step] ?? ''}
			</p>
		</article>
	);
}
