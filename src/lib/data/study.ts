export type StudyLocale = 'en' | 'ko';

export interface StudySourceFile {
	path: string;
	sha256: string;
	role: 'index' | 'primary-note' | 'slide-summary';
}

export interface StudyNavLabels {
	home: string;
	about: string;
	posts: string;
	study: string;
	search: string;
	system: string;
}

export interface StudyIndexCourse {
	slug: string;
	title: string;
	status: string;
	href: string;
	summary: string;
	learned: string[];
	modules: string[];
	sourceCount: string;
	updated: string;
}

export interface StudyIndexContent {
	metaTitle: string;
	metaDescription: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	nav: StudyNavLabels;
	sections: {
		courses: string;
		workflow: string;
	};
	courses: StudyIndexCourse[];
	workflow: {
		title: string;
		body: string;
		items: string[];
	};
}

export interface DsaModule {
	kicker: string;
	title: string;
	summary: string;
	points: string[];
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

export interface RecursionTraceCopy {
	title: string;
	previousLabel: string;
	nextLabel: string;
	resetLabel: string;
	previousAriaLabel: string;
	nextAriaLabel: string;
	resetAriaLabel: string;
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

export interface BinarySearchVisualizerCopy {
	title: string;
	targetLabel: string;
	previousLabel: string;
	nextLabel: string;
	resetLabel: string;
	previousAriaLabel: string;
	nextAriaLabel: string;
	resetAriaLabel: string;
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
	nav: StudyNavLabels;
	sections: {
		map: string;
		lab: string;
		notes: string;
		source: string;
	};
	coverage: string[];
	modules: DsaModule[];
	concepts: DsaConceptCard[];
	source: {
		title: string;
		body: string;
		rootLabel: string;
		policy: string[];
	};
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
		sourceFiles: string;
	};
	visuals: DsaVisualsCopy;
}

export const DSA_I_SOURCE_ROOT_LABEL = 'personal/study/gt-dsa/dsa-i';

export const DSA_I_SOURCE_FILES: StudySourceFile[] = [
	{
		path: '_index.md',
		sha256: '73d4f27cd7f83f628bd2cbb5693abb9365bca62066fa72f0898c6a4f66bee595',
		role: 'index',
	},
	{
		path: 'm0-java-review.md',
		sha256: 'f27c8973edcbbc6edd6f05f68edb30407dbb830a832a465c6002ce61b8800434',
		role: 'primary-note',
	},
	{
		path: 'm0-iterable-comparable.md',
		sha256: 'b282186381e2a2823adc491d18f5efce82ec3854e477b20bf21665676f1b1d62',
		role: 'primary-note',
	},
	{
		path: 'm0-big-o-concepts.md',
		sha256: '90226695deeac36e4976f8536fb8265e3f93beb48e49b23de4151ec9677b57f9',
		role: 'primary-note',
	},
	{
		path: 'm1-arrays-and-arraylists.md',
		sha256: 'bfdeb22d06e9060adf1830fbd460b507cadfde776adf6694594d48eccf4f647d',
		role: 'primary-note',
	},
	{
		path: 'm1-recursion.md',
		sha256: 'f7f474841026693451544d2e213c5547193507df55b3f52b8eca4db3bd5f062f',
		role: 'primary-note',
	},
	{
		path: 'm2-linked-lists.md',
		sha256: '10e2ac72639a0d12e4fcd41004c5eaad3ae341a2cf56483d466169efe599af84',
		role: 'primary-note',
	},
	{
		path: 'm3-stacks-and-queues.md',
		sha256: '7ac6c8ec14bc3f9a893ad01c5049e84267fc4d2291b37513f3d1f14bf1a8f6c6',
		role: 'primary-note',
	},
	{
		path: 'refs/m0-analysis-of-algorithms-summary.md',
		sha256: 'e5177c1629647fa637488eafb9f7ee8b57304ae175ef341afe1d2c2d59398568',
		role: 'slide-summary',
	},
	{
		path: 'refs/m0-iterators-summary.md',
		sha256: 'd3af23e0bc26e52cf7b2ec5ba0fe124eae68e7bbe32f760bd3449b85ffa4623e',
		role: 'slide-summary',
	},
	{
		path: 'refs/m1-arrays-arraylist-summary.md',
		sha256: 'c69c36c0cedc15e679719b6e808ff5354e3d1f0b51931189f04ea498698c403e',
		role: 'slide-summary',
	},
	{
		path: 'refs/m1-recursion-summary.md',
		sha256: '716d4a7ba95648d607b6d99009f961a0f7cea85086e9eb75af39b8b345b3101f',
		role: 'slide-summary',
	},
	{
		path: 'refs/m2-iterators-summary.md',
		sha256: 'f20d6a73a10d0a60d3166fc1bd96de7dfbe771787706b77d787d829ba09471c4',
		role: 'slide-summary',
	},
	{
		path: 'refs/m2-linked-list-variations-summary.md',
		sha256: '1ce8d2a3bcf9d4d9d8b78280b561686e912fde48bca2a325444011f295a9e04b',
		role: 'slide-summary',
	},
	{
		path: 'refs/m2-singly-linked-lists-summary.md',
		sha256: '8b70103d86ad5dbb6ed95d9efa48d8995671e314e1335e461651ae0dc410d39f',
		role: 'slide-summary',
	},
];

const nav: Record<StudyLocale, StudyNavLabels> = {
	en: {
		home: 'Home',
		about: 'About',
		posts: 'Posts',
		study: 'Study',
		search: 'Search',
		system: '3B',
	},
	ko: {
		home: '홈',
		about: '소개',
		posts: '글',
		study: '스터디',
		search: '검색',
		system: '3B',
	},
};

const indexContent: Record<StudyLocale, StudyIndexContent> = {
	en: {
		metaTitle: 'Study',
		metaDescription:
			'Study notes and visual learning pages by Brandon Wie, starting with Data Structures and Algorithms I.',
		eyebrow: 'Study',
		title: 'A public study shelf for material I have actually worked through.',
		subtitle:
			'The first section turns my Georgia Tech DSA I notes into inspectable examples, with source tracking back to 3B so the public page does not drift from what I learned.',
		nav: nav.en,
		sections: {
			courses: 'current courses',
			workflow: 'how this stays synced',
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
				sourceCount: `${DSA_I_SOURCE_FILES.length} tracked files`,
				updated: '2026-06-18',
			},
		],
		workflow: {
			title: '3B remains the source of truth.',
			body: 'The public page is curated from a source registry instead of becoming a second notebook. When files in 3B change, the drift check flags the page for review before the study section grows.',
			items: [
				'Raw study notes live in 3B under personal/study/gt-dsa/dsa-i.',
				'The site keeps a small curated data model and source hashes.',
				'Future courses can add one registry entry, one page, and one validation row.',
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
			'첫 섹션은 Georgia Tech DSA I 노트를 시각 예제로 바꾼 것입니다. 3B 원본과 해시를 함께 추적해 공개 페이지가 학습 기록에서 벗어나지 않게 합니다.',
		nav: nav.ko,
		sections: {
			courses: '현재 과정',
			workflow: '동기화 방식',
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
				sourceCount: `${DSA_I_SOURCE_FILES.length}개 파일 추적`,
				updated: '2026-06-18',
			},
		],
		workflow: {
			title: '3B가 원본입니다.',
			body: '공개 페이지를 또 하나의 노트로 만들지 않고, 원본 파일 목록과 해시 위에 얇은 큐레이션 레이어로 둡니다. 3B 파일이 바뀌면 drift check가 먼저 알려줍니다.',
			items: [
				'원본 학습 노트는 3B의 personal/study/gt-dsa/dsa-i에 둡니다.',
				'사이트는 공개용 데이터 모델과 소스 해시만 유지합니다.',
				'다음 과정은 registry, page, validation row를 추가하는 방식으로 확장합니다.',
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
		nav: nav.en,
		sections: {
			map: 'learning map',
			lab: 'visual lab',
			notes: 'source-backed notes',
			source: 'source control',
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
				kicker: 'Module 0',
				title: 'Foundations and Java review',
				summary:
					'The notes start by translating Java syntax, generics, wrapper types, Iterable, Iterator, Comparable, and Comparator into concepts familiar from JS/TS.',
				points: [
					'Enhanced for loops use iterators',
					'Comparable owns natural order',
					'Comparator is an external ordering rule',
				],
			},
			{
				kicker: 'Module 0',
				title: 'Big-O and primitive operations',
				summary:
					'Big-O is treated as the tightest reasonable upper bound for worst-case growth, after dropping constants and lower-order terms.',
				points: [
					'Count primitive operations',
					'Use the tightest bound',
					'Constants can still matter in practice',
				],
			},
			{
				kicker: 'Module 1',
				title: 'Arrays, ArrayLists, recursion',
				summary:
					'ArrayLists use a backing array, shift elements for middle insert/remove, and resize by copying into a larger array. Recursion needs a base case and progress toward it.',
				points: [
					'addToBack is amortized O(1)',
					'addAtIndex shifts right',
					'Binary search halves the window',
				],
			},
			{
				kicker: 'Module 2',
				title: 'Linked lists',
				summary:
					'Linked lists trade random access for pointer updates. The notes compare SLL, DLL, and CLL edge cases and operation costs.',
				points: [
					'SLL removeFromBack is O(n)',
					'DLL tail.prev makes back removal O(1)',
					'CLL can add to both ends with a data swap trick',
				],
			},
			{
				kicker: 'Module 3',
				title: 'Stacks and queues',
				summary:
					'Stacks restrict work to one end. Queues add at the back and remove at the front. ArrayQueue uses a circular array and unwraps on resize.',
				points: [
					'Stack is LIFO',
					'Queue is FIFO',
					'ArrayQueue enqueue index is (front + size) % capacity',
				],
			},
		],
		concepts: [
			{
				title: 'ArrayList resize',
				body: 'When the backing array is full, the implementation creates a larger array and copies existing elements before adding new data.',
				source: 'm1-arrays-and-arraylists.md',
			},
			{
				title: 'Recursion trace',
				body: 'Each recursive call waits on a smaller call until the base case returns, then results unwind back up the call stack.',
				source: 'm1-recursion.md + refs/m1-recursion-summary.md',
			},
			{
				title: 'Circular queue',
				body: 'ArrayQueue keeps a front index. Enqueue lands at (front + size) % capacity; dequeue advances front by one modulo capacity.',
				source: 'm3-stacks-and-queues.md',
			},
		],
		source: {
			title: 'Managed as a curated projection, not a second notebook.',
			body: 'The page is intentionally smaller than the study folder. It should publish only stable learning checkpoints and visual examples that can be traced back to 3B.',
			rootLabel: DSA_I_SOURCE_ROOT_LABEL,
			policy: [
				'Add new topics only after they exist in the 3B study notes.',
				'Run pnpm study:check before shipping study-page changes.',
				'When hashes drift, review the source notes and update the public model deliberately.',
			],
		},
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
			sourceFiles: 'source files',
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
		nav: nav.ko,
		sections: {
			map: '학습 지도',
			lab: '시각 실험실',
			notes: '원본 기반 노트',
			source: '원본 관리',
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
				kicker: 'Module 0',
				title: '기초와 Java review',
				summary:
					'Java 문법, generics, wrapper type, Iterable, Iterator, Comparable, Comparator를 JS/TS와 연결해 정리했습니다.',
				points: [
					'Enhanced for loop는 iterator를 사용합니다',
					'Comparable은 자연 정렬입니다',
					'Comparator는 외부 정렬 규칙입니다',
				],
			},
			{
				kicker: 'Module 0',
				title: 'Big-O와 primitive operations',
				summary:
					'Big-O는 worst-case growth에 대한 가장 타이트한 upper bound로 사용하고, 상수와 낮은 차수 항은 제거합니다.',
				points: [
					'primitive operation을 셉니다',
					'가능한 가장 타이트한 bound를 씁니다',
					'실무에서는 상수도 체감될 수 있습니다',
				],
			},
			{
				kicker: 'Module 1',
				title: 'Arrays, ArrayLists, recursion',
				summary:
					'ArrayList는 backing array를 사용하고, 중간 삽입/삭제에서 원소를 shift하며, 꽉 차면 더 큰 배열로 복사합니다. 재귀는 base case와 base case로 향하는 변화가 필요합니다.',
				points: [
					'addToBack은 amortized O(1)',
					'addAtIndex는 오른쪽으로 shift',
					'Binary search는 탐색 범위를 절반으로 줄입니다',
				],
			},
			{
				kicker: 'Module 2',
				title: 'Linked lists',
				summary:
					'LinkedList는 random access를 포기하는 대신 포인터 갱신으로 데이터를 조작합니다. SLL, DLL, CLL의 edge case와 비용을 비교했습니다.',
				points: [
					'SLL removeFromBack은 O(n)',
					'DLL은 tail.prev로 뒤 삭제가 O(1)',
					'CLL은 data-swap trick으로 양끝 삽입을 처리합니다',
				],
			},
			{
				kicker: 'Module 3',
				title: 'Stacks and queues',
				summary:
					'Stack은 한쪽 끝만 사용하고, Queue는 뒤에 넣고 앞에서 뺍니다. ArrayQueue는 circular array를 쓰며 resize 때 unwrap합니다.',
				points: [
					'Stack은 LIFO',
					'Queue는 FIFO',
					'ArrayQueue enqueue 위치는 (front + size) % capacity',
				],
			},
		],
		concepts: [
			{
				title: 'ArrayList resize',
				body: 'backing array가 가득 차면 더 큰 배열을 만들고 기존 원소를 복사한 뒤 새 데이터를 넣습니다.',
				source: 'm1-arrays-and-arraylists.md',
			},
			{
				title: 'Recursion trace',
				body: '각 recursive call은 더 작은 call을 기다립니다. base case가 반환되면 call stack이 거꾸로 풀립니다.',
				source: 'm1-recursion.md + refs/m1-recursion-summary.md',
			},
			{
				title: 'Circular queue',
				body: 'ArrayQueue는 front index를 유지합니다. Enqueue는 (front + size) % capacity에 들어가고, dequeue는 front를 modulo로 한 칸 이동합니다.',
				source: 'm3-stacks-and-queues.md',
			},
		],
		source: {
			title: '두 번째 노트가 아니라 공개용 projection으로 관리합니다.',
			body: '스터디 폴더 전체를 그대로 공개하지 않고, 안정된 학습 checkpoint와 시각 예제만 골라 3B 원본에 연결합니다.',
			rootLabel: DSA_I_SOURCE_ROOT_LABEL,
			policy: [
				'새 주제는 먼저 3B study note에 존재해야 합니다.',
				'스터디 페이지 변경 전 pnpm study:check를 실행합니다.',
				'해시가 바뀌면 원본 노트를 검토하고 공개 모델을 의도적으로 갱신합니다.',
			],
		},
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
			sourceFiles: '개 원본 파일',
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
