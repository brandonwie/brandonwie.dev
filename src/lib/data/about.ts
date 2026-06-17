export type AboutLocale = 'en' | 'ko';

export interface AboutMetric {
	value: string;
	label: string;
	tone: 'accent' | 'foam' | 'gold' | 'rose';
}

export interface AboutTimelineItem {
	year: string;
	title: string;
	body: string;
}

export interface AboutPrinciple {
	title: string;
	body: string;
}

export interface AboutSystem {
	title: string;
	kicker: string;
	body: string;
	href: string;
	image: string;
	alt: string;
}

export interface AboutLink {
	label: string;
	href: string;
	external?: boolean;
}

export interface AboutContent {
	metaTitle: string;
	metaDescription: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	intro: string[];
	metrics: AboutMetric[];
	visualCaption: string;
	visualLayers: string[];
	sections: {
		arc: string;
		now: string;
		systems: string;
		principles: string;
		learning: string;
	};
	timeline: AboutTimelineItem[];
	now: AboutPrinciple[];
	systems: AboutSystem[];
	principles: AboutPrinciple[];
	learning: {
		kicker: string;
		title: string;
		body: string;
		items: string[];
	};
	links: AboutLink[];
}

const content: Record<AboutLocale, AboutContent> = {
	en: {
		metaTitle: 'About Brandon Wie',
		metaDescription:
			'About Brandon Wie: Seoul-based backend and DevOps-focused software engineer building toward AI systems.',
		eyebrow: 'About Brandon',
		title: 'I came from film, stayed for systems, and now build toward AI infrastructure.',
		subtitle:
			'Product engineer in Seoul, co-leading backend at Moba and sole-maintaining the calendar sync system across backend, infrastructure, and production recovery work.',
		intro: [
			'I started in film and theatre, moved into software in 2019, and grew through frontend, full-stack, backend, DevOps, and AI-native engineering work.',
			'The through-line is not a title. It is the way I work: trace the system, name the tradeoffs, verify with tests and logs, then write down what changed my mind.',
		],
		metrics: [
			{ value: 'Seoul', label: 'Korean / English', tone: 'accent' },
			{ value: '7M', label: 'calendar events under full sync', tone: 'foam' },
			{ value: '5-20x', label: 'sync throughput improvement range', tone: 'gold' },
			{ value: '2019', label: 'software switch from film', tone: 'rose' },
		],
		visualCaption: 'Current operating surface',
		visualLayers: [
			'Backend systems',
			'AWS / Terraform',
			'Airflow ETL',
			'Agent workflows',
			'3B knowledge layer',
		],
		sections: {
			arc: 'career arc',
			now: 'what I build now',
			systems: 'personal systems',
			principles: 'operating principles',
			learning: 'learning edge',
		},
		timeline: [
			{
				year: '2004-2012',
				title: 'Film and theatre at Hanyang',
				body: 'Studied cinematography, film directing, sound, and editing before software became the craft.',
			},
			{
				year: '2019-2021',
				title: 'Self-study into engineering',
				body: 'Built a foundation through JavaScript, Java, C, Nand2Tetris, algorithms, and production-oriented web work.',
			},
			{
				year: '2021-2025',
				title: 'Frontend to backend ownership',
				body: 'Worked across MODULABS, Moviation, and Playtag, moving from product UI to full-stack delivery, service migration, and production operations.',
			},
			{
				year: '2025-now',
				title: 'Moba backend, DevOps, and AI data systems',
				body: 'Sole maintainer for calendar sync while also owning billing surfaces, real-time updates, AWS/Terraform infrastructure, and Airflow-based data pipelines.',
			},
		],
		now: [
			{
				title: 'Calendar sync at product scale',
				body: 'Took a fragile single-calendar, one-year sync path into full Google/Apple multi-account and multi-calendar sync across 7M events.',
			},
			{
				title: 'Infrastructure that the team can operate',
				body: 'Terraform, GitHub Actions, ECS, RDS, S3, DynamoDB state, WAF hardening, and deployment paths that fail visibly.',
			},
			{
				title: 'Data systems moving toward AI',
				body: 'Airflow ingestion, Amplitude ETL completeness, product analytics, and the path from local prototypes to production pipelines.',
			},
		],
		systems: [
			{
				title: '3B',
				kicker: "Brandon's Binary Brain",
				body: 'A version-controlled personal operating system for notes, agent rules, skills, reviewer loops, and decision memory.',
				href: '/system/3b',
				image: '/og/claude-code-agent-teams.png',
				alt: 'Generated topic image for Claude Code agent team workflows',
			},
			{
				title: 'Crucio',
				kicker: 'AI knowledge platform',
				body: 'A personal AI system for model experimentation, knowledge workflows, and pipeline inspection.',
				href: 'https://crucio.brandonwie.dev',
				image: '/og/ai-code-review-patterns.png',
				alt: 'Generated topic image for AI code review patterns',
			},
			{
				title: 'brandonwie.dev',
				kicker: 'public learning surface',
				body: 'The place where production notes become essays after the evidence is strong enough to share.',
				href: '/',
				image: '/og/paraglide-i18n.png',
				alt: 'Generated topic image for the Paraglide i18n system used by this site',
			},
		],
		principles: [
			{
				title: 'Correctness before cleverness',
				body: 'Timezones, recurrence rules, soft deletes, orphan rows, and race conditions deserve boring precision.',
			},
			{
				title: 'Evidence beats confidence',
				body: 'I use AI heavily, but decisions still need tests, logs, diffs, production data, and explicit ownership.',
			},
			{
				title: 'Write the tradeoff down',
				body: 'Good systems work is remembering why a decision was reasonable when the context is no longer fresh.',
			},
		],
		learning: {
			kicker: 'Building toward',
			title: 'MLOps and AI engineering, without pretending the work is already done.',
			body: 'The next edge is deeper computer science and AI systems work: graduate-level foundations, production ML infrastructure, and tools that make agents easier to verify.',
			items: [
				'Georgia Tech OMSCS target: Spring 2027',
				'GTx math and algorithms certificates',
				'AWS Developer and Solutions Architect track',
				'Operating systems, concurrency, and lower-level systems depth',
			],
		},
		links: [
			{ label: 'Read the system map', href: '/system/3b' },
			{ label: 'LinkedIn', href: 'https://linkedin.com/in/brandonwie', external: true },
			{ label: 'GitHub', href: 'https://github.com/brandonwie', external: true },
			{ label: 'Email', href: 'mailto:brandon@brandonwie.dev' },
		],
	},
	ko: {
		metaTitle: 'Brandon Wie 소개',
		metaDescription:
			'영화에서 소프트웨어로 넘어와 백엔드, DevOps, AI 시스템 쪽으로 일하고 있는 Brandon Wie 소개.',
		eyebrow: 'Brandon 소개',
		title: '영화에서 시작했고, 시스템에 남았고, 지금은 AI 인프라 쪽으로 만들고 있습니다.',
		subtitle:
			'서울에서 일하는 Product Engineer입니다. Moba에서 백엔드를 함께 리드하고, 캘린더 동기화 시스템은 백엔드부터 인프라까지 단독으로 유지보수합니다.',
		intro: [
			'영화와 연극을 전공한 뒤 2019년에 소프트웨어로 방향을 바꿨습니다. 프론트엔드, 풀스택, 백엔드, DevOps, AI-native 워크플로를 지나 지금의 작업 방식이 만들어졌습니다.',
			'저를 설명하는 중심은 직함보다 일하는 방식에 가깝습니다. 시스템을 추적하고, 트레이드오프를 이름 붙이고, 테스트와 로그로 확인한 뒤, 생각이 바뀐 지점을 기록합니다.',
		],
		metrics: [
			{ value: 'Seoul', label: 'Korean / English', tone: 'accent' },
			{ value: '700만', label: '전체 동기화 캘린더 이벤트', tone: 'foam' },
			{ value: '5-20x', label: '동기화 처리량 개선 범위', tone: 'gold' },
			{ value: '2019', label: '영화에서 소프트웨어로 전환', tone: 'rose' },
		],
		visualCaption: '현재 작업 표면',
		visualLayers: [
			'Backend systems',
			'AWS / Terraform',
			'Airflow ETL',
			'Agent workflows',
			'3B knowledge layer',
		],
		sections: {
			arc: '커리어 흐름',
			now: '지금 만드는 것',
			systems: '개인 시스템',
			principles: '작업 원칙',
			learning: '다음 학습 지점',
		},
		timeline: [
			{
				year: '2004-2012',
				title: '한양대학교 영화와 연극',
				body: '촬영, 연출, 사운드, 편집을 공부했습니다. 소프트웨어 이전의 첫 번째 제작 언어였습니다.',
			},
			{
				year: '2019-2021',
				title: '독학으로 엔지니어링 진입',
				body: 'JavaScript, Java, C, Nand2Tetris, 알고리즘, 실무형 웹 개발로 기반을 만들었습니다.',
			},
			{
				year: '2021-2025',
				title: '프론트엔드에서 백엔드 오너십으로',
				body: 'MODULABS, Moviation, Playtag를 거치며 UI, 풀스택 구현, 서비스 마이그레이션, 프로덕션 운영까지 확장했습니다.',
			},
			{
				year: '2025-now',
				title: 'Moba 백엔드, DevOps, AI 데이터 시스템',
				body: '캘린더 동기화 시스템을 단독으로 유지보수하면서 결제, 실시간 업데이트, AWS/Terraform 인프라, Airflow 데이터 파이프라인까지 다룹니다.',
			},
		],
		now: [
			{
				title: '제품 규모의 캘린더 동기화',
				body: '문제가 많던 단일 캘린더, 1년 범위 동기화 경로를 700만 이벤트 규모의 Google/Apple 멀티 계정, 멀티 캘린더 전체 동기화로 확장했습니다.',
			},
			{
				title: '팀이 운영할 수 있는 인프라',
				body: 'Terraform, GitHub Actions, ECS, RDS, S3, DynamoDB state, WAF, 명확하게 실패하는 배포 경로를 선호합니다.',
			},
			{
				title: 'AI로 이어지는 데이터 시스템',
				body: 'Airflow ingestion, Amplitude ETL completeness, 제품 분석, 로컬 프로토타입을 프로덕션 파이프라인으로 옮기는 일을 합니다.',
			},
		],
		systems: [
			{
				title: '3B',
				kicker: "Brandon's Binary Brain",
				body: '노트, 에이전트 규칙, 스킬, 리뷰 루프, 결정 기억을 버전 관리하는 개인 운영체제입니다.',
				href: '/ko/system/3b',
				image: '/og/claude-code-agent-teams.png',
				alt: 'Claude Code 에이전트 팀 워크플로를 표현한 생성 이미지',
			},
			{
				title: 'Crucio',
				kicker: 'AI knowledge platform',
				body: '모델 실험, 지식 워크플로, 파이프라인 점검을 위한 개인 AI 시스템입니다.',
				href: 'https://crucio.brandonwie.dev',
				image: '/og/ai-code-review-patterns.png',
				alt: 'AI 코드 리뷰 패턴을 표현한 생성 이미지',
			},
			{
				title: 'brandonwie.dev',
				kicker: 'public learning surface',
				body: '프로덕션 노트가 충분한 근거를 갖춘 뒤 공개 글이 되는 장소입니다.',
				href: '/ko',
				image: '/og/paraglide-i18n.png',
				alt: '이 사이트의 Paraglide i18n 시스템을 표현한 생성 이미지',
			},
		],
		principles: [
			{
				title: '영리함보다 정확성',
				body: '타임존, 반복 일정, soft delete, orphan row, race condition은 지루할 정도로 정확해야 합니다.',
			},
			{
				title: '자신감보다 증거',
				body: 'AI를 많이 쓰지만 결정은 테스트, 로그, diff, 프로덕션 데이터, 명시적인 책임으로 확인합니다.',
			},
			{
				title: '트레이드오프를 기록하기',
				body: '좋은 시스템 작업은 시간이 지나도 왜 그 결정이 합리적이었는지 기억하게 만드는 일입니다.',
			},
		],
		learning: {
			kicker: 'Building toward',
			title: 'MLOps와 AI Engineering. 이미 끝낸 일처럼 말하지 않고, 지금 쌓는 방향으로 말합니다.',
			body: '다음 경계는 더 깊은 CS와 AI 시스템입니다. 대학원 수준의 기초, 프로덕션 ML 인프라, 검증 가능한 에이전트 도구를 공부하고 있습니다.',
			items: [
				'Georgia Tech OMSCS 목표: Spring 2027',
				'GTx 수학과 알고리즘 certificate',
				'AWS Developer / Solutions Architect 트랙',
				'운영체제, 동시성, 더 낮은 레벨의 시스템 이해',
			],
		},
		links: [
			{ label: '3B 시스템 보기', href: '/ko/system/3b' },
			{ label: 'LinkedIn', href: 'https://linkedin.com/in/brandonwie', external: true },
			{ label: 'GitHub', href: 'https://github.com/brandonwie', external: true },
			{ label: 'Email', href: 'mailto:brandon@brandonwie.dev' },
		],
	},
};

export function getAboutContent(locale: AboutLocale): AboutContent {
	return content[locale];
}
