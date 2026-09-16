'use client';

import { useState } from 'react';

import type { RecursionTraceCopy } from '../../data/study';
import Stepper from './Stepper';

export default function RecursionTrace({ copy }: { copy: RecursionTraceCopy }) {
	const [step, setStep] = useState(0);
	const current = copy.steps[step];

	return (
		<article className="study-card min-w-0 p-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
					<p className="mt-2 text-sm leading-6 text-muted">{current.note}</p>
				</div>
				<span className="font-mono text-xs text-faint">
					{step + 1}/{copy.steps.length}
				</span>
			</div>

			<Stepper length={copy.steps.length} step={step} onStepChange={setStep} labels={copy} />

			<div className="mt-5 grid gap-2">
				{current.frames.map((frame, index) => (
					<div
						key={frame}
						className={`border px-3 py-2 font-mono text-sm ${
							current.mode === 'unwind' || current.mode === 'done'
								? 'border-gold border-dashed text-gold'
								: current.mode === 'base' && index === current.frames.length - 1
									? 'border-accent bg-highlight-med text-accent'
									: 'border-line text-muted'
						}`}
					>
						<span className="mr-2 text-[10px] uppercase text-faint">
							{current.mode === 'unwind' || current.mode === 'done'
								? copy.frameLabels.return
								: copy.frameLabels.call}
						</span>
						{frame}
					</div>
				))}
			</div>
		</article>
	);
}
