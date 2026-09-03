'use client';

import { useMemo, useState } from 'react';

import type { BstTraversalCopy } from '../../data/study';
import { KeyedMotion } from '../../motion/KeyedMotion';
import { useReducedMotion } from '../../motion/useReducedMotion';
import Stepper from './Stepper';

/**
 * Sample 1 of 2 for the Slice 2 calibration: the Stepper-driven behavior class,
 * which covers twelve of the seventeen study visualizers.
 *
 * PORT NOTE — WHERE THE DERIVED VALUES WENT. The Svelte original computes the
 * flat node list and all three traversal sequences with `$derived.by`, but
 * every input is a module-level constant: the tree is fixed, and no prop
 * reaches them. `$derived` over constants is a Svelte idiom, not a
 * requirement, so those became module constants here. The recursions
 * themselves are unchanged, and the sequences are still derived rather than
 * written down — the comment in the original says "never hardcoded" and that
 * is still true.
 *
 * `mode` and `step` are the only real state, and `step` resets to zero when
 * the traversal order changes, as before.
 */

type TraversalMode = 'inorder' | 'preorder' | 'postorder';

interface TreeNode {
	value: number;
	x: number;
	y: number;
	left: TreeNode | null;
	right: TreeNode | null;
}

const node = (
	value: number,
	x: number,
	y: number,
	left: TreeNode | null = null,
	right: TreeNode | null = null,
): TreeNode => ({ value, x, y, left, right });

// Fixed 6-node BST. 13 is root; leaves are 5, 11, 19.
const tree: TreeNode = node(
	13,
	160,
	28,
	node(7, 92, 90, node(5, 50, 152), node(11, 132, 152)),
	node(29, 240, 90, node(19, 200, 152), null),
);

// Edges drawn under the nodes: parent value → child value.
const edges = [
	{ from: 13, to: 7 },
	{ from: 13, to: 29 },
	{ from: 7, to: 5 },
	{ from: 7, to: 11 },
	{ from: 29, to: 19 },
];

const nodes: TreeNode[] = (() => {
	const flat: TreeNode[] = [];
	const collect = (n: TreeNode | null) => {
		if (!n) return;
		flat.push(n);
		collect(n.left);
		collect(n.right);
	};
	collect(tree);
	return flat;
})();

function nodeByValue(value: number): TreeNode | undefined {
	return nodes.find((n) => n.value === value);
}

// Sequences derived by recursion, never hardcoded.
function inorder(n: TreeNode | null, out: number[]): void {
	if (!n) return;
	inorder(n.left, out);
	out.push(n.value);
	inorder(n.right, out);
}
function preorder(n: TreeNode | null, out: number[]): void {
	if (!n) return;
	out.push(n.value);
	preorder(n.left, out);
	preorder(n.right, out);
}
function postorder(n: TreeNode | null, out: number[]): void {
	if (!n) return;
	postorder(n.left, out);
	postorder(n.right, out);
	out.push(n.value);
}

const sequences: Record<TraversalMode, number[]> = (() => {
	const into: number[] = [];
	const pre: number[] = [];
	const post: number[] = [];
	inorder(tree, into);
	preorder(tree, pre);
	postorder(tree, post);
	return { inorder: into, preorder: pre, postorder: post };
})();

// Insertion order = pre-order from root (how the tree was built).
const builtFrom = sequences.preorder;

type NodeState = 'current' | 'visited' | 'unvisited';

function circleClass(state: NodeState): string {
	if (state === 'current') return 'fill-bg stroke-gold';
	if (state === 'visited') return 'fill-highlight-med stroke-accent';
	return 'fill-bg stroke-line';
}

function textClass(state: NodeState): string {
	if (state === 'current') return 'fill-gold';
	if (state === 'visited') return 'fill-accent';
	return 'fill-faint';
}

export default function BstTraversalVisualizer({ copy }: { copy: BstTraversalCopy }) {
	const [mode, setMode] = useState<TraversalMode>('inorder');
	const [step, setStep] = useState(0);
	const reduced = useReducedMotion();
	// Resolved here rather than inside the attribute's template literal, so the
	// R1 row can read it as code. Same value either way; the Svelte original
	// writes `duration: motion.current ? 0 : 120` inline, and a named constant
	// is the same statement with a name.
	const enterDuration = reduced ? 0 : 120;

	const sequence = sequences[mode];
	const currentMode = copy.modes[mode];
	const visited = useMemo(() => sequence.slice(0, step + 1), [sequence, step]);
	const currentValue = sequence[step];

	function nodeState(value: number): NodeState {
		if (value === currentValue) return 'current';
		if (visited.includes(value)) return 'visited';
		return 'unvisited';
	}

	function changeMode(event: React.ChangeEvent<HTMLSelectElement>) {
		setMode(event.currentTarget.value as TraversalMode);
		setStep(0);
	}

	return (
		<article className="study-card min-w-0 p-5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
					<p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
				</div>
				<span className="font-mono text-xs text-faint">
					{step + 1}/{sequence.length}
				</span>
			</div>

			<div className="mt-5 sm:max-w-xs">
				<label
					className="font-mono text-xs uppercase tracking-wider text-faint"
					htmlFor="bst-traversal-order"
				>
					{copy.orderLabel}
				</label>
				<select
					id="bst-traversal-order"
					className="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm text-ink"
					value={mode}
					onChange={changeMode}
				>
					<option value="inorder">{copy.modes.inorder.label}</option>
					<option value="preorder">{copy.modes.preorder.label}</option>
					<option value="postorder">{copy.modes.postorder.label}</option>
				</select>
			</div>

			<p className="mt-3 text-sm leading-6 text-muted">{currentMode.note}</p>

			<Stepper length={sequence.length} step={step} onStepChange={setStep} labels={copy} />

			<div className="mt-5 overflow-x-auto">
				<svg
					viewBox="0 0 320 190"
					role="img"
					aria-label={copy.title}
					className="min-w-[20rem] max-w-full"
				>
					{edges.map((edge) => {
						const a = nodeByValue(edge.from);
						const b = nodeByValue(edge.to);
						if (!a || !b) return null;
						return (
							<line
								key={`${edge.from}-${edge.to}`}
								x1={a.x}
								y1={a.y}
								x2={b.x}
								y2={b.y}
								className="stroke-line"
								strokeWidth="1.5"
							/>
						);
					})}

					{nodes.map((n) => {
						const state = nodeState(n.value);
						return (
							<g
								key={n.value}
								className="transition-all duration-200 motion-reduce:transition-none"
							>
								<circle
									cx={n.x}
									cy={n.y}
									r="18"
									strokeWidth={state === 'current' ? 2.5 : 1.5}
									className={`transition-all duration-200 motion-reduce:transition-none ${circleClass(state)}`}
								/>
								<text
									x={n.x}
									y={n.y}
									textAnchor="middle"
									dominantBaseline="central"
									className={`font-mono text-[13px] ${textClass(state)}`}
								>
									{n.value}
								</text>
							</g>
						);
					})}
				</svg>
			</div>

			<div className="mt-5">
				<span className="font-mono text-xs uppercase tracking-wider text-faint">
					{copy.outputLabel}
				</span>
				<KeyedMotion className="mt-2 flex flex-wrap gap-2">
					{visited.map((value, index) => (
						<span
							key={`${value}-${index}`}
							data-motion-key={`${value}-${index}`}
							data-motion-enter={`fade:${enterDuration}`}
							className={`border px-2.5 py-1 font-mono text-sm ${
								index === visited.length - 1
									? 'border-gold text-gold'
									: 'border-accent bg-highlight-med text-accent'
							}`}
						>
							{value}
						</span>
					))}
				</KeyedMotion>
			</div>

			<p className="mt-4 font-mono text-xs text-faint">
				{copy.builtFromLabel}: {builtFrom.join(', ')}
			</p>
		</article>
	);
}
