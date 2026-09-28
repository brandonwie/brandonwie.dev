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
			'About Brandon Wie: Seoul-based full-stack AI engineer at Playtag, building on a backend and DevOps foundation.',
		eyebrow: 'About Brandon',
		title: 'I came from film, stayed for systems, and now build toward AI infrastructure.',
		subtitle:
			'Full-stack AI engineer at Playtag in Seoul, working on mono_xyz, AI video analytics for human behavior, across product, backend, and infrastructure.',
		intro: [
			'I started in film and theatre, moved into software in 2019, and grew through frontend, full-stack, backend, DevOps, and AI-native engineering work.',
			'The through-line is not a title. It is the way I work: trace the system, name the tradeoffs, verify with tests and logs, then write down what changed my mind.',
		],
		metrics: [
			{ value: 'Seoul', label: 'Korean / English', tone: 'accent' },
			{ value: '7M', label: 'calendar events synced at MOBA', tone: 'foam' },
			{ value: '5-20x', label: 'MOBA sync throughput gains', tone: 'gold' },
			{ value: '2019', label: 'software switch from film', tone: 'rose' },
		],
		visualCaption: 'Current operating surface',
		visualLayers: [
			'Backend systems',
			'AWS / Terraform',
			'AI video analytics',
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
				year: '2025-2026',
				title: 'MOBA backend, DevOps, and AI data systems',
				body: 'Sole-maintained calendar sync while owning billing surfaces, real-time updates, AWS/Terraform infrastructure, and Airflow-based data pipelines.',
			},
			{
				year: '2026-now',
				title: 'Back at Playtag as a full-stack AI engineer',
				body: 'Returned to Playtag in August 2026 to work on mono_xyz, AI video analytics for human behavior, across product, backend, and infrastructure.',
			},
		],
		now: [
			{
				title: 'AI video analytics at Playtag',
				body: 'mono_xyz turns everyday footage into person-level behavioral insight; I work on it full-stack, across product, backend, and infrastructure.',
			},
			{
				title: 'Infrastructure that the team can operate',
				body: 'Terraform, CI/CD, and AWS deployment paths that are reviewable, repeatable, and fail visibly instead of silently.',
			},
			{
				title: 'Agent-native engineering',
				body: '3B, reviewer loops, and verification tooling that keep AI-assisted work auditable, from the first prompt to the merged diff.',
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
			'서울의 Playtag에서 풀스택 AI 엔지니어로 일하는 Brandon Wie 소개. 백엔드와 DevOps 경험을 바탕으로 AI 제품을 만듭니다.',
		eyebrow: 'Brandon 소개',
		title: '영화에서 시작했고, 시스템에 남았고, 지금은 AI 인프라 쪽으로 만들고 있습니다.',
		subtitle:
			'서울 Playtag의 풀스택 AI 엔지니어입니다. 사람의 행동을 분석하는 AI 영상 분석 서비스 mono_xyz를 제품, 백엔드, 인프라 전반에서 만들고 있습니다.',
		intro: [
			'영화와 연극을 전공한 뒤 2019년에 소프트웨어로 방향을 바꿨습니다. 프론트엔드, 풀스택, 백엔드, DevOps, AI-native 워크플로를 지나 지금의 작업 방식이 만들어졌습니다.',
			'저를 설명하는 중심은 직함보다 일하는 방식에 가깝습니다. 시스템을 추적하고, 트레이드오프를 이름 붙이고, 테스트와 로그로 확인한 뒤, 생각이 바뀐 지점을 기록합니다.',
		],
		metrics: [
			{ value: 'Seoul', label: 'Korean / English', tone: 'accent' },
			{ value: '700만', label: 'MOBA에서 동기화한 캘린더 이벤트', tone: 'foam' },
			{ value: '5-20x', label: 'MOBA 동기화 처리량 개선', tone: 'gold' },
			{ value: '2019', label: '영화에서 소프트웨어로 전환', tone: 'rose' },
		],
		visualCaption: '현재 작업 표면',
		visualLayers: [
			'Backend systems',
			'AWS / Terraform',
			'AI video analytics',
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
				year: '2025-2026',
				title: 'MOBA 백엔드, DevOps, AI 데이터 시스템',
				body: '캘린더 동기화 시스템을 단독으로 유지보수하면서 결제, 실시간 업데이트, AWS/Terraform 인프라, Airflow 데이터 파이프라인까지 맡았습니다.',
			},
			{
				year: '2026-now',
				title: '풀스택 AI 엔지니어로 Playtag에 복귀',
				body: '2026년 8월 Playtag로 돌아와, 사람의 행동을 분석하는 AI 영상 분석 서비스 mono_xyz를 제품, 백엔드, 인프라 전반에서 만들고 있습니다.',
			},
		],
		now: [
			{
				title: 'Playtag의 AI 영상 분석',
				body: 'mono_xyz는 일상의 영상을 사람 단위의 행동 인사이트로 바꿉니다. 저는 제품, 백엔드, 인프라를 오가며 풀스택으로 만들고 있습니다.',
			},
			{
				title: '팀이 운영할 수 있는 인프라',
				body: 'Terraform, CI/CD, AWS 배포 경로를 리뷰 가능하고 반복 가능하게, 조용히 망가지지 않고 명확하게 실패하도록 만듭니다.',
			},
			{
				title: 'Agent-native 엔지니어링',
				body: '3B, 리뷰 루프, 검증 도구로 AI와 함께 한 작업을 첫 프롬프트부터 머지된 diff까지 추적 가능하게 유지합니다.',
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
