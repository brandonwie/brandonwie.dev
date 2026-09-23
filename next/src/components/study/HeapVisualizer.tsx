'use client';

import { useMemo, useState } from 'react';

import type { HeapVisualizerCopy } from '../../data/study';
import { KeyedMotion } from '../../motion/KeyedMotion';
import { useReducedMotion } from '../../motion/useReducedMotion';

type NodeStatus = 'settled' | 'inserted' | 'swapped' | 'root';

interface HeapNode {
	id: string;
	value: number;
	status: NodeStatus;
}

type MessageState =
	| { kind: 'initial' }
	| { kind: 'add'; value: number }
	| { kind: 'removeMin'; value: number }
	| { kind: 'empty' };

interface PlacedNode {
	index: number;
	node: HeapNode;
	x: number;
	y: number;
}

interface PlacedEdge {
	id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

// Deterministic add source consumed in order; cycles when exhausted.
const ADD_QUEUE = [5, 3, 8, 1, 4, 9, 2, 7];

// SVG geometry: viewBox width is fixed; height grows with depth.
const VIEW_W = 460;
const NODE_R = 16;
const ROW_GAP = 46;
const TOP_Y = 28;

function nodeXY(index: number): { x: number; y: number } {
	const depth = Math.floor(Math.log2(index));
	const slots = 2 ** depth;
	const posInLevel = index - slots;
	const x = (VIEW_W * (posInLevel + 0.5)) / slots;
	const y = TOP_Y + depth * ROW_GAP;
	return { x, y };
}

function settleAll(arr: (HeapNode | null)[]): (HeapNode | null)[] {
	return arr.map((n, i) =>
		n ? { ...n, status: i === 1 ? ('root' as const) : ('settled' as const) } : n,
	);
}

export default function HeapVisualizer({ copy }: { copy: HeapVisualizerCopy }) {
	const [heap, setHeap] = useState<(HeapNode | null)[]>([null]);
	const [cursor, setCursor] = useState(0);
	const [nextId, setNextId] = useState(0);
	const [message, setMessage] = useState<MessageState>({ kind: 'initial' });
	const motion = useReducedMotion();

	const flipDuration = motion ? 0 : 220;
	const enterDuration = motion ? 0 : 160;

	const size = heap.length - 1;

	const arrayCells = useMemo(() => {
		const out: { index: number; node: HeapNode }[] = [];
		for (let i = 1; i <= size; i += 1) {
			const node = heap[i];
			if (node) out.push({ index: i, node });
		}
		return out;
	}, [heap, size]);

	const messageText = useMemo(() => {
		if (message.kind === 'add') return copy.messages.add(message.value);
		if (message.kind === 'removeMin') return copy.messages.removeMin(message.value);
		if (message.kind === 'empty') return copy.messages.empty;
		return copy.messages.initial;
	}, [copy, message]);

	const maxDepth = size > 0 ? Math.floor(Math.log2(size)) : 0;
	const viewHeight = TOP_Y + maxDepth * ROW_GAP + NODE_R + 8;

	const placedNodes = useMemo(() => {
		const out: PlacedNode[] = [];
		for (let i = 1; i <= size; i += 1) {
			const node = heap[i];
			if (!node) continue;
			out.push({ index: i, node, ...nodeXY(i) });
		}
		return out;
	}, [heap, size]);

	const placedEdges = useMemo(() => {
		const out: PlacedEdge[] = [];
		for (let i = 2; i <= size; i += 1) {
			if (!heap[i]) continue;
			const parent = Math.floor(i / 2);
			const a = nodeXY(parent);
			const b = nodeXY(i);
			out.push({ id: `edge-${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
		}
		return out;
	}, [heap, size]);

	function add() {
		let cur = cursor;
		if (cur >= ADD_QUEUE.length) cur = 0;
		const value = ADD_QUEUE[cur];
		setCursor(cur + 1);

		const arr = settleAll(heap);
		const inserted: HeapNode = { id: `n${nextId}`, value, status: 'inserted' };
		setNextId(nextId + 1);
		arr.push(inserted);

		// Swim up: while i > 1 and arr[i] < arr[floor(i/2)], swap with parent.
		let i = arr.length - 1;
		while (i > 1) {
			const parent = Math.floor(i / 2);
			const child = arr[i];
			const par = arr[parent];
			if (!child || !par || child.value >= par.value) break;
			arr[i] = { ...par, status: 'swapped' };
			arr[parent] = { ...child, status: 'swapped' };
			i = parent;
		}
		if (arr[1]) arr[1] = { ...arr[1], status: arr[1].status === 'swapped' ? 'swapped' : 'root' };

		setHeap(arr);
		setMessage({ kind: 'add', value });
	}

	function removeMin() {
		if (size === 0) {
			setMessage({ kind: 'empty' });
			return;
		}
		const arr = settleAll(heap);
		const root = arr[1];
		const removed = root ? root.value : 0;

		// Move last into root, drop last slot.
		const last = arr.pop();
		if (arr.length > 1 && last) {
			arr[1] = { ...last, status: 'swapped' };
		}
		const newSize = arr.length - 1;

		// Sink from i = 1: pick the smaller existing child; swap if child < arr[i].
		let i = 1;
		while (true) {
			const left = 2 * i;
			const right = 2 * i + 1;
			let smaller = -1;
			if (left <= newSize && arr[left]) smaller = left;
			if (right <= newSize && arr[right]) {
				const r = arr[right];
				const l = smaller >= 0 ? arr[smaller] : null;
				if (r && (!l || r.value < l.value)) smaller = right;
			}
			if (smaller < 0) break;
			const cur = arr[i];
			const child = arr[smaller];
			if (!cur || !child || child.value >= cur.value) break;
			arr[i] = { ...child, status: 'swapped' };
			arr[smaller] = { ...cur, status: 'swapped' };
			i = smaller;
		}
		if (arr[1]) arr[1] = { ...arr[1], status: arr[1].status === 'swapped' ? 'swapped' : 'root' };

		setHeap(arr);
		setMessage({ kind: 'removeMin', value: removed });
	}

	function reset() {
		setHeap([null]);
		setCursor(0);
		setNextId(0);
		setMessage({ kind: 'initial' });
	}

	function statusLabel(status: NodeStatus): string {
		if (status === 'inserted') return copy.statusLabels.inserted;
		if (status === 'swapped') return copy.statusLabels.swapped;
		if (status === 'root') return copy.statusLabels.root;
		return copy.statusLabels.settled;
	}

	// Shell state inks (inside `.pg-study`: gold → amber, foam → green,
	// muted → worn, bg → glass). `new` is reverse video (amber fill, glass
	// text), `swap` an amber dashed border, `min` (root) green, `set` worn.
	function statusClass(status: NodeStatus): string {
		if (status === 'inserted') return 'border-gold bg-gold text-bg';
		if (status === 'swapped') return 'border-gold border-dashed bg-bg text-gold';
		if (status === 'root') return 'border-foam bg-bg text-foam';
		return 'border-line bg-bg text-muted';
	}

	function strokeColor(status: NodeStatus): string {
		if (status === 'inserted') return 'var(--color-gold)';
		if (status === 'swapped') return 'var(--color-gold)';
		if (status === 'root') return 'var(--color-foam)';
		return 'var(--color-line)';
	}

	function fillColor(status: NodeStatus): string {
		if (status === 'inserted') return 'var(--color-gold)';
		return 'var(--color-bg)';
	}

	function textColor(status: NodeStatus): string {
		if (status === 'inserted') return 'var(--color-bg)';
		if (status === 'swapped') return 'var(--color-gold)';
		if (status === 'root') return 'var(--color-foam)';
		return 'var(--color-muted)';
	}

	return (
		<article className="study-card min-w-0 p-5" data-viz="heap">
			<h3 className="text-lg font-semibold text-ink">{copy.title}</h3>
			<p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
			<p className="mt-2 text-sm leading-6 text-muted">{messageText}</p>

			<div className="mt-5 flex flex-wrap gap-2">
				<button type="button" className="study-btn" onClick={add}>
					{copy.addLabel}
				</button>
				<button type="button" className="study-btn" onClick={removeMin} disabled={size === 0}>
					{copy.removeLabel}
				</button>
				<button type="button" className="study-btn" onClick={reset}>
					{copy.resetLabel}
				</button>
			</div>

			<div className="mt-5">
				<span className="font-mono text-xs uppercase tracking-wider text-faint">
					{copy.arrayLabel}
				</span>
				<div className="mt-2 overflow-x-auto">
					<KeyedMotion className="flex min-w-full gap-2">
						<div className="min-h-16 min-w-[2.75rem] flex-1 border border-line border-dashed bg-bg p-1 text-center opacity-50">
							<span className="block font-mono text-[10px] text-faint">0</span>
							<span className="mt-3 block font-mono text-xs text-faint">{copy.emptyLabel}</span>
						</div>
						{arrayCells.map((cell) => (
							<div
								key={cell.node.id}
								data-motion-key={cell.node.id}
								data-motion-flip={flipDuration}
								data-motion-enter={`scale:${enterDuration}`}
								data-state={cell.node.status}
								className={`min-h-16 min-w-[2.75rem] flex-1 border p-1 text-center font-mono text-sm motion-reduce:transition-none ${statusClass(cell.node.status)}`}
							>
								<span
									className={`block text-[10px] ${cell.node.status === 'inserted' ? 'text-bg' : 'text-faint'}`}
								>
									{cell.index}
								</span>
								<span className="block text-[10px] uppercase">{statusLabel(cell.node.status)}</span>
								<span>{cell.node.value}</span>
							</div>
						))}
						{size === 0 && (
							<div className="flex min-h-16 min-w-[2.75rem] flex-1 items-center justify-center border border-line bg-bg p-1 text-center font-mono text-xs text-faint">
								{copy.emptyLabel}
							</div>
						)}
					</KeyedMotion>
				</div>
			</div>

			<div className="mt-5">
				<span className="font-mono text-xs uppercase tracking-wider text-faint">
					{copy.treeLabel}
				</span>
				<div className="mt-2 overflow-x-auto">
					{size > 0 ? (
						<svg
							viewBox={`0 0 ${VIEW_W} ${viewHeight}`}
							className="min-w-[26rem] w-full"
							role="img"
							aria-label={copy.treeLabel}
						>
							{placedEdges.map((edge) => (
								<line
									key={edge.id}
									x1={edge.x1}
									y1={edge.y1}
									x2={edge.x2}
									y2={edge.y2}
									stroke="var(--color-line)"
									strokeWidth="1.5"
								/>
							))}
							{placedNodes.map((placed) => (
								<g key={placed.node.id} data-state={placed.node.status}>
									<circle
										cx={placed.x}
										cy={placed.y}
										r={NODE_R}
										fill={fillColor(placed.node.status)}
										stroke={strokeColor(placed.node.status)}
										strokeWidth="1.5"
										strokeDasharray={placed.node.status === 'swapped' ? '4 3' : undefined}
									/>
									<text
										x={placed.x}
										y={placed.y + 4}
										textAnchor="middle"
										className="font-mono text-[11px]"
										fill={textColor(placed.node.status)}
									>
										{placed.node.value}
									</text>
									<text
										x={placed.x}
										y={placed.y - NODE_R - 4}
										textAnchor="middle"
										className="font-mono text-[9px]"
										fill="var(--color-faint)"
									>
										{placed.index}
									</text>
								</g>
							))}
						</svg>
					) : (
						<p className="border border-line bg-bg px-3 py-6 text-center text-sm text-faint">
							{copy.emptyLabel}
						</p>
					)}
				</div>
			</div>

			{heap[1] ? (
				<p className="mt-4 text-sm text-muted">
					<span className="font-mono text-xs uppercase tracking-wider text-faint">
						{copy.minLabel}
					</span>
					<span data-state="min" className="ml-2 font-mono text-foam">
						{heap[1].value}
					</span>
				</p>
			) : null}
		</article>
	);
}
