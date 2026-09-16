'use client';

import { useMemo, useState } from 'react';

import type { AvlVisualizerCopy } from '../../data/study';
import Stepper from './Stepper';

type Role = keyof AvlVisualizerCopy['roleLabels'];

interface AvlNode {
	id: string;
	x: number;
	y: number;
	label: string;
	bf: number;
	role?: Role;
}

interface AvlEdge {
	from: string;
	to: string;
}

interface AvlFrame {
	nodes: AvlNode[];
	edges: AvlEdge[];
}

// Worked example: insert 10, 5, 7 -> left-right imbalance -> double rotation.
// Node ids stay stable across frames (a=10, b=5, c=7) so shape changes read
// as motion. Geometry is owned here; copy.steps supplies localized narration.
const frames: AvlFrame[] = [
	{
		nodes: [{ id: 'a', x: 170, y: 40, label: '10', bf: 0, role: 'insert' }],
		edges: [],
	},
	{
		nodes: [
			{ id: 'a', x: 170, y: 40, label: '10', bf: 1 },
			{ id: 'b', x: 110, y: 112, label: '5', bf: 0, role: 'insert' },
		],
		edges: [{ from: 'a', to: 'b' }],
	},
	{
		nodes: [
			{ id: 'a', x: 170, y: 40, label: '10', bf: 2, role: 'imbalance' },
			{ id: 'b', x: 110, y: 112, label: '5', bf: -1 },
			{ id: 'c', x: 150, y: 182, label: '7', bf: 0, role: 'insert' },
		],
		edges: [
			{ from: 'a', to: 'b' },
			{ from: 'b', to: 'c' },
		],
	},
	{
		nodes: [
			{ id: 'a', x: 170, y: 40, label: '10', bf: 2, role: 'imbalance' },
			{ id: 'c', x: 110, y: 112, label: '7', bf: 1, role: 'rotate' },
			{ id: 'b', x: 60, y: 182, label: '5', bf: 0, role: 'rotate' },
		],
		edges: [
			{ from: 'a', to: 'c' },
			{ from: 'c', to: 'b' },
		],
	},
	{
		nodes: [
			{ id: 'c', x: 170, y: 40, label: '7', bf: 0, role: 'balanced' },
			{ id: 'b', x: 110, y: 112, label: '5', bf: 0, role: 'balanced' },
			{ id: 'a', x: 230, y: 112, label: '10', bf: 0, role: 'balanced' },
		],
		edges: [
			{ from: 'c', to: 'b' },
			{ from: 'c', to: 'a' },
		],
	},
	{
		nodes: [
			{ id: 'c', x: 170, y: 40, label: '7', bf: 1 },
			{ id: 'b', x: 110, y: 112, label: '5', bf: 1 },
			{ id: 'a', x: 230, y: 112, label: '10', bf: 0 },
			{ id: 'd', x: 70, y: 182, label: '3', bf: 0, role: 'insert' },
		],
		edges: [
			{ from: 'c', to: 'b' },
			{ from: 'c', to: 'a' },
			{ from: 'b', to: 'd' },
		],
	},
	{
		nodes: [
			{ id: 'c', x: 170, y: 40, label: '7', bf: 2, role: 'imbalance' },
			{ id: 'b', x: 110, y: 112, label: '5', bf: 1 },
			{ id: 'd', x: 70, y: 182, label: '3', bf: 0 },
			{ id: 'a', x: 230, y: 112, label: '10', bf: 0, role: 'remove' },
		],
		edges: [
			{ from: 'c', to: 'b' },
			{ from: 'b', to: 'd' },
			{ from: 'c', to: 'a' },
		],
	},
	{
		nodes: [
			{ id: 'b', x: 170, y: 40, label: '5', bf: 0, role: 'balanced' },
			{ id: 'd', x: 110, y: 112, label: '3', bf: 0, role: 'balanced' },
			{ id: 'c', x: 230, y: 112, label: '7', bf: 0, role: 'balanced' },
		],
		edges: [
			{ from: 'b', to: 'd' },
			{ from: 'b', to: 'c' },
		],
	},
];

export default function AvlTreeVisualizer({ copy }: { copy: AvlVisualizerCopy }) {
	const [step, setStep] = useState(0);
	const frame = frames[step];
	const nodeById = useMemo(() => new Map(frame.nodes.map((n) => [n.id, n])), [frame]);

	function nodeClass(role: Role | undefined): string {
		if (role === 'insert') return 'fill-bg stroke-foam';
		if (role === 'imbalance' || role === 'remove') return 'fill-bg stroke-crit';
		if (role === 'rotate' || role === 'balanced') return 'fill-highlight-med stroke-accent';
		return 'fill-bg stroke-line';
	}

	function nodeTextClass(role: Role | undefined): string {
		if (role === 'insert') return 'fill-foam';
		if (role === 'imbalance') return 'fill-crit';
		if (role === 'remove') return 'fill-faint';
		if (role === 'rotate' || role === 'balanced') return 'fill-accent';
		return 'fill-muted';
	}

	function bfClass(bf: number, role: Role | undefined): string {
		if (role === 'imbalance' || Math.abs(bf) >= 2) return 'fill-crit';
		return 'fill-faint';
	}

	function formatBf(bf: number): string {
		return bf > 0 ? `+${bf}` : `${bf}`;
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
					viewBox="0 0 340 210"
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
								y1={from.y}
								x2={to.x}
								y2={to.y}
								className="stroke-line"
								strokeWidth="1.5"
							/>
						);
					})}

					{frame.nodes.map((node) => {
						const role = node.role;
						return (
							<g key={node.id}>
								<circle
									cx={node.x}
									cy={node.y}
									r="16"
									strokeWidth="1.5"
									strokeDasharray={role === 'remove' ? '3 3' : undefined}
									className={`transition-colors duration-200 motion-reduce:transition-none ${nodeClass(role)}`}
								/>
								<text
									x={node.x}
									y={node.y + 5}
									textAnchor="middle"
									className={`font-mono text-[14px] ${nodeTextClass(role)}`}
								>
									{node.label}
								</text>
								<text
									x={node.x}
									y={node.y - 22}
									textAnchor="middle"
									className={`font-mono text-[8px] uppercase tracking-wider ${bfClass(node.bf, role)}`}
								>
									{copy.balanceFactorLabel}
									{formatBf(node.bf)}
								</text>
								{role ? (
									<text
										x={node.x + 24}
										y={node.y + 4}
										textAnchor="start"
										className={`font-mono text-[8px] uppercase tracking-wider ${nodeTextClass(role)}`}
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
