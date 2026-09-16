'use client';

import { useEffect, useRef, useState } from 'react';
import { curveMonotoneX, line } from 'd3-shape';

import type { BigOVisualizerCopy } from '../../data/study';
import { useReducedMotion } from '../../motion/useReducedMotion';

interface BigOSeries {
	label: string;
	tone: string;
	dash: string;
	value: (n: number) => number;
}

const series: BigOSeries[] = [
	{ label: 'O(1)', tone: 'var(--color-muted)', dash: '', value: (_n: number) => 1 },
	{
		label: 'O(log n)',
		tone: 'var(--color-foam)',
		dash: '4 5',
		value: (n: number) => Math.log2(n),
	},
	{ label: 'O(n)', tone: 'var(--color-accent)', dash: '', value: (n: number) => n },
	{
		label: 'O(n log n)',
		tone: 'var(--color-gold)',
		dash: '8 5',
		value: (n: number) => n * Math.log2(n),
	},
	{ label: 'O(n²)', tone: 'var(--color-rose)', dash: '2 4', value: (n: number) => n * n },
];

const sampleNs = [4, 8, 16, 32, 64, 128];

const chartWidth = 520;
const chartHeight = 250;
const pad = { top: 18, right: 24, bottom: 34, left: 42 };
const plotWidth = chartWidth - pad.left - pad.right;
const plotHeight = chartHeight - pad.top - pad.bottom;

const maxLinear = Math.max(...series.flatMap((row) => sampleNs.map((n) => row.value(n))));

/**
 * PORT NOTE — the `Tween` becomes a `requestAnimationFrame` loop. The Svelte
 * original animates `inputSize` over 180 ms with Svelte's own Tween, whose
 * default easing is `linear` (read off the installed `svelte@5.56.4`
 * `src/motion/tweened.js`), so the loop below interpolates linearly over the
 * same duration. Reduced motion jumps straight to the target, matching the
 * `motion.current` guards everywhere else. `d3-shape` is the same library
 * the Svelte original draws its monotone curves with, now a `next/`
 * dependency so the paths stay identical.
 */
export default function BigOExplorer({ copy }: { copy: BigOVisualizerCopy }) {
	const [inputSize, setInputSize] = useState(32);
	const [useLogScale, setUseLogScale] = useState(true);
	const [displayInputSize, setDisplayInputSize] = useState(32);
	const displayRef = useRef(32);
	const reduced = useReducedMotion();

	useEffect(() => {
		const from = displayRef.current;
		const to = inputSize;
		if (from === to || reduced) {
			displayRef.current = to;
			setDisplayInputSize(to);
			return;
		}
		const duration = 180;
		const start = performance.now();
		let raf = 0;
		const tick = (now: number) => {
			const progress = Math.min((now - start) / duration, 1);
			const value = from + (to - from) * progress;
			displayRef.current = value;
			setDisplayInputSize(value);
			if (progress < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [inputSize, reduced]);

	const yMax = useLogScale ? Math.log10(maxLinear + 1) : maxLinear;

	/** Maps an input size `n` to an x pixel coordinate within the plot area. */
	function x(n: number): number {
		const min = sampleNs[0];
		const max = sampleNs[sampleNs.length - 1];
		return pad.left + ((n - min) / (max - min)) * plotWidth;
	}

	/** Maps a raw operation count to a y pixel coordinate, honoring the linear/log scale toggle. */
	function y(raw: number): number {
		const value = useLogScale ? Math.log10(raw + 1) : raw;
		return pad.top + plotHeight - (value / yMax) * plotHeight;
	}

	/** Builds the SVG path `d` for one Big-O series across the sample input sizes. */
	function linePath(row: BigOSeries): string {
		const points = sampleNs.map((n) => ({ n, value: row.value(n) }));
		return (
			line<{ n: number; value: number }>()
				.x((point) => x(point.n))
				.y((point) => y(point.value))
				.curve(curveMonotoneX)(points) ?? ''
		);
	}

	const cursorX = x(displayInputSize);
	const currentRows = series.map((row) => ({
		...row,
		display: Math.round(row.value(displayInputSize)).toLocaleString(),
	}));

	return (
		<article className="study-card min-w-0 p-5">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
					<p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
				</div>
				<label className="flex items-center gap-2 font-mono text-xs text-faint">
					<input
						type="checkbox"
						checked={useLogScale}
						onChange={(event) => setUseLogScale(event.currentTarget.checked)}
						className="accent-current"
					/>
					{copy.logScaleLabel}
				</label>
			</div>

			<label
				className="mt-5 block font-mono text-xs uppercase tracking-wider text-faint"
				htmlFor="big-o-input"
			>
				{copy.inputSizeLabel}: {Math.round(displayInputSize)}
			</label>
			<input
				id="big-o-input"
				className="mt-3 w-full accent-current"
				type="range"
				min="4"
				max="128"
				step="4"
				value={inputSize}
				onChange={(event) => setInputSize(Number(event.currentTarget.value))}
			/>

			<div className="mt-5 overflow-x-auto">
				<svg
					viewBox={`0 0 ${chartWidth} ${chartHeight}`}
					className="w-full min-w-[28rem]"
					role="img"
					aria-label={copy.chartAriaLabel}
				>
					<line
						x1={pad.left}
						y1={pad.top}
						x2={pad.left}
						y2={pad.top + plotHeight}
						stroke="var(--color-line)"
					/>
					<line
						x1={pad.left}
						y1={pad.top + plotHeight}
						x2={pad.left + plotWidth}
						y2={pad.top + plotHeight}
						stroke="var(--color-line)"
					/>
					{sampleNs.map((n) => (
						<g key={n}>
							<line
								x1={x(n)}
								y1={pad.top}
								x2={x(n)}
								y2={pad.top + plotHeight}
								stroke="var(--color-line)"
								stroke-opacity="0.35"
							/>
							<text
								x={x(n)}
								y={chartHeight - 10}
								textAnchor="middle"
								className="fill-faint font-mono text-[10px]"
							>
								{n}
							</text>
						</g>
					))}
					<line
						x1={cursorX}
						y1={pad.top}
						x2={cursorX}
						y2={pad.top + plotHeight}
						stroke="var(--color-accent)"
						stroke-width="2"
					/>
					{series.map((row) => (
						<g key={row.label}>
							<path
								d={linePath(row)}
								fill="none"
								stroke={row.tone}
								stroke-width="3"
								stroke-dasharray={row.dash}
								stroke-linecap="round"
								stroke-linejoin="round"
								className="transition-all duration-300 ease-out motion-reduce:transition-none"
							/>
							<circle cx={cursorX} cy={y(row.value(displayInputSize))} r="4" fill={row.tone} />
						</g>
					))}
					<text
						x={pad.left - 10}
						y={pad.top + 8}
						textAnchor="end"
						className="fill-faint font-mono text-[10px]"
					>
						{copy.operationsAxisLabel}
					</text>
					<text
						x={pad.left + plotWidth}
						y={chartHeight - 10}
						textAnchor="end"
						className="fill-faint font-mono text-[10px]"
					>
						{copy.inputAxisLabel}
					</text>
				</svg>
			</div>

			<div className="mt-4 grid gap-2 sm:grid-cols-5">
				{currentRows.map((row) => (
					<div key={row.label} className="border border-line bg-bg p-3">
						<div className="flex items-center gap-2">
							<span className="h-0.5 w-6" style={{ background: row.tone }}></span>
							<span className="font-mono text-xs text-muted">{row.label}</span>
						</div>
						<p className="mt-2 font-mono text-sm text-ink">{row.display}</p>
					</div>
				))}
			</div>
		</article>
	);
}
