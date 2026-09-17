'use client';

import { useState } from 'react';

import type { BinarySearchVisualizerCopy } from '../../data/study';
import Stepper from './Stepper';

type CellState = keyof BinarySearchVisualizerCopy['stateLabels'];

export default function BinarySearchVisualizer({ copy }: { copy: BinarySearchVisualizerCopy }) {
	const values = [2, 5, 8, 13, 19, 21, 34];
	const target = 19;

	const [step, setStep] = useState(0);
	const current = copy.frames[step];

	function cellState(index: number, value: number): CellState {
		if (index === current.mid && value === target) return 'found';
		if (index === current.mid) return 'mid';
		if (index === current.low) return 'low';
		if (index === current.high) return 'high';
		if (index >= current.low && index <= current.high) return 'window';
		return 'eliminated';
	}

	function cellClass(state: CellState): string {
		if (state === 'found') return 'border-accent bg-highlight-med text-accent';
		if (state === 'mid') return 'border-gold border-dashed text-gold';
		if (state === 'low' || state === 'high') return 'border-foam text-foam';
		if (state === 'window') return 'border-line bg-bg text-muted';
		return 'border-line opacity-35 text-faint';
	}

	return (
		<article className="study-card min-w-0 p-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
					<p className="mt-2 text-sm leading-6 text-muted">
						{copy.targetLabel}: {target}. {current.note}
					</p>
				</div>
				<span className="font-mono text-xs text-faint">
					{step + 1}/{copy.frames.length}
				</span>
			</div>

			<Stepper length={copy.frames.length} step={step} onStepChange={setStep} labels={copy} />

			<div className="mt-5 overflow-x-auto">
				<div className="grid min-w-[26rem] grid-cols-7 gap-2">
					{values.map((value, index) => {
						const state = cellState(index, value);
						return (
							<div
								key={value}
								className={`border p-2 text-center font-mono text-sm transition-all duration-200 motion-reduce:transition-none ${cellClass(state)}`}
							>
								<span className="block text-[10px] text-faint">{index}</span>
								<span className="block text-[10px] uppercase">{copy.stateLabels[state]}</span>
								<span>{value}</span>
							</div>
						);
					})}
				</div>
			</div>

			<div className="mt-5 grid gap-2">
				{copy.frames.slice(0, step + 1).map((frame, index) => (
					<p
						key={`${frame.low}-${frame.mid}-${frame.high}`}
						className="border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted"
					>
						{index + 1}. {copy.traceLabels.low} {frame.low}, {copy.traceLabels.mid} {frame.mid},{' '}
						{copy.traceLabels.high} {frame.high}: {frame.note}
					</p>
				))}
			</div>
		</article>
	);
}
