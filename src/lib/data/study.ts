export type StudyLocale = 'en' | 'ko';

export interface StudyIndexCourse {
	slug: string;
	title: string;
	status: string;
	href: string;
	summary: string;
	learned: string[];
	modules: string[];
	meta: string;
	updated: string;
}

export interface StudyIndexContent {
	metaTitle: string;
	metaDescription: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	sections: {
		courses: string;
		approach: string;
	};
	courses: StudyIndexCourse[];
	approach: {
		title: string;
		body: string;
		items: string[];
	};
}

export interface DsaRecallPrompt {
	q: string;
	a: string;
}

export interface DsaModule {
	kicker: string;
	title: string;
	summary: string;
	recall: DsaRecallPrompt[];
}

export interface DsaConceptCard {
	title: string;
	body: string;
	source: string;
}

export interface BigOVisualizerCopy {
	title: string;
	description: string;
	inputSizeLabel: string;
	logScaleLabel: string;
	chartAriaLabel: string;
	operationsAxisLabel: string;
	inputAxisLabel: string;
}

export interface ArrayListVisualizerCopy {
	title: string;
	operationLabel: string;
	indexLabel: string;
	applyLabel: string;
	resetLabel: string;
	indexPrefix: string;
	emptyLabel: string;
	options: {
		insert: string;
		remove: string;
		resize: string;
	};
	status: {
		inserted: string;
		shifted: string;
		copied: string;
		stable: string;
	};
	messages: {
		initial: string;
		resize: (count: number, capacity: number) => string;
		insert: (index: number) => string;
		remove: (index: number) => string;
	};
}

export interface StepperCopy {
	previousLabel: string;
	nextLabel: string;
	resetLabel: string;
	previousAriaLabel: string;
	nextAriaLabel: string;
	resetAriaLabel: string;
}

export interface RecursionTraceCopy extends StepperCopy {
	title: string;
	frameLabels: {
		call: string;
		return: string;
	};
	steps: {
		mode: 'descend' | 'base' | 'unwind' | 'done';
		frames: string[];
		note: string;
	}[];
}

export interface BinarySearchVisualizerCopy extends StepperCopy {
	title: string;
	targetLabel: string;
	traceLabels: {
		low: string;
		mid: string;
		high: string;
	};
	stateLabels: {
		found: string;
		mid: string;
		low: string;
		high: string;
		window: string;
		eliminated: string;
	};
	frames: {
		low: number;
		mid: number;
		high: number;
		note: string;
	}[];
}

export interface StackQueueVisualizerCopy {
	title: string;
	description: string;
	stackLabel: string;
	queueLabel: string;
	pushLabel: string;
	popLabel: string;
	enqueueLabel: string;
	dequeueLabel: string;
	resetLabel: string;
	stackRoles: {
		top: string;
		held: string;
	};
	queueRoles: {
		front: string;
		back: string;
		wait: string;
	};
}

export interface DsaVisualsCopy {
	bigO: BigOVisualizerCopy;
	arrayList: ArrayListVisualizerCopy;
	recursion: RecursionTraceCopy;
	binarySearch: BinarySearchVisualizerCopy;
	stackQueue: StackQueueVisualizerCopy;
}

export interface DsaIContent {
	metaTitle: string;
	metaDescription: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	sections: {
		map: string;
		lab: string;
		notes: string;
		recall: string;
		inside: string;
	};
	coverage: string[];
	modules: DsaModule[];
	concepts: DsaConceptCard[];
	labels: {
		inputSize: string;
		operation: string;
		index: string;
		callStack: string;
		binarySearch: string;
		push: string;
		pop: string;
		enqueue: string;
		dequeue: string;
		reset: string;
	};
	visuals: DsaVisualsCopy;
}

export interface BstTraversalCopy extends StepperCopy {
	title: string;
	description: string;
	orderLabel: string;
	outputLabel: string;
	builtFromLabel: string;
	modes: {
		inorder: { label: string; note: string };
		preorder: { label: string; note: string };
		postorder: { label: string; note: string };
	};
}

export interface BstRemovalCopy extends StepperCopy {
	title: string;
	description: string;
	/** One localized note per removal step (component owns the tree geometry + mutation). */
	steps: string[];
	roleLabels: {
		target: string;
		successor: string;
		promoted: string;
		removed: string;
	};
}

export interface HeapVisualizerCopy {
	title: string;
	description: string;
	addLabel: string;
	removeLabel: string;
	resetLabel: string;
	arrayLabel: string;
	treeLabel: string;
	minLabel: string;
	emptyLabel: string;
	statusLabels: {
		inserted: string;
		swapped: string;
		root: string;
		settled: string;
	};
	messages: {
		initial: string;
		add: (value: number) => string;
		removeMin: (value: number) => string;
		empty: string;
	};
}

export interface HashMapVisualizerCopy {
	title: string;
	description: string;
	insertLabel: string;
	resetLabel: string;
	strategyLabel: string;
	loadFactorLabel: string;
	emptyLabel: string;
	strategies: {
		chaining: string;
		probing: string;
	};
	statusLabels: {
		placed: string;
		collision: string;
		probed: string;
	};
	messages: {
		initial: string;
		place: (key: number, index: number) => string;
		collide: (key: number, index: number) => string;
		probe: (key: number, from: number, to: number) => string;
		resize: (capacity: number) => string;
		full: string;
	};
}

export interface DsaIIVisualsCopy {
	bstTraversal: BstTraversalCopy;
	bstRemoval: BstRemovalCopy;
	heap: HeapVisualizerCopy;
	hashMap: HashMapVisualizerCopy;
}

export interface DsaIIContent {
	metaTitle: string;
	metaDescription: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	sections: {
		map: string;
		lab: string;
		notes: string;
		recall: string;
		inside: string;
	};
	coverage: string[];
	modules: DsaModule[];
	concepts: DsaConceptCard[];
	visuals: DsaIIVisualsCopy;
}

export interface AvlVisualizerCopy extends StepperCopy {
	title: string;
	description: string;
	/** One localized note per step (component owns the tree geometry + rotations). */
	steps: string[];
	balanceFactorLabel: string;
	roleLabels: {
		insert: string;
		imbalance: string;
		rotate: string;
		balanced: string;
		remove: string;
	};
}

export interface TwoFourVisualizerCopy extends StepperCopy {
	title: string;
	description: string;
	/** One localized note per step (component owns the node geometry + keys). */
	steps: string[];
	roleLabels: {
		overflow: string;
		promote: string;
		underflow: string;
		transfer: string;
		fusion: string;
	};
}

export interface IterativeSortCopy extends StepperCopy {
	title: string;
	description: string;
	/** One localized note per step (component owns the array geometry). */
	steps: string[];
}

export interface DivideConquerSortCopy extends StepperCopy {
	title: string;
	description: string;
	/** One localized note per step (component owns the segment geometry). */
	steps: string[];
}

export interface DsaIIIVisualsCopy {
	avl: AvlVisualizerCopy;
	twoFour: TwoFourVisualizerCopy;
	iterativeSort: IterativeSortCopy;
	dcSort: DivideConquerSortCopy;
}

export interface DsaIIIContent {
	metaTitle: string;
	metaDescription: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	sections: {
		map: string;
		lab: string;
		notes: string;
		recall: string;
		inside: string;
	};
	coverage: string[];
	modules: DsaModule[];
	concepts: DsaConceptCard[];
	visuals: DsaIIIVisualsCopy;
}

const indexContent: Record<StudyLocale, StudyIndexContent> = {
	en: {
		metaTitle: 'Study',
		metaDescription:
			'Study notes and visual learning pages by Brandon Wie, starting with Data Structures and Algorithms I.',
		eyebrow: 'Study',
		title: 'A public study shelf for material I have actually worked through.',
		subtitle:
			'The first section turns my Georgia Tech DSA I notes into inspectable, interactive examples — visual demos plus quick recall prompts to keep the material in long-term memory.',
		sections: {
			courses: 'current courses',
			approach: 'the approach',
		},
		courses: [
			{
				slug: 'dsa-i',
				title: 'Data Structures & Algorithms I',
				status: 'active notes',
				href: '/study/dsa-i',
				summary:
					'ArrayLists, LinkedLists, stacks, queues, recursion, binary search, iterators, comparators, and Big-O from the DSA I study folder.',
				learned: ['Big-O scaling', 'Array-backed lists', 'Recursive traces', 'Pointer updates'],
				modules: ['Module 0', 'Module 1', 'Module 2', 'Module 3'],
				meta: 'Modules 0–3 · 5 interactive demos',
				updated: '2026-06-18',
			},
			{
				slug: 'dsa-ii',
				title: 'Data Structures & Algorithms II',
				status: 'active notes',
				href: '/study/dsa-ii',
				summary:
					'Binary search trees and traversals, BST removal, SkipLists, binary heaps and priority queues, and HashMaps with collisions and load factor, from the DSA II study folder.',
				learned: ['BST traversals', 'BST removal', 'Heap sift', 'Hash collisions'],
				modules: ['Module 4', 'Module 5', 'Module 6', 'Module 7'],
				meta: 'Modules 4-7 · 4 interactive demos',
				updated: '2026-06-19',
			},
			{
				slug: 'dsa-iii',
				title: 'Data Structures & Algorithms III',
				status: 'fresh notes',
				href: '/study/dsa-iii',
				summary:
					'AVL trees and rotations, (2,4) trees with splits and fusions, iterative sorts, and the divide-and-conquer sorts (merge, quicksort, LSD radix, and quickselect), from the DSA III study folder.',
				learned: ['AVL rotations', '(2,4) tree splits', 'Sort trade-offs', 'Quickselect'],
				modules: ['Module 8', 'Module 9', 'Module 10', 'Module 11'],
				meta: 'Modules 8-11 · 4 interactive demos',
				updated: '2026-07-06',
			},
		],
		approach: {
			title: 'Notes turned into things you can poke at.',
			body: 'Each course starts from notes I actually worked through, then becomes interactive demos you can step through plus a few prompts to test what stuck.',
			items: [
				'Visual demos you can step through',
				'A module roadmap for each course',
				'Quick self-check prompts to fight forgetting',
			],
		},
	},
	ko: {
		metaTitle: '스터디',
		metaDescription:
			'Brandon Wie의 스터디 노트와 시각 학습 페이지입니다. 첫 섹션은 Data Structures and Algorithms I입니다.',
		eyebrow: 'Study',
		title: '실제로 공부한 내용만 공개 학습 페이지로 정리합니다.',
		subtitle:
			'첫 섹션은 Georgia Tech DSA I 노트를 직접 다뤄볼 수 있는 인터랙티브 예제로 바꾼 것입니다. 시각 데모와 짧은 복습 질문으로 내용을 오래 기억하도록 돕습니다.',
		sections: {
			courses: '현재 과정',
			approach: '진행 방식',
		},
		courses: [
			{
				slug: 'dsa-i',
				title: 'Data Structures & Algorithms I',
				status: 'active notes',
				href: '/ko/study/dsa-i',
				summary:
					'DSA I 폴더에서 정리한 ArrayList, LinkedList, Stack, Queue, Recursion, Binary Search, Iterator, Comparator, Big-O 내용입니다.',
				learned: ['Big-O 스케일', '배열 기반 리스트', '재귀 추적', '포인터 갱신'],
				modules: ['Module 0', 'Module 1', 'Module 2', 'Module 3'],
				meta: 'Module 0–3 · 인터랙티브 데모 5개',
				updated: '2026-06-18',
			},
			{
				slug: 'dsa-ii',
				title: 'Data Structures & Algorithms II',
				status: 'active notes',
				href: '/ko/study/dsa-ii',
				summary:
					'DSA II 폴더에서 정리한 BST와 traversal, BST removal, SkipList, binary heap과 priority queue, 그리고 collision과 load factor를 다루는 HashMap 내용입니다.',
				learned: ['BST traversal', 'BST removal', 'Heap sift', 'Hash collision'],
				modules: ['Module 4', 'Module 5', 'Module 6', 'Module 7'],
				meta: 'Module 4-7 · 인터랙티브 데모 4개',
				updated: '2026-06-19',
			},
			{
				slug: 'dsa-iii',
				title: 'Data Structures & Algorithms III',
				status: 'fresh notes',
				href: '/ko/study/dsa-iii',
				summary:
					'DSA III 폴더에서 정리한 AVL 트리와 rotation, split과 fusion을 쓰는 (2,4) tree, iterative sort, 그리고 merge·quicksort·LSD radix·quickselect 같은 divide-and-conquer sort 내용입니다.',
				learned: ['AVL rotation', '(2,4) tree split', '정렬 트레이드오프', 'Quickselect'],
				modules: ['Module 8', 'Module 9', 'Module 10', 'Module 11'],
				meta: 'Module 8-11 · 인터랙티브 데모 4개',
				updated: '2026-07-06',
			},
		],
		approach: {
			title: '직접 만져볼 수 있는 노트로.',
			body: '각 과정은 실제로 공부한 노트에서 시작해, 단계별로 따라가는 인터랙티브 데모와 기억을 점검하는 짧은 질문으로 이어집니다.',
			items: [
				'단계별로 따라가는 시각 데모',
				'과정마다 제공하는 학습 로드맵',
				'복습을 돕는 셀프 체크 질문',
			],
		},
	},
};

const dsaIContent: Record<StudyLocale, DsaIContent> = {
	en: {
		metaTitle: 'Data Structures & Algorithms I',
		metaDescription:
			'Interactive DSA I learning notes covering Big-O, ArrayLists, recursion, linked lists, stacks, and queues.',
		eyebrow: 'Data Structures & Algorithms',
		title: 'DSA I as small systems you can inspect.',
		subtitle:
			'This page only covers the material present in my DSA I notes: Java review, iterator/comparator basics, Big-O, ArrayLists, recursion and binary search, linked lists, stacks, and queues.',
		sections: {
			map: 'learning map',
			lab: 'visual lab',
			notes: 'concept notes',
			recall: 'test yourself',
			inside: "what's inside",
		},
		coverage: [
			'Worst-case Big-O and primitive operation counting',
			'Arrays, ArrayLists, backing arrays, shifting, and resize costs',
			'Recursive base cases, stack traces, and binary search',
			'Singly, doubly, and circular linked list update rules',
			'Stack and queue ADTs with linked and array-backed implementations',
		],
		modules: [
			{
				kicker: 'Module 0 · Foundations',
				title: 'Foundations and Java review',
				summary:
					'The notes start by translating Java syntax, generics, wrapper types, Iterable, Iterator, Comparable, and Comparator into concepts familiar from JS/TS.',
				recall: [
					{
						q: 'What does an enhanced for loop use under the hood?',
						a: 'An Iterator — hasNext() / next(). Implementing Iterable is what lets a type work with it.',
					},
					{
						q: 'Comparable vs Comparator?',
						a: 'Comparable defines the natural order of a type (compareTo); Comparator is an external, swappable ordering rule.',
					},
				],
			},
			{
				kicker: 'Module 0 · Big-O',
				title: 'Big-O and primitive operations',
				summary:
					'Big-O is treated as the tightest reasonable upper bound for worst-case growth, after dropping constants and lower-order terms.',
				recall: [
					{
						q: 'What exactly does Big-O capture here?',
						a: 'The tightest reasonable upper bound on worst-case growth, after dropping constants and lower-order terms.',
					},
					{
						q: 'If two algorithms are both O(n), are they equally fast?',
						a: 'Not necessarily — constants and lower-order terms are dropped from Big-O but can still matter in practice.',
					},
				],
			},
			{
				kicker: 'Module 1',
				title: 'Arrays, ArrayLists, recursion',
				summary:
					'ArrayLists use a backing array, shift elements for middle insert/remove, and resize by copying into a larger array. Recursion needs a base case and progress toward it.',
				recall: [
					{
						q: 'Why is ArrayList addToBack amortized O(1) but addAtIndex O(n)?',
						a: 'addToBack only resizes occasionally; addAtIndex must shift every later element one slot to the right.',
					},
					{
						q: 'What must every recursion have, and how does binary search use it?',
						a: 'A base case plus progress toward it. Binary search halves the search window each step until it is empty.',
					},
				],
			},
			{
				kicker: 'Module 2',
				title: 'Linked lists',
				summary:
					'Linked lists trade random access for pointer updates. The notes compare SLL, DLL, and CLL edge cases and operation costs.',
				recall: [
					{
						q: 'Why is removeFromBack O(n) for an SLL but O(1) for a DLL?',
						a: 'An SLL must walk from head to find the new tail; a DLL reads tail.prev directly.',
					},
					{
						q: 'How can a circular linked list add to both ends in O(1)?',
						a: 'Keep one pointer to the head and use a data-swap trick so the front and back are both reachable in O(1).',
					},
				],
			},
			{
				kicker: 'Module 3',
				title: 'Stacks and queues',
				summary:
					'Stacks restrict work to one end. Queues add at the back and remove at the front. ArrayQueue uses a circular array and unwraps on resize.',
				recall: [
					{
						q: 'Stack vs queue ordering?',
						a: 'Stack is LIFO and works at one end; queue is FIFO — add at the back, remove from the front.',
					},
					{
						q: 'Where does an ArrayQueue enqueue land?',
						a: 'At index (front + size) % capacity — a circular array that unwraps into a larger one on resize.',
					},
				],
			},
		],
		concepts: [
			{
				title: 'ArrayList resize',
				body: 'When the backing array is full, the implementation creates a larger array and copies existing elements before adding new data.',
				source: 'Module 1 · ArrayLists',
			},
			{
				title: 'Recursion trace',
				body: 'Each recursive call waits on a smaller call until the base case returns, then results unwind back up the call stack.',
				source: 'Module 1 · Recursion',
			},
			{
				title: 'Circular queue',
				body: 'ArrayQueue keeps a front index. Enqueue lands at (front + size) % capacity; dequeue advances front by one modulo capacity.',
				source: 'Module 3 · Stacks & Queues',
			},
		],
		labels: {
			inputSize: 'Input size',
			operation: 'Operation',
			index: 'Index',
			callStack: 'Call stack',
			binarySearch: 'Binary search',
			push: 'Push',
			pop: 'Pop',
			enqueue: 'Enqueue',
			dequeue: 'Dequeue',
			reset: 'Reset',
		},
		visuals: {
			bigO: {
				title: 'Big-O growth',
				description: 'Line shape shows growth; the cursor reads the selected input size.',
				inputSizeLabel: 'Input size',
				logScaleLabel: 'log scale',
				chartAriaLabel: 'Line chart comparing Big-O growth curves',
				operationsAxisLabel: 'ops',
				inputAxisLabel: 'n',
			},
			arrayList: {
				title: 'ArrayList backing array',
				operationLabel: 'Operation',
				indexLabel: 'Index',
				applyLabel: 'Apply',
				resetLabel: 'Reset',
				indexPrefix: 'index',
				emptyLabel: 'empty',
				options: {
					insert: 'addAtIndex',
					remove: 'removeAtIndex',
					resize: 'resize copy',
				},
				status: {
					inserted: 'new',
					shifted: 'shift',
					copied: 'copy',
					stable: 'keep',
				},
				messages: {
					initial: 'Pick an operation, then apply it to watch positions change.',
					resize: (count, capacity) =>
						`Resize: copy ${count} items into a capacity-${capacity} backing array.`,
					insert: (index) =>
						`Insert at index ${index}: new item lands, old items at and after the index shift right.`,
					remove: (index) => `Remove at index ${index}: later items shift left to close the gap.`,
				},
			},
			recursion: {
				title: 'Call stack',
				previousLabel: 'Prev',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous recursion step',
				nextAriaLabel: 'Next recursion step',
				resetAriaLabel: 'Reset recursion trace',
				frameLabels: {
					call: 'call',
					return: 'return',
				},
				steps: [
					{ mode: 'descend', frames: ['factorial(4)'], note: 'Call factorial(4); it must wait.' },
					{ mode: 'descend', frames: ['factorial(4)', 'factorial(3)'], note: '4 calls 3.' },
					{
						mode: 'descend',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2)'],
						note: '3 calls 2.',
					},
					{
						mode: 'descend',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)'],
						note: '1 still needs the base case.',
					},
					{
						mode: 'base',
						frames: [
							'factorial(4)',
							'factorial(3)',
							'factorial(2)',
							'factorial(1)',
							'factorial(0) = 1',
						],
						note: 'Base case returns 1.',
					},
					{
						mode: 'unwind',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1) = 1'],
						note: 'Unwind: 1 x 1 = 1.',
					},
					{
						mode: 'unwind',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2) = 2'],
						note: 'Unwind: 2 x 1 = 2.',
					},
					{
						mode: 'unwind',
						frames: ['factorial(4)', 'factorial(3) = 6'],
						note: 'Unwind: 3 x 2 = 6.',
					},
					{
						mode: 'done',
						frames: ['factorial(4) = 24'],
						note: 'Return to the original caller: 4 x 6 = 24.',
					},
				],
			},
			binarySearch: {
				title: 'Binary search',
				targetLabel: 'Target',
				previousLabel: 'Prev',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous binary search step',
				nextAriaLabel: 'Next binary search step',
				resetAriaLabel: 'Reset binary search',
				traceLabels: {
					low: 'low',
					mid: 'mid',
					high: 'high',
				},
				stateLabels: {
					found: 'found',
					mid: 'mid',
					low: 'low',
					high: 'high',
					window: 'window',
					eliminated: 'out',
				},
				frames: [
					{ low: 0, mid: 3, high: 6, note: '19 > 13, eliminate the left half through mid.' },
					{ low: 4, mid: 5, high: 6, note: '19 < 21, eliminate the right half after mid.' },
					{ low: 4, mid: 4, high: 4, note: '19 found at index 4.' },
				],
			},
			stackQueue: {
				title: 'Stack / Queue ADTs',
				description:
					'Stack changes happen at one top end; queue changes enter at back and leave from front.',
				stackLabel: 'Stack / LIFO',
				queueLabel: 'Queue / FIFO',
				pushLabel: 'Push',
				popLabel: 'Pop',
				enqueueLabel: 'Enqueue',
				dequeueLabel: 'Dequeue',
				resetLabel: 'Reset',
				stackRoles: {
					top: 'top',
					held: 'held',
				},
				queueRoles: {
					front: 'front',
					back: 'back',
					wait: 'wait',
				},
			},
		},
	},
	ko: {
		metaTitle: 'Data Structures & Algorithms I',
		metaDescription:
			'Big-O, ArrayList, Recursion, LinkedList, Stack, Queue를 다루는 인터랙티브 DSA I 학습 노트입니다.',
		eyebrow: 'Data Structures & Algorithms',
		title: 'DSA I를 작은 시스템처럼 뜯어봅니다.',
		subtitle:
			'이 페이지는 DSA I 노트에 있는 내용만 다룹니다. Java review, Iterator/Comparator, Big-O, ArrayList, Recursion과 Binary Search, LinkedList, Stack, Queue입니다.',
		sections: {
			map: '학습 지도',
			lab: '시각 실험실',
			notes: '개념 노트',
			recall: '스스로 점검',
			inside: '구성',
		},
		coverage: [
			'worst-case Big-O와 primitive operation 세기',
			'Array, ArrayList, backing array, shifting, resize 비용',
			'재귀 base case, call stack trace, binary search',
			'SLL, DLL, CLL의 포인터 갱신 규칙',
			'Linked/array-backed Stack과 Queue ADT',
		],
		modules: [
			{
				kicker: 'Module 0 · 기초',
				title: '기초와 Java review',
				summary:
					'Java 문법, generics, wrapper type, Iterable, Iterator, Comparable, Comparator를 JS/TS와 연결해 정리했습니다.',
				recall: [
					{
						q: 'Enhanced for loop는 내부적으로 무엇을 사용하나요?',
						a: 'Iterator(hasNext/next)를 사용합니다. Iterable을 구현해야 enhanced for loop에서 동작합니다.',
					},
					{
						q: 'Comparable과 Comparator의 차이는?',
						a: 'Comparable은 타입의 자연 정렬(compareTo)을 정의하고, Comparator는 외부에서 교체 가능한 정렬 규칙입니다.',
					},
				],
			},
			{
				kicker: 'Module 0 · Big-O',
				title: 'Big-O와 primitive operations',
				summary:
					'Big-O는 worst-case growth에 대한 가장 타이트한 upper bound로 사용하고, 상수와 낮은 차수 항은 제거합니다.',
				recall: [
					{
						q: 'Big-O는 정확히 무엇을 나타내나요?',
						a: 'worst-case growth에 대한 가장 타이트한 upper bound입니다. 상수와 낮은 차수 항은 제거합니다.',
					},
					{
						q: '둘 다 O(n)이면 속도가 같나요?',
						a: '꼭 그렇지는 않습니다. Big-O에서는 상수와 낮은 차수 항을 버리지만 실무에서는 체감될 수 있습니다.',
					},
				],
			},
			{
				kicker: 'Module 1',
				title: 'Arrays, ArrayLists, recursion',
				summary:
					'ArrayList는 backing array를 사용하고, 중간 삽입/삭제에서 원소를 shift하며, 꽉 차면 더 큰 배열로 복사합니다. 재귀는 base case와 base case로 향하는 변화가 필요합니다.',
				recall: [
					{
						q: 'ArrayList addToBack은 amortized O(1)인데 addAtIndex는 왜 O(n)인가요?',
						a: 'addToBack은 가끔만 resize하지만, addAtIndex는 뒤쪽 원소를 모두 한 칸씩 오른쪽으로 밀어야 합니다.',
					},
					{
						q: '모든 재귀에 필요한 것과 binary search의 관계는?',
						a: 'base case와 그쪽으로 향하는 진행이 필요합니다. Binary search는 매 단계 탐색 범위를 절반으로 줄입니다.',
					},
				],
			},
			{
				kicker: 'Module 2',
				title: 'Linked lists',
				summary:
					'LinkedList는 random access를 포기하는 대신 포인터 갱신으로 데이터를 조작합니다. SLL, DLL, CLL의 edge case와 비용을 비교했습니다.',
				recall: [
					{
						q: 'removeFromBack이 SLL에서는 O(n), DLL에서는 O(1)인 이유는?',
						a: 'SLL은 head부터 걸어가 새 tail을 찾아야 하지만, DLL은 tail.prev를 바로 읽습니다.',
					},
					{
						q: 'CLL은 어떻게 양끝 삽입을 O(1)로 처리하나요?',
						a: 'head 포인터 하나만 유지하고 data-swap trick으로 front와 back을 모두 O(1)에 접근합니다.',
					},
				],
			},
			{
				kicker: 'Module 3',
				title: 'Stacks and queues',
				summary:
					'Stack은 한쪽 끝만 사용하고, Queue는 뒤에 넣고 앞에서 뺍니다. ArrayQueue는 circular array를 쓰며 resize 때 unwrap합니다.',
				recall: [
					{
						q: 'Stack과 Queue의 순서 규칙은?',
						a: 'Stack은 LIFO로 한쪽 끝만 쓰고, Queue는 FIFO로 back에 넣고 front에서 뺍니다.',
					},
					{
						q: 'ArrayQueue의 enqueue 위치는?',
						a: '(front + size) % capacity입니다. circular array이고 resize 때 더 큰 배열로 unwrap합니다.',
					},
				],
			},
		],
		concepts: [
			{
				title: 'ArrayList resize',
				body: 'backing array가 가득 차면 더 큰 배열을 만들고 기존 원소를 복사한 뒤 새 데이터를 넣습니다.',
				source: 'Module 1 · ArrayList',
			},
			{
				title: 'Recursion trace',
				body: '각 recursive call은 더 작은 call을 기다립니다. base case가 반환되면 call stack이 거꾸로 풀립니다.',
				source: 'Module 1 · Recursion',
			},
			{
				title: 'Circular queue',
				body: 'ArrayQueue는 front index를 유지합니다. Enqueue는 (front + size) % capacity에 들어가고, dequeue는 front를 modulo로 한 칸 이동합니다.',
				source: 'Module 3 · Stack & Queue',
			},
		],
		labels: {
			inputSize: '입력 크기',
			operation: '연산',
			index: '인덱스',
			callStack: 'Call stack',
			binarySearch: 'Binary search',
			push: 'Push',
			pop: 'Pop',
			enqueue: 'Enqueue',
			dequeue: 'Dequeue',
			reset: 'Reset',
		},
		visuals: {
			bigO: {
				title: 'Big-O 증가율',
				description: '선의 모양은 증가율을 보여주고, 커서는 선택한 입력 크기의 값을 읽습니다.',
				inputSizeLabel: '입력 크기',
				logScaleLabel: '로그 스케일',
				chartAriaLabel: 'Big-O 증가 곡선을 비교하는 선 그래프',
				operationsAxisLabel: '연산',
				inputAxisLabel: 'n',
			},
			arrayList: {
				title: 'ArrayList backing array',
				operationLabel: '연산',
				indexLabel: '인덱스',
				applyLabel: '적용',
				resetLabel: '초기화',
				indexPrefix: '인덱스',
				emptyLabel: '비어 있음',
				options: {
					insert: 'addAtIndex',
					remove: 'removeAtIndex',
					resize: 'resize copy',
				},
				status: {
					inserted: '새 값',
					shifted: '이동',
					copied: '복사',
					stable: '유지',
				},
				messages: {
					initial: '연산을 고른 뒤 적용하면 위치 변화가 보입니다.',
					resize: (count, capacity) =>
						`Resize: ${count}개 원소를 capacity ${capacity}인 backing array로 복사합니다.`,
					insert: (index) =>
						`인덱스 ${index}에 삽입합니다. 새 원소가 들어가고 해당 위치 이후 원소는 오른쪽으로 밀립니다.`,
					remove: (index) => `인덱스 ${index}를 삭제합니다. 뒤쪽 원소가 왼쪽으로 당겨집니다.`,
				},
			},
			recursion: {
				title: 'Call stack',
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 재귀 단계',
				nextAriaLabel: '다음 재귀 단계',
				resetAriaLabel: '재귀 추적 초기화',
				frameLabels: {
					call: '호출',
					return: '반환',
				},
				steps: [
					{
						mode: 'descend',
						frames: ['factorial(4)'],
						note: 'factorial(4)를 호출하고 반환을 기다립니다.',
					},
					{
						mode: 'descend',
						frames: ['factorial(4)', 'factorial(3)'],
						note: '4가 3을 호출합니다.',
					},
					{
						mode: 'descend',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2)'],
						note: '3이 2를 호출합니다.',
					},
					{
						mode: 'descend',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)'],
						note: '1도 아직 base case가 필요합니다.',
					},
					{
						mode: 'base',
						frames: [
							'factorial(4)',
							'factorial(3)',
							'factorial(2)',
							'factorial(1)',
							'factorial(0) = 1',
						],
						note: 'Base case가 1을 반환합니다.',
					},
					{
						mode: 'unwind',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1) = 1'],
						note: 'Unwind: 1 x 1 = 1.',
					},
					{
						mode: 'unwind',
						frames: ['factorial(4)', 'factorial(3)', 'factorial(2) = 2'],
						note: 'Unwind: 2 x 1 = 2.',
					},
					{
						mode: 'unwind',
						frames: ['factorial(4)', 'factorial(3) = 6'],
						note: 'Unwind: 3 x 2 = 6.',
					},
					{
						mode: 'done',
						frames: ['factorial(4) = 24'],
						note: '처음 호출자로 돌아가 4 x 6 = 24를 반환합니다.',
					},
				],
			},
			binarySearch: {
				title: 'Binary search',
				targetLabel: '목표값',
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 이진 탐색 단계',
				nextAriaLabel: '다음 이진 탐색 단계',
				resetAriaLabel: '이진 탐색 초기화',
				traceLabels: {
					low: 'low',
					mid: 'mid',
					high: 'high',
				},
				stateLabels: {
					found: '찾음',
					mid: 'mid',
					low: 'low',
					high: 'high',
					window: '범위',
					eliminated: '제외',
				},
				frames: [
					{ low: 0, mid: 3, high: 6, note: '19 > 13이므로 mid까지의 왼쪽 절반을 제외합니다.' },
					{ low: 4, mid: 5, high: 6, note: '19 < 21이므로 mid 뒤의 오른쪽 절반을 제외합니다.' },
					{ low: 4, mid: 4, high: 4, note: '19를 인덱스 4에서 찾았습니다.' },
				],
			},
			stackQueue: {
				title: 'Stack / Queue ADT',
				description: 'Stack은 한쪽 top에서만 변하고, Queue는 back으로 들어가 front에서 나갑니다.',
				stackLabel: 'Stack / LIFO',
				queueLabel: 'Queue / FIFO',
				pushLabel: 'Push',
				popLabel: 'Pop',
				enqueueLabel: 'Enqueue',
				dequeueLabel: 'Dequeue',
				resetLabel: '초기화',
				stackRoles: {
					top: 'top',
					held: '대기',
				},
				queueRoles: {
					front: 'front',
					back: 'back',
					wait: '대기',
				},
			},
		},
	},
};

export function getStudyIndexContent(locale: StudyLocale): StudyIndexContent {
	return indexContent[locale];
}

export function getDsaIContent(locale: StudyLocale): DsaIContent {
	return dsaIContent[locale];
}

const dsaIIContent: Record<StudyLocale, DsaIIContent> = {
	en: {
		metaTitle: 'Data Structures & Algorithms II',
		metaDescription:
			'Interactive DSA II learning notes covering binary search trees and traversals, BST removal, SkipLists, binary heaps, and hashmaps.',
		eyebrow: 'Data Structures & Algorithms',
		title: 'DSA II as the structures that keep data ordered and findable.',
		subtitle:
			'This page picks up where DSA I left off and only covers what is in my DSA II notes: binary search trees and their traversals, BST removal and SkipLists, binary heaps behind the priority queue, and HashMaps with collisions and load factor.',
		sections: {
			map: 'learning map',
			lab: 'visual lab',
			notes: 'concept notes',
			recall: 'test yourself',
			inside: "what's inside",
		},
		coverage: [
			'A Java and Big-O review carried over from DSA I: Iterable/Iterator, Comparable vs Comparator, and worst-case growth',
			'Binary search trees: the left < node < right invariant, and how insertion order decides O(log n) vs a degenerate O(n) chain',
			'BST removal across the leaf, one-child, and two-child cases, plus SkipLists reaching O(log n) by coin flips',
			'Binary heaps as an array-backed priority queue: O(1) peek, O(log n) add and remove',
			'HashMaps: hashing a key to a bucket, then resolving collisions by chaining or probing under a load factor',
		],
		modules: [
			{
				kicker: 'Module 4 · BST',
				title: 'Binary Search Trees',
				summary:
					'A BST is a binary tree with one ordering rule: for every node, everything in the left subtree is smaller and everything in the right is larger. That invariant is what turns a tree into something you can search in O(log n).',
				recall: [
					{
						q: 'What is the BST ordering invariant?',
						a: 'For every node, all data in its left subtree is less than the node and all data in its right subtree is greater. It holds recursively at every node, not just the root.',
					},
					{
						q: 'Why are BST operations O(log n) on average but O(n) in the worst case?',
						a: 'On a balanced tree each comparison drops half the remaining nodes, so you walk a path of height about log n. But shape depends on insertion order. Inserting already-sorted values builds a one-sided chain that behaves like a linked list, so it degrades to O(n).',
					},
				],
			},
			{
				kicker: 'Module 5 · BST ops + SkipLists',
				title: 'Removing from a BST, and SkipLists',
				summary:
					'I worked through the three BST removal cases: leaf, one-child, and the tricky two-child case that swaps in an in-order successor (the GT course convention). Then SkipLists, which reach the same O(log n) by stacking sorted linked lists and promoting nodes with coin flips.',
				recall: [
					{
						q: 'Removing a BST node with two children: why not just detach it, and what does the course do instead?',
						a: 'Detaching would drop a whole subtree. Instead you keep the node position and overwrite only its data with a replacement, then remove that replacement (which has 0 or 1 child). The course uses the in-order successor: step right once, then go all the way left.',
					},
					{
						q: 'How does a SkipList get O(log n) expected search from plain linked lists?',
						a: 'It stacks sorted lists; level 0 holds everything and each higher level keeps a coin-flip-promoted subset, P(level i) = (1/2)^i. Upper levels are express lanes: walk right until the next node would overshoot, then drop down, which halves the search space like binary search.',
					},
				],
			},
			{
				kicker: 'Module 6 · Heaps',
				title: 'Heaps and the Priority Queue',
				summary:
					'Heaps are the BST cousin in the binary-tree family: a complete tree that pins the min (or max) at the root for O(1) peek and O(log n) add/remove. The order property is parent-vs-child only, so siblings stay unordered, and a plain 1-indexed array with i/2, 2i, 2i+1 arithmetic backs the whole thing without pointers.',
				recall: [
					{
						q: 'In a 1-indexed array heap, how do you reach the parent, left child, and right child of index i?',
						a: 'parent = i/2 (integer floor), left child = 2*i, right child = 2*i + 1. Index 0 is left null, so the root sits at index 1 and every move is plain arithmetic, with no node pointers.',
					},
					{
						q: 'Why does add bubble up while removeMin bubbles down?',
						a: 'add appends at the next leaf and swims up against its parent only, until it is no longer smaller. removeMin moves the last element to the root, then sinks down, each level swapping with the smaller of the two children. Each walks one path in one direction.',
					},
				],
			},
			{
				kicker: 'Module 7 · HashMaps',
				title: 'HashMaps: O(1) average by hashing',
				summary:
					'This is where I stopped climbing a comparison tree and started computing the index straight from the key. The whole module is really about one unavoidable consequence, collisions, and the strategies for handling them.',
				recall: [
					{
						q: 'What are the two families of collision resolution?',
						a: 'Closed addressing keeps colliding keys at the original index in a chain. That is External or Separate Chaining, a linked list per bucket. Open addressing puts them elsewhere via probing: linear, quadratic, or double hashing. The notes lean hardest on External Chaining.',
					},
					{
						q: 'What is the load factor, and what happens when it crosses the threshold?',
						a: 'Load factor = size / capacity. When it crosses the threshold (typically 0.67 to 0.75), the table resizes: a larger backing array, and every live entry is rehashed with the new capacity. Resize is O(n).',
					},
				],
			},
		],
		concepts: [
			{
				title: 'The BST ordering invariant',
				body: 'For every node, all data in the left subtree is less than the node and all data in the right is greater. At each step you can discard half the candidates, which is what makes O(log n) search possible.',
				source: 'Module 4 · BST',
			},
			{
				title: 'SkipList express lanes',
				body: 'A SkipList stacks sorted linked lists; level 0 has every element and each insert flips a coin to promote a node up a level, P(level i) = (1/2)^i. Search moves right while the next node is smaller than the target and drops down when it would overshoot. The upper levels skip over data for O(log n) on average.',
				source: 'Module 5 · SkipLists',
			},
			{
				title: 'The heap is just an array',
				body: 'Because a heap is a complete binary tree, it fits a 1-indexed array with no gaps: the node at i has parent i/2 and children 2i and 2i+1. Completeness is exactly what makes that index arithmetic always land on a real node.',
				source: 'Module 6 · Heaps',
			},
			{
				title: 'Load factor and resize',
				body: 'Load factor = size / capacity, and crossing the threshold (typically 0.67 to 0.75) triggers a resize: a fresh, larger table where every entry is rehashed with the new capacity, an O(n) operation. Lower thresholds mean fewer collisions but more memory.',
				source: 'Module 7 · HashMaps',
			},
		],
		visuals: {
			bstTraversal: {
				title: 'BST traversals',
				description:
					'A fixed BST, built by inserting 13, 7, 29, 5, 11, 19. Pick a traversal and step through the visit order.',
				orderLabel: 'Traversal',
				outputLabel: 'Visit order',
				builtFromLabel: 'Built by inserting',
				modes: {
					inorder: {
						label: 'in-order',
						note: 'Left, node, right. On a BST this always comes out sorted: 5, 7, 11, 13, 19, 29.',
					},
					preorder: {
						label: 'pre-order',
						note: 'Node, left, right. Visits a node before its children, which is handy for copying a tree.',
					},
					postorder: {
						label: 'post-order',
						note: 'Left, right, node. Visits a node after both children, which is handy for deleting a tree.',
					},
				},
				previousLabel: 'Prev',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous traversal step',
				nextAriaLabel: 'Next traversal step',
				resetAriaLabel: 'Reset traversal',
			},
			bstRemoval: {
				title: 'BST removal (two-child)',
				description:
					'Removing 4 (the root) from a 7-node BST using the in-order successor, the GT course convention.',
				steps: [
					'Start at the root: 4 is the target, so the node to remove is the root itself.',
					'The target has two children (2 and 6), so it cannot just be detached, because that would drop a whole subtree.',
					'Find the in-order successor: step right to 6, then all the way left to 5. 5 has no left child, so it is the successor.',
					'Overwrite the target data with the successor: the root becomes 5. The node stays in place; only its value changes.',
					'Remove the old successor node 5 from its slot. It was a leaf, so its parent 6 just drops the link.',
					'Done: removal returned the original 4, and the tree is still a valid BST with 5 at the root.',
				],
				roleLabels: {
					target: 'target',
					successor: 'successor',
					promoted: 'promoted',
					removed: 'removed',
				},
				previousLabel: 'Prev',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous removal step',
				nextAriaLabel: 'Next removal step',
				resetAriaLabel: 'Reset removal',
			},
			heap: {
				title: 'Min-heap sift',
				description:
					'A 1-indexed min-heap. Add swims a value up; remove-min sinks the last leaf down. The array and tree stay in sync.',
				addLabel: 'Add',
				removeLabel: 'Remove min',
				resetLabel: 'Reset',
				arrayLabel: 'Backing array (1-indexed)',
				treeLabel: 'Complete tree',
				minLabel: 'min',
				emptyLabel: 'empty',
				statusLabels: {
					inserted: 'new',
					swapped: 'swap',
					root: 'min',
					settled: 'set',
				},
				messages: {
					initial: 'Add values to watch them swim up; remove the min to watch the last leaf sink.',
					add: (value) =>
						`Add ${value} at the next leaf, then swim up while it is smaller than its parent.`,
					removeMin: (value) =>
						`Remove min ${value}: move the last leaf to the root, then sink it past the smaller child.`,
					empty: 'The heap is empty. Add a value first.',
				},
			},
			hashMap: {
				title: 'HashMap collisions',
				description:
					'index = key mod capacity. Keys 5, 12, 19 all hash to bucket 5. Watch chaining vs linear probing resolve it, and a resize when the load factor crosses 0.75.',
				insertLabel: 'Insert',
				resetLabel: 'Reset',
				strategyLabel: 'Collision strategy',
				loadFactorLabel: 'Load factor',
				emptyLabel: 'empty',
				strategies: {
					chaining: 'separate chaining',
					probing: 'linear probing',
				},
				statusLabels: {
					placed: 'placed',
					collision: 'chained',
					probed: 'probed',
				},
				messages: {
					initial:
						'Insert keys to watch collisions resolve. Each key is its own hash; index = key mod capacity.',
					place: (key, index) =>
						`${key} mod capacity = ${index}: bucket ${index} is empty, so place it there.`,
					collide: (key, index) =>
						`${key} also maps to bucket ${index}, so separate chaining appends it to that bucket list.`,
					probe: (key, from, to) =>
						`${key} maps to ${from}, which is taken, so linear probing lands it at ${to}.`,
					resize: (capacity) =>
						`Load factor crossed the threshold, so resize and rehash every entry into a capacity-${capacity} table.`,
					full: 'The demo table is full. Reset to start over.',
				},
			},
		},
	},
	ko: {
		metaTitle: 'Data Structures & Algorithms II',
		metaDescription:
			'BST와 traversal, BST removal, SkipList, heap, HashMap을 다루는 인터랙티브 DSA II 학습 노트입니다.',
		eyebrow: 'Data Structures & Algorithms',
		title: 'DSA II를 정렬과 탐색을 지탱하는 구조로 뜯어봅니다.',
		subtitle:
			'이 페이지는 DSA I에서 이어지며, DSA II 노트에 있는 내용만 다룹니다. binary search tree와 traversal, BST removal과 SkipList, priority queue를 떠받치는 binary heap, 그리고 collision과 load factor를 다루는 HashMap입니다.',
		sections: {
			map: '학습 지도',
			lab: '시각 실험실',
			notes: '개념 노트',
			recall: '스스로 점검',
			inside: '구성',
		},
		coverage: [
			'DSA I에서 이어지는 Java와 Big-O 복습: Iterable/Iterator, Comparable과 Comparator, worst-case 증가율',
			'Binary search tree: left < node < right invariant과, 삽입 순서가 O(log n)이냐 한쪽으로 치우친 O(n) chain이냐를 가르는 점',
			'BST removal의 leaf / one-child / two-child 케이스, 그리고 coin flip으로 O(log n)에 도달하는 SkipList',
			'array 기반 priority queue로서의 binary heap: O(1) peek, O(log n) add와 remove',
			'HashMap: key를 bucket index로 hashing한 뒤, load factor 아래에서 chaining이나 probing으로 collision을 푸는 방식',
		],
		modules: [
			{
				kicker: 'Module 4 · BST',
				title: 'Binary Search Trees',
				summary:
					'BST는 정렬 규칙 하나가 붙은 binary tree입니다. 모든 노드에서 왼쪽 subtree는 더 작고 오른쪽은 더 크다는 invariant가, 트리를 O(log n)으로 검색할 수 있게 만드는 핵심입니다.',
				recall: [
					{
						q: 'BST의 ordering invariant는 무엇인가요?',
						a: '모든 노드에서 왼쪽 subtree의 데이터는 노드보다 작고, 오른쪽 subtree는 노드보다 큽니다. root뿐 아니라 모든 노드에서 재귀적으로 성립합니다.',
					},
					{
						q: 'BST 연산이 평균은 O(log n)인데 worst-case는 왜 O(n)인가요?',
						a: '균형 잡힌 트리에서는 비교마다 남은 노드의 절반이 떨어져 나가므로, 높이 약 log n인 경로만 따라가면 됩니다. 다만 모양이 삽입 순서에 달려 있어서, 이미 정렬된 값을 넣으면 한쪽으로 늘어진 chain이 되어 linked list처럼 동작하고 검색이 O(n)으로 떨어집니다.',
					},
				],
			},
			{
				kicker: 'Module 5 · BST ops + SkipLists',
				title: 'BST removal과 SkipList',
				summary:
					'BST removal의 세 가지 케이스를 직접 따라가 봤습니다. leaf, one-child, 그리고 까다로운 two-child 케이스인데, two-child는 in-order successor를 끌어올리는 GT 강의 기본 방식을 씁니다. 이어지는 SkipList는 트리 모양 대신 정렬된 linked list를 쌓고 coin flip으로 노드를 promote 하면서 같은 O(log n)에 도달합니다.',
				recall: [
					{
						q: '두 자식이 있는 BST 노드를 지울 때 왜 그냥 떼면 안 되고, 강의는 대신 무엇을 하나요?',
						a: '그냥 떼면 subtree 하나가 통째로 날아갑니다. 대신 노드 위치는 그대로 두고 데이터만 replacement로 덮어쓴 다음, 그 replacement 노드(자식이 0개나 1개)를 지웁니다. 강의는 in-order successor를 쓰는데, 오른쪽으로 한 칸 간 뒤 왼쪽 끝까지 내려가면 successor입니다.',
					},
					{
						q: 'SkipList는 평범한 linked list로 어떻게 O(log n) 기대 탐색을 얻나요?',
						a: '정렬된 list를 층층이 쌓습니다. level 0는 전부 갖고, 위 level마다 coin flip으로 promote된 부분집합만 둡니다(P(level i) = (1/2)^i). 위층은 express lane이라, 다음 노드가 target을 넘어설 때까지 오른쪽으로 가다가 넘칠 것 같으면 한 층 내려갑니다. binary search처럼 탐색 공간이 절반씩 줄어듭니다.',
					},
				],
			},
			{
				kicker: 'Module 6 · Heaps',
				title: 'Heap과 Priority Queue',
				summary:
					'heap은 binary-tree 집안에서 BST의 사촌 격입니다. min(또는 max)을 root에 박아두는 complete tree라 peek은 O(1), add/remove는 O(log n)입니다. 순서 규칙이 parent와 child 사이에만 있어서 sibling끼리는 정렬되지 않고, 그래서 1-indexed array에 i/2, 2i, 2i+1 산술만으로 전체를 깔 수 있습니다. pointer가 필요 없습니다.',
				recall: [
					{
						q: '1-indexed array heap에서 index i의 parent, left child, right child는 어떻게 구하나요?',
						a: 'parent = i/2(정수 내림), left child = 2*i, right child = 2*i + 1입니다. index 0은 비워 두므로 root는 index 1에 있고, 모든 이동이 pointer 없이 산술로 끝납니다.',
					},
					{
						q: 'add는 위로, removeMin은 아래로 가는 이유는?',
						a: 'add는 다음 leaf에 붙인 뒤 parent하고만 비교하며 더 작은 동안 위로 swim 합니다. removeMin은 마지막 원소를 root로 옮기고 아래로 sink 하는데, 매 층에서 더 작은 child와 swap 합니다. 둘 다 한 방향으로 한 경로만 따라갑니다.',
					},
				],
			},
			{
				kicker: 'Module 7 · HashMaps',
				title: 'HashMap: hashing으로 평균 O(1)',
				summary:
					'여기서부터는 comparison tree를 타고 내려가는 대신, key에서 바로 index를 계산하는 방식으로 넘어왔습니다. 모듈 전체가 사실상 하나의 피할 수 없는 결과인 collision, 그리고 그것을 어떻게 처리하느냐에 대한 이야기였습니다.',
				recall: [
					{
						q: 'collision resolution의 두 갈래는 무엇인가요?',
						a: 'closed addressing은 충돌한 key를 원래 index의 chain에 그대로 둡니다. bucket마다 linked list를 두는 External/Separate Chaining입니다. open addressing은 probing으로 다른 index에 두는데, linear, quadratic, double hashing이 있습니다. 노트는 External Chaining을 가장 비중 있게 다룹니다.',
					},
					{
						q: 'load factor는 무엇이고, threshold를 넘으면 어떻게 되나요?',
						a: 'load factor = size / capacity입니다. threshold(보통 0.67~0.75)를 넘으면 table을 resize 합니다. 더 큰 backing array를 만들고 살아 있는 entry를 전부 새 capacity로 rehash 합니다. resize는 O(n)입니다.',
					},
				],
			},
		],
		concepts: [
			{
				title: 'BST ordering invariant',
				body: '모든 노드에서 왼쪽 subtree는 노드보다 작고 오른쪽은 큽니다. 매 단계마다 후보의 절반을 버릴 수 있고, 이것이 O(log n) 검색을 가능하게 합니다.',
				source: 'Module 4 · BST',
			},
			{
				title: 'SkipList express lane',
				body: 'SkipList는 정렬된 linked list를 쌓습니다. level 0는 모든 원소를 갖고, 삽입마다 coin flip으로 노드를 한 층 promote 합니다(P(level i) = (1/2)^i). 탐색은 다음 노드가 target보다 작은 동안 오른쪽으로 가다가 넘칠 것 같으면 내려갑니다. 위층이 데이터를 건너뛰므로 평균 O(log n)이 나옵니다.',
				source: 'Module 5 · SkipLists',
			},
			{
				title: 'heap은 결국 array',
				body: 'heap은 complete binary tree라 빈칸 없는 1-indexed array에 딱 맞습니다. index i의 parent는 i/2, child는 2i와 2i+1입니다. completeness 덕분에 이 index 산술이 항상 실제 노드를 가리킵니다.',
				source: 'Module 6 · Heaps',
			},
			{
				title: 'load factor와 resize',
				body: 'load factor = size / capacity이고, threshold(보통 0.67~0.75)를 넘으면 resize가 일어납니다. 더 큰 table을 새로 만들고 모든 entry를 새 capacity로 rehash하는 O(n) 작업입니다. threshold가 낮을수록 collision은 줄지만 메모리는 더 씁니다.',
				source: 'Module 7 · HashMaps',
			},
		],
		visuals: {
			bstTraversal: {
				title: 'BST traversal',
				description:
					'13, 7, 29, 5, 11, 19를 삽입해 만든 고정 BST입니다. traversal을 고르면 방문 순서를 단계별로 따라갈 수 있습니다.',
				orderLabel: 'Traversal',
				outputLabel: '방문 순서',
				builtFromLabel: '삽입 순서',
				modes: {
					inorder: {
						label: 'in-order',
						note: 'Left, node, right. BST에서는 항상 정렬된 순서로 나옵니다: 5, 7, 11, 13, 19, 29.',
					},
					preorder: {
						label: 'pre-order',
						note: 'Node, left, right. 자식보다 노드를 먼저 방문하므로 트리 복사에 쓰기 좋습니다.',
					},
					postorder: {
						label: 'post-order',
						note: 'Left, right, node. 두 자식을 모두 본 뒤 노드를 방문하므로 트리 삭제에 쓰기 좋습니다.',
					},
				},
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 traversal 단계',
				nextAriaLabel: '다음 traversal 단계',
				resetAriaLabel: 'traversal 초기화',
			},
			bstRemoval: {
				title: 'BST removal (two-child)',
				description:
					'in-order successor(GT 강의 기본 방식)로 7개 노드 BST에서 root인 4를 지웁니다.',
				steps: [
					'root에서 시작합니다. 4가 target이므로, 지울 노드는 root 자신입니다.',
					'target에는 자식이 둘(2와 6) 있어서 그냥 뗄 수 없습니다. 떼면 subtree가 통째로 날아가기 때문입니다.',
					'in-order successor를 찾습니다. 오른쪽 6으로 갔다가 왼쪽 끝 5까지 내려갑니다. 5는 왼쪽 자식이 없으니 이것이 successor입니다.',
					'target 데이터를 successor로 덮어씁니다. root가 5가 됩니다. 노드는 그대로 있고 값만 바뀝니다.',
					'원래 successor였던 노드 5를 자리에서 지웁니다. leaf라서 parent인 6이 링크만 끊으면 됩니다.',
					'끝났습니다. removal은 원래 값 4를 돌려주고, 트리는 root가 5인 정상 BST로 남습니다.',
				],
				roleLabels: {
					target: 'target',
					successor: 'successor',
					promoted: '승격',
					removed: '삭제',
				},
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 removal 단계',
				nextAriaLabel: '다음 removal 단계',
				resetAriaLabel: 'removal 초기화',
			},
			heap: {
				title: 'Min-heap sift',
				description:
					'1-indexed min-heap입니다. add는 값을 위로 swim 시키고, remove min은 마지막 leaf를 아래로 sink 시킵니다. array와 tree가 같이 움직입니다.',
				addLabel: '추가',
				removeLabel: 'min 제거',
				resetLabel: '초기화',
				arrayLabel: 'backing array (1-indexed)',
				treeLabel: 'complete tree',
				minLabel: 'min',
				emptyLabel: '비어 있음',
				statusLabels: {
					inserted: '새 값',
					swapped: 'swap',
					root: 'min',
					settled: '고정',
				},
				messages: {
					initial:
						'값을 추가하면 위로 swim 하는 모습을, min을 제거하면 마지막 leaf가 내려가는 모습을 볼 수 있습니다.',
					add: (value) =>
						`${value}를 다음 leaf에 추가한 뒤, parent보다 작은 동안 위로 swim 합니다.`,
					removeMin: (value) =>
						`min ${value} 제거: 마지막 leaf를 root로 옮기고, 더 작은 child를 지나 아래로 sink 합니다.`,
					empty: 'heap이 비어 있습니다. 먼저 값을 추가해야 합니다.',
				},
			},
			hashMap: {
				title: 'HashMap collision',
				description:
					'index = key mod capacity입니다. key 5, 12, 19가 모두 bucket 5로 갑니다. chaining과 linear probing이 각각 이를 어떻게 푸는지, 그리고 load factor가 0.75를 넘을 때의 resize를 볼 수 있습니다.',
				insertLabel: '삽입',
				resetLabel: '초기화',
				strategyLabel: 'collision 전략',
				loadFactorLabel: 'load factor',
				emptyLabel: '비어 있음',
				strategies: {
					chaining: 'separate chaining',
					probing: 'linear probing',
				},
				statusLabels: {
					placed: '배치',
					collision: 'chain',
					probed: 'probe',
				},
				messages: {
					initial:
						'key를 삽입하면 collision이 풀리는 과정을 볼 수 있습니다. 각 key가 곧 hash이고, index = key mod capacity입니다.',
					place: (key, index) =>
						`${key} mod capacity = ${index}: bucket ${index}이 비어 있어 거기에 둡니다.`,
					collide: (key, index) =>
						`${key}도 bucket ${index}으로 가므로, separate chaining은 그 bucket 리스트에 이어 붙입니다.`,
					probe: (key, from, to) =>
						`${key}는 ${from}으로 가는데 차 있으므로, linear probing이 ${to}에 둡니다.`,
					resize: (capacity) =>
						`load factor가 threshold를 넘었으므로, capacity ${capacity} table로 resize 하고 전부 rehash 합니다.`,
					full: '데모 table이 가득 찼습니다. 초기화하면 처음부터 다시 시작할 수 있습니다.',
				},
			},
		},
	},
};

export function getDsaIIContent(locale: StudyLocale): DsaIIContent {
	return dsaIIContent[locale];
}

const dsaIIIContent: Record<StudyLocale, DsaIIIContent> = {
	en: {
		metaTitle: 'Data Structures & Algorithms III',
		metaDescription:
			'Interactive DSA III notes: AVL trees and rotations, (2,4) trees, and iterative plus divide-and-conquer sorting algorithms.',
		eyebrow: 'Data Structures & Algorithms',
		title: 'DSA III: self-balancing trees and divide-and-conquer algorithms.',
		subtitle:
			'Self-balancing trees keep search logarithmic no matter the insertion order, and divide-and-conquer breaks sorting into smaller subproblems that combine efficiently. These notes turn my Georgia Tech DSA III material into demos you can step through.',
		sections: {
			map: 'learning map',
			lab: 'visual lab',
			notes: 'concept notes',
			recall: 'test yourself',
			inside: "what's inside",
		},
		coverage: [
			'A Module 0 refresher on Java generics, Big-O, and the balance invariant that ties the course together.',
			'AVL trees: balance factors and the four rotations that restore O(log n) height.',
			'(2,4) trees: multi-way nodes that grow by splitting and shrink by fusing.',
			'Iterative sorts: bubble, insertion, selection, and cocktail shaker, compared by stability and adaptivity.',
			'Divide-and-conquer sorts: merge, quicksort, LSD radix, and quickselect, plus the comparison lower bound.',
		],
		modules: [
			{
				kicker: 'Module 8 · AVL',
				title: 'AVL Trees',
				summary:
					"A self-balancing BST that stores each node's balance factor and rotates when its magnitude passes one, so the tree height stays logarithmic no matter the insertion order.",
				recall: [
					{
						q: 'What is the AVL balance factor, and when does a rotation trigger?',
						a: 'Balance factor = height(left) − height(right). A node is fine at −1, 0, or 1; once the magnitude reaches 2 after an insert or delete, a rotation is required.',
					},
					{
						q: 'How many rotations can an insertion versus a deletion need?',
						a: 'An insertion needs at most one rotation at the lowest imbalanced node. A deletion can cascade up to O(log n) rotations, because each rebalance can shorten a subtree and unbalance an ancestor.',
					},
					{
						q: 'How do you tell the four rotation cases apart?',
						a: 'Left-heavy (BF +2): left child leaning left is LL (single right rotation), leaning right is LR (double). Right-heavy (BF −2): right child leaning right is RR (single left rotation), leaning left is RL (double).',
					},
					{
						q: 'What is height(null) by convention, and why does it matter?',
						a: 'height(null) = −1, so a leaf has height 0 and height(node) = 1 + max(child heights). It keeps balance-factor arithmetic consistent.',
					},
					{
						q: 'After a rotation, what do you recompute first?',
						a: 'Heights and balance factors of the rotated nodes, bottom-up: the demoted node first, then the promoted new subtree root, whose height depends on it.',
					},
				],
			},
			{
				kicker: 'Module 9 · (2,4)',
				title: '(2,4) Trees',
				summary:
					'A multi-way search tree whose nodes hold one to three keys and two to four children. It grows by splitting overflowing nodes and shrinks by borrowing or merging, keeping every leaf at the same depth.',
				recall: [
					{
						q: 'How does a (2,4) tree stay balanced without rotations?',
						a: 'Every leaf sits at the same depth. Overflow splits a 4-node and promotes its middle key upward, so height only ever grows at the root.',
					},
					{
						q: 'Transfer versus fusion on deletion: what is the difference?',
						a: 'When a node underflows, transfer borrows a key from an adjacent sibling through the parent if that sibling can spare one; otherwise fusion merges the node, a parent key, and the sibling into one.',
					},
					{
						q: 'Why is a (2,4) tree equivalent to a red-black tree?',
						a: 'Each (2,4) node maps to a small red-black cluster, and split/fuse correspond to red-black recolorings and rotations, so both give the same O(log n) guarantees.',
					},
				],
			},
			{
				kicker: 'Module 10 · Iterative sorts',
				title: 'Iterative Sorts',
				summary:
					'Bubble, insertion, selection, and cocktail-shaker sorts: quadratic comparison sorts separated by stability, adaptivity, in-place behavior, and how many comparisons versus swaps they make.',
				recall: [
					{
						q: 'Which iterative sorts are stable?',
						a: 'Bubble, insertion, and cocktail shaker are stable. Selection sort is not, because a long-distance swap can reorder equal keys.',
					},
					{
						q: 'Which iterative sort is adaptive, and what does that mean?',
						a: 'Insertion sort is adaptive: nearly-sorted input approaches O(n) because few shifts are needed. Selection sort always scans the full unsorted region.',
					},
					{
						q: 'Why would you pick selection sort despite its O(n²) time?',
						a: 'It makes at most O(n) swaps, the fewest of the quadratic sorts, which matters when a write is far more expensive than a comparison.',
					},
				],
			},
			{
				kicker: 'Module 11 · Divide & conquer',
				title: 'Divide & Conquer Sorts',
				summary:
					'Merge sort, randomized in-place quicksort with Hoare partition, non-comparison LSD radix sort, and quickselect for order statistics, all framed by the Ω(n log n) comparison lower bound.',
				recall: [
					{
						q: 'Why is O(n log n) a lower bound for comparison sorts?',
						a: 'A comparison sort is a decision tree with n! leaves, and a binary tree with n! leaves has height at least log₂(n!) = Ω(n log n).',
					},
					{
						q: 'Merge sort versus quicksort: stability and space?',
						a: 'Merge sort is stable and out-of-place (O(n) extra). Quicksort is in-place (O(log n) stack) but unstable; a randomized pivot gives expected O(n log n).',
					},
					{
						q: 'How does LSD radix sort beat the comparison lower bound?',
						a: 'It never compares keys. It distributes by digit into buckets, least-significant digit first, in O(k·n) for k digits, so Ω(n log n) does not apply.',
					},
					{
						q: 'What does quickselect do, and how fast is it?',
						a: 'It finds the kth smallest element in O(n) expected time by partitioning like quicksort but recursing into only the side that holds k.',
					},
				],
			},
		],
		concepts: [
			{
				title: 'The balance factor',
				body: 'Every AVL node stores height(left) − height(right). Keeping that in {−1, 0, 1} forces Θ(log n) height, so search, insert, and delete stay O(log n) regardless of insertion order.',
				source: 'Module 8 · AVL',
			},
			{
				title: 'One rotation on insert, many on delete',
				body: 'A single insertion unbalances at most one ancestor, fixed by one rotation. A deletion can shorten a subtree and cascade, so you may rotate at several nodes on the way back to the root.',
				source: 'Module 8 · AVL',
			},
			{
				title: 'Grow by splitting, shrink by fusing',
				body: 'A (2,4) tree never rotates. An overflowing node splits and promotes its middle key; an underflowing node borrows from a sibling (transfer) or merges (fusion). Height changes only at the root.',
				source: 'Module 9 · (2,4) Trees',
			},
			{
				title: 'Stability and adaptivity',
				body: 'Sorts differ by more than Big-O. Stability preserves the order of equal keys; adaptivity means near-sorted input runs faster. Insertion sort has both; selection sort has neither but minimizes swaps.',
				source: 'Module 10 · Iterative Sorts',
			},
			{
				title: 'The comparison lower bound',
				body: 'Any sort that only compares keys needs Ω(n log n) comparisons in the worst case, because its decision tree needs n! leaves. Merge and quicksort meet the bound; radix sort sidesteps it by not comparing.',
				source: 'Module 11 · Divide & Conquer',
			},
			{
				title: 'Partition, then recurse',
				body: 'Divide-and-conquer splits a problem, solves the parts, and combines. Merge sort splits evenly and merges; quicksort partitions around a pivot; quickselect recurses into just one partition for a linear-expected-time order statistic.',
				source: 'Module 11 · Divide & Conquer',
			},
		],
		visuals: {
			avl: {
				title: 'AVL insertion & deletion',
				description:
					'Insert 10, 5, 7 to trigger a left-right double rotation, then insert 3 and delete 10 to trigger a deletion rebalance.',
				balanceFactorLabel: 'BF',
				previousLabel: 'Back',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous step',
				nextAriaLabel: 'Next step',
				resetAriaLabel: 'Reset to first step',
				roleLabels: {
					insert: 'insert',
					imbalance: 'unbalanced',
					rotate: 'rotate',
					balanced: 'balanced',
					remove: 'remove',
				},
				steps: [
					'Insert 10 into the empty tree. One node, balance factor 0.',
					'Insert 5. It goes left of 10, so the root is left-heavy with balance factor +1, still in range.',
					'Insert 7. Plain BST placement puts it right of 5, pushing the root to balance factor +2: unbalanced, in a left-right (LR) shape.',
					'Left-rotate the left child so 7 moves above 5. The subtree is now left-left, ready for the outer rotation.',
					'Right-rotate the root. 7 becomes the new root with 5 and 10 as children, and every balance factor is back to 0.',
					'Now show deletion. Insert 3 to the left of 5 first, and the tree stays balanced.',
					'Delete 10. The root loses its right child and reaches balance factor +2, a left-left (LL) shape.',
					'A single right rotation lifts 5 to the root, with 3 and 7 as children, balanced again.',
				],
			},
			twoFour: {
				title: '(2,4) tree: split & fusion',
				description:
					'Insert 40 into a full node to force a split, then remove keys to watch a transfer and a fusion.',
				previousLabel: 'Back',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous step',
				nextAriaLabel: 'Next step',
				resetAriaLabel: 'Reset to first step',
				roleLabels: {
					overflow: 'overflow',
					promote: 'promote',
					underflow: 'underflow',
					transfer: 'transfer',
					fusion: 'fusion',
				},
				steps: [
					'Start with a full root [10, 20, 30]. A (2,4) node holds up to three keys.',
					'Insert 40. The node overflows to four keys, so it must split.',
					'Split: promote the second key (20) to a new root; [10] and [30, 40] become its children. Height grows only at the root.',
					'Remove 10. The left leaf underflows, but its sibling [30, 40] has a spare key.',
					'Transfer: 20 drops from the root into the left leaf and 30 moves up. Now root [30] over leaves [20] and [40].',
					'Remove 20. The left leaf underflows again, and this time the sibling [40] has no spare.',
					'Fusion: merge the empty leaf, the parent key 30, and [40] into [30, 40]. The root collapses and the height shrinks.',
				],
			},
			iterativeSort: {
				title: 'Bubble sort, pass by pass',
				description:
					'Bubble sort compares adjacent pairs and swaps out-of-order ones; the last-swap check stops once a pass makes no swaps.',
				previousLabel: 'Back',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous step',
				nextAriaLabel: 'Next step',
				resetAriaLabel: 'Reset to first step',
				steps: [
					'Bubble sort compares adjacent pairs and swaps them when out of order. Start: [5, 1, 4, 2, 8].',
					'Pass 1: 5 > 1, so swap. The larger value bubbles to the right.',
					'5 > 4, swap again.',
					'5 > 2, swap. The largest value keeps moving toward the end.',
					'5 < 8, no swap, so 8 is now in its final place.',
					'Pass 2: 1 stays before 4, but 4 > 2, so swap.',
					'4 < 5, no swap, so 5 is settled too.',
					'Pass 3 makes no swaps, so the last-swap check stops early. Sorted: [1, 2, 4, 5, 8].',
				],
			},
			dcSort: {
				title: 'Merge sort: divide & conquer',
				description:
					'Split the array down to single elements, then merge the sorted pieces back together.',
				previousLabel: 'Back',
				nextLabel: 'Next',
				resetLabel: 'Reset',
				previousAriaLabel: 'Previous step',
				nextAriaLabel: 'Next step',
				resetAriaLabel: 'Reset to first step',
				steps: [
					'Merge sort splits the array in half, sorts each half, then merges. Start: [5, 1, 4, 2].',
					'Divide: split into [5, 1] and [4, 2].',
					'Divide again until each piece is a single element, which is already sorted.',
					'Conquer: merge each pair in order, giving [1, 5] and [2, 4].',
					'Merge the two sorted halves by comparing fronts, producing [1, 2, 4, 5].',
				],
			},
		},
	},
	ko: {
		metaTitle: 'Data Structures & Algorithms III',
		metaDescription:
			'AVL 트리와 rotation, (2,4) tree, 그리고 iterative sort와 divide-and-conquer sort를 다루는 인터랙티브 DSA III 노트입니다.',
		eyebrow: 'Data Structures & Algorithms',
		title: 'DSA III: self-balancing 트리와 divide-and-conquer 알고리즘.',
		subtitle:
			'self-balancing 트리는 삽입 순서와 상관없이 search를 logarithmic하게 유지하고, divide-and-conquer는 정렬을 더 작은 부분 문제로 나눠 효율적으로 합칩니다. Georgia Tech DSA III에서 공부한 내용을 단계별로 따라가는 데모로 정리했습니다.',
		sections: {
			map: '학습 맵',
			lab: '비주얼 랩',
			notes: '개념 노트',
			recall: '스스로 점검',
			inside: '이 페이지 구성',
		},
		coverage: [
			'Java generic, Big-O, 그리고 과정 전체를 관통하는 balance invariant를 다시 짚는 Module 0 복습.',
			'AVL 트리: balance factor와 O(log n) 높이를 회복하는 네 가지 rotation.',
			'(2,4) tree: split으로 커지고 fusion으로 작아지는 multi-way 노드.',
			'Iterative sort: bubble, insertion, selection, cocktail shaker를 stability와 adaptivity로 비교.',
			'Divide-and-conquer sort: merge, quicksort, LSD radix, quickselect와 비교 정렬의 lower bound.',
		],
		modules: [
			{
				kicker: 'Module 8 · AVL',
				title: 'AVL Trees',
				summary:
					'각 노드의 balance factor를 저장하고 그 크기가 1을 넘으면 rotation으로 균형을 맞추는 self-balancing BST입니다. 덕분에 삽입 순서와 무관하게 트리 높이가 logarithmic하게 유지됩니다.',
				recall: [
					{
						q: 'AVL의 balance factor는 무엇이고, 언제 rotation이 필요한가요?',
						a: 'balance factor = height(left) − height(right)입니다. −1, 0, +1이면 정상이고, insert나 delete 후 크기가 2가 되면 rotation이 필요합니다.',
					},
					{
						q: 'insertion과 deletion은 각각 rotation이 몇 번 필요한가요?',
						a: 'insertion은 가장 아래의 불균형 노드에서 최대 한 번이면 됩니다. deletion은 균형을 맞출 때마다 subtree가 짧아져 조상이 다시 불균형해질 수 있어 최대 O(log n)번까지 연쇄될 수 있습니다.',
					},
					{
						q: '네 가지 rotation case는 어떻게 구분하나요?',
						a: 'left-heavy(BF +2)일 때 왼쪽 자식이 왼쪽으로 기울면 LL(single right rotation), 오른쪽으로 기울면 LR(double)입니다. right-heavy(BF −2)일 때 오른쪽 자식이 오른쪽이면 RR(single left rotation), 왼쪽이면 RL(double)입니다.',
					},
					{
						q: '관례상 height(null)은 무엇이고 왜 중요한가요?',
						a: 'height(null) = −1이라서 leaf의 높이가 0이 되고 height(node) = 1 + max(자식 높이)가 됩니다. balance factor 계산을 일관되게 유지해 줍니다.',
					},
					{
						q: 'rotation 후에는 무엇부터 다시 계산하나요?',
						a: 'rotation한 노드들의 height와 balance factor를 아래에서 위로 갱신합니다. 내려간 노드를 먼저, 그다음 그 높이에 의존하는 새 subtree root를 갱신합니다.',
					},
				],
			},
			{
				kicker: 'Module 9 · (2,4)',
				title: '(2,4) Trees',
				summary:
					'노드마다 key를 1~3개, 자식을 2~4개 갖는 multi-way search tree입니다. overflow된 노드를 split하며 커지고 빌리거나 merge하며 작아지는데, 모든 leaf가 같은 깊이에 유지됩니다.',
				recall: [
					{
						q: '(2,4) tree는 rotation 없이 어떻게 균형을 유지하나요?',
						a: '모든 leaf가 같은 깊이에 있습니다. overflow가 나면 4-node를 split하고 가운데 key를 위로 promote하므로, 높이는 오직 root에서만 늘어납니다.',
					},
					{
						q: 'deletion에서 transfer와 fusion의 차이는 무엇인가요?',
						a: '노드가 underflow되면, 인접 sibling이 여유가 있을 때 parent를 거쳐 key를 빌려오는 것이 transfer이고, 여유가 없으면 노드·parent key·sibling을 하나로 합치는 것이 fusion입니다.',
					},
					{
						q: '(2,4) tree가 red-black tree와 동등한 이유는?',
						a: '각 (2,4) 노드가 작은 red-black 클러스터에 대응하고, split/fuse가 red-black의 recoloring과 rotation에 대응합니다. 같은 O(log n)을 보장합니다.',
					},
				],
			},
			{
				kicker: 'Module 10 · Iterative sorts',
				title: 'Iterative Sorts',
				summary:
					'bubble, insertion, selection, cocktail shaker sort입니다. 모두 quadratic 비교 정렬이지만 stability, adaptivity, in-place 여부, 그리고 comparison 대 swap 횟수로 갈립니다.',
				recall: [
					{
						q: 'iterative sort 중 stable한 것은?',
						a: 'bubble, insertion, cocktail shaker는 stable합니다. selection sort는 멀리 떨어진 swap이 같은 key의 순서를 바꿀 수 있어 stable하지 않습니다.',
					},
					{
						q: 'adaptive한 iterative sort는 무엇이고 무슨 뜻인가요?',
						a: 'insertion sort가 adaptive합니다. 거의 정렬된 입력에서는 shift가 적어 O(n)에 가까워집니다. selection sort는 항상 정렬 안 된 구간 전체를 훑습니다.',
					},
					{
						q: 'O(n²)인데도 selection sort를 쓰는 이유는?',
						a: 'quadratic 정렬 중 swap이 최대 O(n)으로 가장 적습니다. write가 comparison보다 훨씬 비쌀 때 유리합니다.',
					},
				],
			},
			{
				kicker: 'Module 11 · Divide & conquer',
				title: 'Divide & Conquer Sorts',
				summary:
					'merge sort, Hoare partition을 쓰는 randomized in-place quicksort, 비교하지 않는 LSD radix sort, 그리고 order statistic을 위한 quickselect입니다. Ω(n log n) 비교 lower bound가 배경이 됩니다.',
				recall: [
					{
						q: '비교 정렬의 lower bound가 O(n log n)인 이유는?',
						a: '비교 정렬은 leaf가 n!개인 decision tree이고, leaf가 n!개인 이진 트리의 높이는 최소 log₂(n!) = Ω(n log n)이기 때문입니다.',
					},
					{
						q: 'merge sort와 quicksort의 stability와 공간은?',
						a: 'merge sort는 stable하고 out-of-place(O(n) 추가)입니다. quicksort는 in-place(O(log n) stack)지만 unstable하며, randomized pivot으로 기대 O(n log n)이 됩니다.',
					},
					{
						q: 'LSD radix sort는 어떻게 비교 lower bound를 넘나요?',
						a: 'key를 비교하지 않습니다. least-significant digit부터 자릿수별 bucket으로 분배해 k자리에 대해 O(k·n)으로 동작하므로 Ω(n log n)이 적용되지 않습니다.',
					},
					{
						q: 'quickselect는 무엇을 하고 얼마나 빠른가요?',
						a: 'quicksort처럼 partition하되 k가 있는 쪽으로만 재귀해서 k번째로 작은 원소를 기대 O(n)에 찾습니다.',
					},
				],
			},
		],
		concepts: [
			{
				title: 'balance factor',
				body: '모든 AVL 노드는 height(left) − height(right)를 저장합니다. 이 값을 {−1, 0, +1}로 유지하면 높이가 Θ(log n)이 되어 삽입 순서와 무관하게 search·insert·delete가 O(log n)에 머뭅니다.',
				source: 'Module 8 · AVL',
			},
			{
				title: 'insert는 한 번, delete는 여러 번',
				body: '한 번의 insertion은 조상 하나만 불균형하게 만들어 rotation 한 번이면 됩니다. deletion은 subtree를 짧게 만들어 연쇄될 수 있어 root로 돌아가는 길에 여러 노드에서 rotation할 수 있습니다.',
				source: 'Module 8 · AVL',
			},
			{
				title: 'split으로 크고 fusion으로 작게',
				body: '(2,4) tree는 rotation을 쓰지 않습니다. overflow 노드는 split하며 가운데 key를 promote하고, underflow 노드는 sibling에서 빌리거나(transfer) 합칩니다(fusion). 높이는 root에서만 바뀝니다.',
				source: 'Module 9 · (2,4) Trees',
			},
			{
				title: 'stability와 adaptivity',
				body: '정렬은 Big-O만으로 갈리지 않습니다. stability는 같은 key의 순서를 보존하고, adaptivity는 거의 정렬된 입력을 더 빠르게 처리합니다. insertion sort는 둘 다 갖고, selection sort는 둘 다 없지만 swap을 최소화합니다.',
				source: 'Module 10 · Iterative Sorts',
			},
			{
				title: '비교 정렬의 lower bound',
				body: 'key만 비교하는 정렬은 최악의 경우 Ω(n log n)번 비교해야 합니다. decision tree에 leaf가 n!개 필요하기 때문입니다. merge와 quicksort는 이 한계에 도달하고, radix sort는 비교하지 않아 이를 우회합니다.',
				source: 'Module 11 · Divide & Conquer',
			},
			{
				title: 'partition 후 재귀',
				body: 'divide-and-conquer는 문제를 나누고, 부분을 풀고, 합칩니다. merge sort는 반씩 나눠 merge하고, quicksort는 pivot을 기준으로 partition하며, quickselect는 한쪽 partition으로만 재귀해 기대 선형 시간에 order statistic을 찾습니다.',
				source: 'Module 11 · Divide & Conquer',
			},
		],
		visuals: {
			avl: {
				title: 'AVL 삽입과 삭제',
				description:
					'10, 5, 7을 넣어 left-right double rotation을 일으킨 뒤, 3을 넣고 10을 지워 deletion 후 rebalance를 봅니다.',
				balanceFactorLabel: 'BF',
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 단계',
				nextAriaLabel: '다음 단계',
				resetAriaLabel: '첫 단계로 초기화',
				roleLabels: {
					insert: 'insert',
					imbalance: '불균형',
					rotate: 'rotate',
					balanced: '균형',
					remove: '삭제',
				},
				steps: [
					'빈 트리에 10을 insert합니다. 노드 하나, balance factor 0.',
					'5를 insert합니다. 10의 왼쪽으로 가서 root가 balance factor +1로 left-heavy가 되지만 아직 정상 범위입니다.',
					'7을 insert합니다. 일반 BST 규칙으로 5의 오른쪽에 놓이면서 root가 balance factor +2가 됩니다. left-right(LR) 모양의 불균형입니다.',
					'왼쪽 자식을 left-rotate해서 7을 5 위로 올립니다. 이제 subtree가 left-left 모양이 되어 바깥 rotation 준비가 됩니다.',
					'root를 right-rotate합니다. 7이 새 root가 되고 5와 10이 자식이 되며, 모든 balance factor가 0으로 돌아옵니다.',
					'이번엔 deletion을 봅니다. 먼저 3을 5의 왼쪽에 insert합니다. 트리는 균형을 유지합니다.',
					'10을 삭제합니다. root가 오른쪽 자식을 잃고 balance factor +2, 즉 left-left(LL) 모양이 됩니다.',
					'single right rotation으로 5가 root로 올라가고 3과 7이 자식이 됩니다. 다시 균형입니다.',
				],
			},
			twoFour: {
				title: '(2,4) tree: split과 fusion',
				description:
					'가득 찬 노드에 40을 insert해 split을 일으키고, 이어서 key를 remove하며 transfer와 fusion을 살펴봅니다.',
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 단계',
				nextAriaLabel: '다음 단계',
				resetAriaLabel: '첫 단계로 초기화',
				roleLabels: {
					overflow: 'overflow',
					promote: 'promote',
					underflow: 'underflow',
					transfer: 'transfer',
					fusion: 'fusion',
				},
				steps: [
					'가득 찬 root [10, 20, 30]에서 시작합니다. (2,4) 노드는 key를 최대 3개까지 담습니다.',
					'40을 insert합니다. 노드가 key 4개로 overflow되어 split해야 합니다.',
					'Split: 두 번째 key(20)를 새 root로 promote하고, [10]과 [30, 40]이 자식이 됩니다. 높이는 root에서만 늘어납니다.',
					'10을 remove합니다. 왼쪽 leaf가 underflow되지만 sibling [30, 40]에 여유 key가 있습니다.',
					'Transfer: 20이 root에서 왼쪽 leaf로 내려오고 30이 위로 올라갑니다. 이제 root [30] 아래에 leaf [20]과 [40]이 있습니다.',
					'20을 remove합니다. 왼쪽 leaf가 다시 underflow되는데, 이번엔 sibling [40]에 여유가 없습니다.',
					'Fusion: 빈 leaf, 부모 key 30, [40]을 [30, 40]으로 합칩니다. root가 collapse되고 높이가 줄어듭니다.',
				],
			},
			iterativeSort: {
				title: 'Bubble sort, pass별로',
				description:
					'Bubble sort는 인접한 쌍을 비교해 순서가 어긋나면 swap하고, 한 pass에서 swap이 없으면 last-swap 검사로 멈춥니다.',
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 단계',
				nextAriaLabel: '다음 단계',
				resetAriaLabel: '첫 단계로 초기화',
				steps: [
					'Bubble sort는 인접한 쌍을 비교해 순서가 어긋나면 swap합니다. 시작: [5, 1, 4, 2, 8].',
					'Pass 1: 5 > 1이라 swap합니다. 큰 값이 오른쪽으로 올라갑니다.',
					'5 > 4, 다시 swap합니다.',
					'5 > 2, swap합니다. 가장 큰 값이 계속 끝으로 이동합니다.',
					'5 < 8, swap 안 합니다. 이제 8이 제자리에 놓였습니다.',
					'Pass 2: 1은 4 앞에 그대로 있고, 4 > 2라 swap합니다.',
					'4 < 5, swap 안 합니다. 5도 자리를 잡았습니다.',
					'Pass 3에서 swap이 없으므로 last-swap 검사로 조기 종료합니다. 정렬 완료: [1, 2, 4, 5, 8].',
				],
			},
			dcSort: {
				title: 'Merge sort: divide & conquer',
				description: '배열을 원소 하나까지 나눈 뒤, 정렬된 조각들을 다시 merge합니다.',
				previousLabel: '이전',
				nextLabel: '다음',
				resetLabel: '초기화',
				previousAriaLabel: '이전 단계',
				nextAriaLabel: '다음 단계',
				resetAriaLabel: '첫 단계로 초기화',
				steps: [
					'Merge sort는 배열을 반으로 나누고 각 반을 정렬한 뒤 merge합니다. 시작: [5, 1, 4, 2].',
					'Divide: [5, 1]과 [4, 2]로 나눕니다.',
					'각 조각이 원소 하나가 될 때까지 다시 나눕니다. 원소 하나는 이미 정렬된 상태입니다.',
					'Conquer: 각 쌍을 순서대로 merge해 [1, 5]와 [2, 4]를 만듭니다.',
					'정렬된 두 반을 front끼리 비교하며 merge해 [1, 2, 4, 5]를 얻습니다.',
				],
			},
		},
	},
};

export function getDsaIIIContent(locale: StudyLocale): DsaIIIContent {
	return dsaIIIContent[locale];
}
