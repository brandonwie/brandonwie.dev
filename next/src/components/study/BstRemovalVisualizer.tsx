'use client';

import { useState } from 'react';

import type { BstRemovalCopy } from '../../data/study';
import Stepper from './Stepper';

type Role = keyof BstRemovalCopy['roleLabels'];

interface TreeNode {
	id: string;
	x: number;
	y: number;
}

interface TreeEdge {
	from: string;
	to: string;
}

// Fixed 7-node perfect BST. Geometry is owned by the component.
const nodes: TreeNode[] = [
	{ id: 'n4', x: 170, y: 26 },
	{ id: 'n2', x: 92, y: 88 },
	{ id: 'n6', x: 248, y: 88 },
	{ id: 'n1', x: 48, y: 150 },
	{ id: 'n3', x: 132, y: 150 },
	{ id: 'n5', x: 208, y: 150 },
	{ id: 'n7', x: 292, y: 150 },
];

const edges: TreeEdge[] = [
	{ from: 'n4', to: 'n2' },
	{ from: 'n4', to: 'n6' },
	{ from: 'n2', to: 'n1' },
	{ from: 'n2', to: 'n3' },
	{ from: 'n6', to: 'n5' },
	{ from: 'n6', to: 'n7' },
];

const nodeById = new Map(nodes.map((node) => [node.id, node]));

const baseLabels: Record<string, string> = {
	n4: '4',
	n2: '2',
	n6: '6',
	n1: '1',
	n3: '3',
	n5: '5',
	n7: '7',
};

export default function BstRemovalVisualizer({ copy }: { copy: BstRemovalCopy }) {
	const [step, setStep] = useState(0);

	// Scenario = remove(4) via in-order SUCCESSOR.
	// Root (n4) is relabeled 4 -> 5 at step 3 (promotion).
	// The old successor node (n5, at n6.left) is removed at step 4.
	const rootLabel = step >= 3 ? '5' : '4';
	const oldFiveRemoved = step >= 4;

	function labelFor(id: string): string {
		if (id === 'n4') return rootLabel;
		return baseLabels[id];
	}

	// Edge n6 -> n5 disappears once the old successor is removed.
	const visibleEdges = edges.filter(
		(edge) => !(oldFiveRemoved && edge.from === 'n6' && edge.to === 'n5'),
	);

	// Per-step role assignment for highlighting.
	function roleFor(id: string): Role | null {
		switch (step) {
			case 0:
				return id === 'n4' ? 'target' : null;
			case 1:
				if (id === 'n4') return 'target';
				return null;
			case 2:
				if (id === 'n4') return 'target';
				if (id === 'n5') return 'successor';
				return null;
			case 3:
				return id === 'n4' ? 'promoted' : null;
			case 4:
				if (id === 'n4') return 'promoted';
				if (id === 'n5') return 'removed';
				return null;
			default:
				return null;
		}
	}

	function nodeClass(role: Role | null, removed: boolean): string {
		if (removed) return 'fill-bg stroke-line opacity-40';
		if (role === 'target') return 'fill-highlight-med stroke-accent';
		if (role === 'successor') return 'fill-bg stroke-foam';
		if (role === 'promoted') return 'fill-highlight-med stroke-accent';
		if (role === 'removed') return 'fill-bg stroke-crit opacity-50';
		return 'fill-bg stroke-line';
	}

	function nodeTextClass(role: Role | null, removed: boolean): string {
		if (removed) return 'fill-faint';
		if (role === 'target' || role === 'promoted') return 'fill-accent';
		if (role === 'successor') return 'fill-foam';
		if (role === 'removed') return 'fill-faint';
		return 'fill-muted';
	}

	function tagClass(role: Role): string {
		if (role === 'target' || role === 'promoted') return 'fill-accent';
		if (role === 'successor') return 'fill-foam';
		return 'fill-crit';
	}

	return (
		<article className="study-card min-w-0 p-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
					<p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
				</div>
				<span className="font-mono text-xs text-faint">
					{step + 1}/{copy.steps.length}
				</span>
			</div>

			<Stepper length={copy.steps.length} step={step} onStepChange={setStep} labels={copy} />

			<div className="mt-5 overflow-x-auto">
				<svg
					viewBox="0 0 340 210"
					className="min-w-[20rem] max-w-full"
					role="img"
					aria-label={copy.title}
				>
					{visibleEdges.map((edge) => {
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

					{nodes.map((node) => {
						const removed = node.id === 'n5' && oldFiveRemoved;
						const role = roleFor(node.id);
						return (
							<g
								key={node.id}
								className="transition-opacity duration-200 motion-reduce:transition-none"
							>
								<circle
									cx={node.x}
									cy={node.y}
									r="16"
									strokeWidth="1.5"
									strokeDasharray={role === 'removed' || removed ? '3 3' : undefined}
									className={`transition-colors duration-200 motion-reduce:transition-none ${nodeClass(role, removed)}`}
								/>
								<text
									x={node.x}
									y={node.y + 5}
									textAnchor="middle"
									className={`font-mono text-[14px] ${nodeTextClass(role, removed)}`}
								>
									{removed ? '' : labelFor(node.id)}
								</text>
								{role && !removed ? (
									<text
										x={node.x}
										y={node.y - 22}
										textAnchor="middle"
										className={`font-mono text-[8px] uppercase tracking-wider ${tagClass(role)}`}
									>
										{copy.roleLabels[role]}
									</text>
								) : removed ? (
									<text
										x={node.x}
										y={node.y - 22}
										textAnchor="middle"
										className="font-mono text-[8px] uppercase tracking-wider fill-crit"
									>
										{copy.roleLabels.removed}
									</text>
								) : null}
							</g>
						);
					})}
				</svg>
			</div>

			<p className="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
				{step + 1}. {copy.steps[step]}
			</p>
		</article>
	);
}
