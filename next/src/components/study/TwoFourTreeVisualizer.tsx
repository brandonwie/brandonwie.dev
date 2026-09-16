'use client';

import { useMemo, useState } from 'react';

import type { TwoFourVisualizerCopy } from '../../data/study';
import Stepper from './Stepper';

type Role = keyof TwoFourVisualizerCopy['roleLabels'];

interface TfNode {
	id: string;
	x: number;
	y: number;
	keys: number[];
	role?: Role;
}

interface TfEdge {
	from: string;
	to: string;
}

interface TfFrame {
	nodes: TfNode[];
	edges: TfEdge[];
}

// Worked example: split on insert, then transfer and fusion on remove.
// Geometry is owned here; copy.steps supplies localized narration.
const frames: TfFrame[] = [
	{ nodes: [{ id: 'r', x: 180, y: 44, keys: [10, 20, 30] }], edges: [] },
	{ nodes: [{ id: 'r', x: 180, y: 44, keys: [10, 20, 30, 40], role: 'overflow' }], edges: [] },
	{
		nodes: [
			{ id: 'r', x: 180, y: 44, keys: [20], role: 'promote' },
			{ id: 'l', x: 96, y: 132, keys: [10] },
			{ id: 'm', x: 264, y: 132, keys: [30, 40] },
		],
		edges: [
			{ from: 'r', to: 'l' },
			{ from: 'r', to: 'm' },
		],
	},
	{
		nodes: [
			{ id: 'r', x: 180, y: 44, keys: [20] },
			{ id: 'l', x: 96, y: 132, keys: [], role: 'underflow' },
			{ id: 'm', x: 264, y: 132, keys: [30, 40] },
		],
		edges: [
			{ from: 'r', to: 'l' },
			{ from: 'r', to: 'm' },
		],
	},
	{
		nodes: [
			{ id: 'r', x: 180, y: 44, keys: [30] },
			{ id: 'l', x: 96, y: 132, keys: [20], role: 'transfer' },
			{ id: 'm', x: 264, y: 132, keys: [40] },
		],
		edges: [
			{ from: 'r', to: 'l' },
			{ from: 'r', to: 'm' },
		],
	},
	{
		nodes: [
			{ id: 'r', x: 180, y: 44, keys: [30] },
			{ id: 'l', x: 96, y: 132, keys: [], role: 'underflow' },
			{ id: 'm', x: 264, y: 132, keys: [40] },
		],
		edges: [
			{ from: 'r', to: 'l' },
			{ from: 'r', to: 'm' },
		],
	},
	{ nodes: [{ id: 'r', x: 180, y: 44, keys: [30, 40], role: 'fusion' }], edges: [] },
];

const KEY_W = 26;

function nodeWidth(keys: number[]): number {
	return Math.max(30, keys.length * KEY_W + 12);
}

function keyX(node: TfNode, index: number): number {
	return node.x - ((node.keys.length - 1) * KEY_W) / 2 + index * KEY_W;
}

export default function TwoFourTreeVisualizer({ copy }: { copy: TwoFourVisualizerCopy }) {
	const [step, setStep] = useState(0);
	const frame = frames[step];
	const nodeById = useMemo(() => new Map(frame.nodes.map((n) => [n.id, n])), [frame]);

	function rectClass(role: Role | undefined): string {
		if (role === 'overflow' || role === 'underflow') return 'fill-bg stroke-crit';
		if (role === 'transfer') return 'fill-bg stroke-foam';
		if (role === 'promote' || role === 'fusion') return 'fill-highlight-med stroke-accent';
		return 'fill-bg stroke-line';
	}

	function textClass(role: Role | undefined): string {
		if (role === 'overflow' || role === 'underflow') return 'fill-crit';
		if (role === 'transfer') return 'fill-foam';
		if (role === 'promote' || role === 'fusion') return 'fill-accent';
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
					viewBox="0 0 360 200"
					className="min-w-[20rem] max-w-full"
					role="img"
					aria-label={copy.title}
				>
					{frame.edges.map((edge) => {
						const from = nodeById.get(edge.from);
						const to = nodeById.get(edge.to);
						if (!from || !to) return null;
						return (
							<line
								key={`${edge.from}-${edge.to}`}
								x1={from.x}
								y1={from.y + 16}
								x2={to.x}
								y2={to.y - 16}
								className="stroke-line"
								strokeWidth="1.5"
							/>
						);
					})}

					{frame.nodes.map((node) => {
						const role = node.role;
						const width = nodeWidth(node.keys);
						return (
							<g key={node.id}>
								<rect
									x={node.x - width / 2}
									y={node.y - 16}
									width={width}
									height="32"
									rx="6"
									strokeWidth="1.5"
									strokeDasharray={role === 'underflow' ? '3 3' : undefined}
									className={`transition-colors duration-200 motion-reduce:transition-none ${rectClass(role)}`}
								/>
								{node.keys.map((key, index) => (
									<text
										key={index}
										x={keyX(node, index)}
										y={node.y + 5}
										textAnchor="middle"
										className={`font-mono text-[13px] ${textClass(role)}`}
									>
										{key}
									</text>
								))}
								{role ? (
									<text
										x={node.x}
										y={node.y - 24}
										textAnchor="middle"
										className={`font-mono text-[8px] uppercase tracking-wider ${textClass(role)}`}
									>
										{copy.roleLabels[role]}
									</text>
								) : null}
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
