'use client';

import { useMemo, useState } from 'react';

import type { DivideConquerSortCopy } from '../../data/study';
import Stepper from './Stepper';

type Mode = 'start' | 'split' | 'merge' | 'sorted';

interface DcFrame {
	groups: number[][];
	mode: Mode;
}

// Worked example: merge sort [5,1,4,2] — split down to singletons, merge up.
const frames: DcFrame[] = [
	{ groups: [[5, 1, 4, 2]], mode: 'start' },
	{
		groups: [
			[5, 1],
			[4, 2],
		],
		mode: 'split',
	},
	{ groups: [[5], [1], [4], [2]], mode: 'split' },
	{
		groups: [
			[1, 5],
			[2, 4],
		],
		mode: 'merge',
	},
	{ groups: [[1, 2, 4, 5]], mode: 'sorted' },
];

const CELL = 40;
const GAP = 6;
const GROUP_GAP = 24;
const VIEW_W = 320;

interface PlacedCell {
	key: string;
	value: number;
	x: number;
}

export default function DivideConquerSortVisualizer({ copy }: { copy: DivideConquerSortCopy }) {
	const [step, setStep] = useState(0);
	const frame = frames[step];

	// Lay groups left-to-right, then centre the whole row in the viewBox.
	const layout = useMemo(() => {
		const cells: PlacedCell[] = [];
		let cursor = 0;
		frame.groups.forEach((group, gi) => {
			if (gi > 0) cursor += GROUP_GAP;
			group.forEach((value, ci) => {
				if (ci > 0) cursor += GAP;
				cells.push({ key: `${gi}-${ci}`, value, x: cursor });
				cursor += CELL;
			});
		});
		const offset = (VIEW_W - cursor) / 2;
		return cells.map((cell) => ({ ...cell, x: cell.x + offset }));
	}, [frame]);

	function cellClass(mode: Mode): string {
		if (mode === 'split') return 'fill-bg stroke-foam';
		if (mode === 'merge') return 'fill-highlight-med stroke-accent';
		if (mode === 'sorted') return 'fill-highlight-med stroke-foam';
		return 'fill-bg stroke-line';
	}

	function textClass(mode: Mode): string {
		if (mode === 'merge') return 'fill-accent';
		if (mode === 'split' || mode === 'sorted') return 'fill-foam';
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
					viewBox="0 0 320 64"
					className="min-w-[18rem] max-w-full"
					role="img"
					aria-label={copy.title}
				>
					{layout.map((cell) => (
						<g key={cell.key}>
							<rect
								x={cell.x}
								y="11"
								width={CELL}
								height={CELL}
								rx="6"
								strokeWidth="1.5"
								className={`transition-colors duration-200 motion-reduce:transition-none ${cellClass(frame.mode)}`}
							/>
							<text
								x={cell.x + CELL / 2}
								y="37"
								textAnchor="middle"
								className={`font-mono text-[15px] ${textClass(frame.mode)}`}
							>
								{cell.value}
							</text>
						</g>
					))}
				</svg>
			</div>

			<p className="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
				{step + 1}. {copy.steps[step] ?? ''}
			</p>
		</article>
	);
}
