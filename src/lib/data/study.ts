export type StudyLocale = 'en' | 'ko';

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
	meta: string;
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
	nav: StudyNavLabels;
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
			'The first section turns my Georgia Tech DSA I notes into inspectable, interactive examples — visual demos plus quick recall prompts to keep the material in long-term memory.',
		nav: nav.en,
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
		nav: nav.ko,
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
		nav: nav.en,
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
		nav: nav.ko,
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
