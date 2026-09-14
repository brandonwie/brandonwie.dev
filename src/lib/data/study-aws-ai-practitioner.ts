/**
 * Public copy for the AWS Certified AI Practitioner study page.
 *
 * Plain TypeScript with no framework import, like `study.ts`, so the Next.js
 * candidate can import it as-is. Distilled from the private EN/KO cram sheets
 * registered in `study-sources.ts`; the score panel, miss counts, and
 * practice-bank alerts in those sheets are intentionally not published.
 */

import type { StudyLocale } from './study';

export type AwsTone = 'warn' | 'violet' | 'teal';

export interface AwsTerm {
	term: string;
	detail?: string;
	signal?: string;
	example?: string;
	tone?: AwsTone;
}

export interface AwsService {
	name: string;
	role: string;
	trigger: string;
	example: string;
}

export type AwsBlock =
	| { kind: 'hierarchy'; layers: AwsTerm[] }
	| { kind: 'compare'; columns: 2 | 3 | 4; items: AwsTerm[] }
	| { kind: 'services'; columns: 2 | 4; items: AwsService[] }
	| { kind: 'flow'; steps: AwsTerm[]; joins: string[] }
	| { kind: 'tags'; tags: { text: string; tone?: AwsTone }[] }
	| { kind: 'note'; text: string };

export interface AwsCard {
	title: string;
	subtitle?: string;
	definition?: string;
	span: 4 | 5 | 6 | 7 | 8 | 12;
	tone?: AwsTone;
	blocks: AwsBlock[];
}

export interface AwsSection {
	id: string;
	kicker: string;
	title: string;
	note: string;
}

export interface AwsMapSection extends AwsSection {
	cards: AwsCard[];
}

export interface AwsTrapSection extends AwsSection {
	items: { signal: string; pick: string }[];
}

export interface AwsAiPractitionerContent {
	metaTitle: string;
	metaDescription: string;
	eyebrow: string;
	title: string;
	subtitle: string;
	passNote: string;
	labels: { inside: string; print: string; sources: string };
	sourceNote: string;
	sections: AwsMapSection[];
	traps: AwsTrapSection;
}

const content: Record<StudyLocale, AwsAiPractitionerContent> = {
	en: {
		metaTitle: 'AWS Certified AI Practitioner',
		metaDescription:
			'A visual AWS Certified AI Practitioner (AIF-C01) cram sheet: AWS service families, GenAI decisions, ML core concepts, responsible AI, and keyword-to-answer exam traps.',
		eyebrow: 'AWS Certified AI Practitioner · AIF-C01',
		title: 'Visual cram sheet',
		subtitle:
			'The comparisons I leaned on most while preparing for the exam. Each block reads definition → example → exam signal.',
		passNote: 'Passed · 2026-07-24',
		labels: {
			inside: 'on this page',
			print: 'Print',
			sources: 'about this page',
		},
		sourceNote:
			'Distilled from my notes on the AWS course slides (v19). Practice-test questions, answers, and scores are left out. AWS services change quickly, so check current AWS documentation before relying on a detail.',
		sections: [
			{
				id: 'mental-map',
				kicker: '01 · Mental map',
				title: 'Big → small',
				note: 'Containment ≠ synonym',
				cards: [
					{
						span: 6,
						title: 'AI hierarchy',
						definition: 'Each inner layer adds one requirement',
						blocks: [
							{
								kind: 'hierarchy',
								layers: [
									{
										term: 'AI',
										detail: 'acts intelligent · rule-based chess',
									},
									{
										term: 'ML',
										detail: 'learns from data · spam classifier',
									},
									{
										term: 'DL',
										detail: 'deep neural nets · image recognition',
									},
									{
										term: 'GenAI',
										detail: 'creates content · draft an email',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Foundation model vs LLM',
						definition: 'FM = reusable base model · LLM = language FM',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Foundation model',
										detail: 'Broad base · text/image/audio',
										signal: 'Parent concept',
										example: 'Stable Diffusion · image FM',
									},
									{
										term: 'LLM',
										detail: 'Language-focused FM',
										signal: 'FM subset',
										example: 'Claude / GPT · text + code',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'note',
								text: 'All LLMs are FMs. Not all FMs are LLMs.',
							},
						],
					},
					{
						span: 12,
						title: 'Model families · one verb each',
						definition: 'Architecture/process names can overlap in one product',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Transformer',
										detail: 'attends',
									},
									{
										term: 'Diffusion',
										detail: 'denoises',
										tone: 'warn',
									},
									{
										term: 'GAN',
										detail: 'competes',
										tone: 'violet',
									},
									{
										term: 'VAE',
										detail: 'compresses + rebuilds',
									},
									{
										term: 'Autoregressive',
										detail: 'next item',
										tone: 'warn',
									},
									{
										term: 'CNN',
										detail: 'local image patterns',
										tone: 'violet',
									},
									{
										term: 'RNN/LSTM',
										detail: 'sequence state',
									},
									{
										term: 'ChatGPT',
										detail: 'Transformer + autoregressive',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'tags',
								tags: [
									{
										text: 'Stable Diffusion → diffusion',
										tone: 'warn',
									},
									{
										text: 'DALL·E 3 → diffusion-based',
										tone: 'warn',
									},
									{
										text: 'Firefly → exam: diffusion',
										tone: 'warn',
									},
									{
										text: 'BERT → bidirectional transformer',
										tone: 'violet',
									},
									{
										text: 'ResNet → image CNN',
										tone: 'violet',
									},
									{
										text: 'DeepAR → time-series RNN',
										tone: 'violet',
									},
									{
										text: 'SVM → separating boundary',
										tone: 'teal',
									},
									{
										text: 'XGBoost → boosted trees',
										tone: 'teal',
									},
									{
										text: 'WaveNet → audio waveform',
										tone: 'teal',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Fast glossary',
						blocks: [
							{
								kind: 'tags',
								tags: [
									{
										text: 'FM · foundation model',
									},
									{
										text: 'LLM · large language model',
									},
									{
										text: 'RAG · retrieval-augmented generation',
									},
									{
										text: 'RLHF · human-feedback reinforcement',
									},
									{
										text: 'PII · personal data',
									},
									{
										text: 'CVE · known vulnerability',
									},
									{
										text: 'SHAP · feature attribution',
									},
									{
										text: 'A2I · Augmented AI',
									},
									{
										text: 'Context window · token capacity',
									},
									{
										text: 'Distillation · teacher → smaller student',
									},
									{
										text: 'Nova / Titan · AWS foundation models',
									},
								],
							},
						],
					},
				],
			},
			{
				id: 'aws-services',
				kicker: '02 · AWS service families',
				title: 'Parent → sub-service → trigger',
				note: 'Pick by job, not name',
				cards: [
					{
						span: 6,
						title: 'Amazon Bedrock',
						subtitle: 'managed FM platform',
						blocks: [
							{
								kind: 'services',
								columns: 2,
								items: [
									{
										name: 'Knowledge Bases',
										role: 'managed RAG',
										trigger: 'private/current facts',
										example: 'answer from company policy PDFs',
									},
									{
										name: 'Guardrails',
										role: 'safety + PII + topics',
										trigger: 'harmful content',
										example: 'block violence + mask card numbers',
									},
									{
										name: 'Model Evaluation',
										role: 'compare FMs before production',
										trigger: 'auto = metrics • human = judgment',
										example:
											'auto: built-in/custom + BERTScore/F1 • human: own dataset + coherence/relevance',
									},
									{
										name: 'Agents',
										role: 'tools + multistep actions',
										trigger: 'execute task',
										example: 'check stock → place order',
									},
									{
										name: 'Embeddings',
										role: 'vectors for retrieval',
										trigger: 'similarity/search',
										example: 'find shoes from photo + text',
									},
									{
										name: 'Customization',
										role: 'fine-tune / continued pre-train / distill',
										trigger: 'stable behavior',
										example: 'always write legal-report format',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Amazon SageMaker AI',
						subtitle: 'build/train/deploy your model',
						tone: 'teal',
						blocks: [
							{
								kind: 'services',
								columns: 2,
								items: [
									{
										name: 'Data Wrangler',
										role: 'clean + transform',
										trigger: 'prepare raw data',
										example: 'fill missing ages · encode country',
									},
									{
										name: 'Feature Store',
										role: 'store/share features',
										trigger: 'training + inference inputs',
										example: 'reuse customer_risk_score live',
									},
									{
										name: 'Ground Truth',
										role: 'label examples',
										trigger: 'training dataset',
										example: 'mark images cat / dog',
									},
									{
										name: 'Canvas',
										role: 'no-code end-to-end ML',
										trigger: 'business analyst',
										example: 'predict churn without code',
									},
									{
										name: 'JumpStart',
										role: 'pretrained model hub',
										trigger: 'deploy quickly',
										example: 'deploy a pretrained Llama model',
									},
									{
										name: 'Autopilot',
										role: 'AutoML candidates',
										trigger: 'automate build + tune',
										example: 'compare churn models automatically',
									},
									{
										name: 'Studio',
										role: 'ML development IDE',
										trigger: 'data scientist workspace',
										example: 'notebooks + training jobs',
									},
									{
										name: 'Clarify',
										role: 'bias + explainability',
										trigger: 'fairness / SHAP',
										example: 'loan approvals differ by group?',
									},
									{
										name: 'Model Monitor',
										role: 'production drift',
										trigger: 'quality after deploy',
										example: 'live income data shifts',
									},
									{
										name: 'A2I',
										role: 'human reviews predictions',
										trigger: 'inference review',
										example: 'review low-confidence insurance claim',
									},
									{
										name: 'Model Cards',
										role: 'document your model',
										trigger: 'risk + intended use',
										example: 'limits of a credit-risk model',
									},
									{
										name: 'Model Registry',
										role: 'version + approve',
										trigger: 'promotion lifecycle',
										example: 'approve model v4 for production',
									},
									{
										name: 'Model Dashboard',
										role: 'view model status',
										trigger: 'models/endpoints',
										example: 'which endpoint is deployed?',
									},
									{
										name: 'Pipelines',
										role: 'ML workflow automation',
										trigger: 'MLOps / CI/CD',
										example: 'prepare → train → deploy',
									},
									{
										name: 'MLflow',
										role: 'track experiments',
										trigger: 'runs + metrics',
										example: 'compare learning rates',
									},
								],
							},
							{
								kind: 'note',
								text: 'Inference: real-time = steady · serverless = sporadic · async = long/large · batch = offline dataset.',
							},
						],
					},
					{
						span: 12,
						title: 'Amazon Q',
						subtitle: 'choose user first',
						tone: 'violet',
						blocks: [
							{
								kind: 'services',
								columns: 4,
								items: [
									{
										name: 'Q Developer',
										role: 'code + AWS operations',
										trigger: 'developer / cloud',
										example: 'fix Lambda error · list functions',
									},
									{
										name: 'Q Business',
										role: 'enterprise knowledge',
										trigger: 'employee / HR / IT',
										example: '“What is our leave policy?”',
									},
									{
										name: 'Connect AI agents (was Q in Connect)',
										role: 'live agent guidance',
										trigger: 'contact center',
										example: 'suggest reply during customer call',
									},
									{
										name: 'Quick Sight (was Q in QuickSight)',
										role: 'BI + visuals',
										trigger: 'analyst / dashboard',
										example: '“Chart sales by region”',
									},
								],
							},
							{
								kind: 'tags',
								tags: [
									{
										text: 'Q for EC2 · instance guidance',
										tone: 'violet',
									},
									{
										text: 'Q Developer in chat apps (was AWS Chatbot) · Slack/Teams ops',
										tone: 'violet',
									},
									{
										text: 'Q for Glue · ETL help',
										tone: 'violet',
									},
									{
										text: 'Q Apps · no-code enterprise app',
										tone: 'violet',
									},
									{
										text: 'PartyRock · no-code FM playground',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 7,
						title: 'Ready-made AI APIs',
						definition: 'Call an API · no custom model training',
						blocks: [
							{
								kind: 'tags',
								tags: [
									{
										text: 'Comprehend · review sentiment',
										tone: 'teal',
									},
									{
										text: 'Rekognition · faces in video',
										tone: 'teal',
									},
									{
										text: 'Transcribe · call audio → text',
										tone: 'teal',
									},
									{
										text: 'Polly · article → voice',
										tone: 'teal',
									},
									{
										text: 'Translate · English → Korean',
										tone: 'teal',
									},
									{
										text: 'Textract · invoice fields',
										tone: 'teal',
									},
									{
										text: 'Lex · support chatbot',
										tone: 'teal',
									},
									{
										text: 'Personalize · product suggestions',
										tone: 'teal',
									},
									{
										text: 'Kendra · search company docs',
										tone: 'teal',
									},
									{
										text: 'Mechanical Turk · crowd microtasks',
										tone: 'teal',
									},
									{
										text: 'HealthScribe · clinical notes',
										tone: 'teal',
									},
									{
										text: 'Transcribe Medical · medical speech',
										tone: 'teal',
									},
									{
										text: 'Comprehend Medical · clinical NLP',
										tone: 'teal',
									},
									{
										text: 'Forecast · predict demand',
										tone: 'teal',
									},
								],
							},
							{
								kind: 'note',
								text: 'Pretrained API ≠ SageMaker custom model.',
							},
						],
					},
					{
						span: 5,
						title: 'Security/service confusion',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Inspector',
										detail: 'CVEs / vulnerabilities',
										example: 'unpatched EC2 package',
										tone: 'warn',
									},
									{
										term: 'GuardDuty',
										detail: 'active threats',
										example: 'unusual crypto-mining traffic',
									},
									{
										term: 'Macie',
										detail: 'PII in S3',
										example: 'bucket contains passport numbers',
										tone: 'violet',
									},
									{
										term: 'AWS Config',
										detail: 'resource configuration',
										example: 'public S3 rule violation',
									},
									{
										term: 'CloudTrail',
										detail: 'API activity history',
										example: 'who deleted this model?',
									},
									{
										term: 'Artifact',
										detail: 'AWS compliance docs',
										example: 'download SOC report',
										tone: 'warn',
									},
									{
										term: 'Audit Manager',
										detail: 'audit evidence',
										example: 'collect PCI control evidence',
										tone: 'violet',
									},
									{
										term: 'Trusted Advisor',
										detail: 'account advice',
										example: 'cost + security recommendations',
									},
									{
										term: 'PrivateLink',
										detail: 'private service access',
										example: 'VPC → Bedrock without public internet',
										tone: 'violet',
									},
								],
							},
						],
					},
				],
			},
			{
				id: 'genai-decisions',
				kicker: '03 · GenAI decisions',
				title: 'What must change?',
				note: 'Knowledge · behavior · output',
				cards: [
					{
						span: 8,
						title: 'Prompt vs RAG vs fine-tuning vs RLHF',
						definition: 'Same FM · different improvement method',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Prompt',
										detail: 'ask better · no weights',
										signal: 'instructions/examples',
										example: '“Answer in 3 bullet points”',
									},
									{
										term: 'RAG',
										detail: 'look it up · no weights',
										signal: 'fresh/private facts',
										example: 'retrieve today’s inventory',
									},
									{
										term: 'Fine-tune',
										detail: 'learn behavior · weights change',
										signal: 'tone/format/task',
										example: 'learn company support tone',
										tone: 'warn',
									},
									{
										term: 'RLHF / RFT',
										detail: 'optimize via reward',
										signal: 'human rankings · reward functions',
										example: 'humans rank answer A over B',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 4,
						title: 'Bedrock inference modes',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'On-Demand',
										detail: 'pay per use · no term',
										example: 'new chatbot · uneven traffic',
									},
									{
										term: 'Provisioned',
										detail: 'reserved throughput · no-commit or term',
										example: 'steady high-volume support',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'note',
								text: 'Smaller model → usually cheaper + faster.',
							},
							{
								kind: 'note',
								text: 'Distillation: large teacher → smaller student · lower cost/latency.',
							},
						],
					},
					{
						span: 7,
						title: 'Inference parameters',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Temperature',
										detail: 'randomness',
										example: 'low · financial report',
									},
									{
										term: 'Top K',
										detail: 'fixed count',
										example: 'K=10 · exactly 10 candidates',
										tone: 'warn',
									},
									{
										term: 'Top P',
										detail: 'probability mass',
										example: 'P=.9 · enough tokens to reach 90%',
										tone: 'warn',
									},
									{
										term: 'Stop sequence',
										detail: 'halt pattern',
										example: 'stop at </answer>',
										tone: 'violet',
									},
									{
										term: 'Response length',
										detail: 'min/max output tokens',
										example: 'max 100 tokens · not candidate count',
									},
								],
							},
							{
								kind: 'note',
								text: 'K = quantity. P = probability pool. Length = output size. Low temperature = consistent.',
							},
						],
					},
					{
						span: 5,
						title: 'Prompting',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Zero-shot',
										detail: '“Classify this review”',
									},
									{
										term: 'Few-shot',
										detail: 'show 3 labeled reviews first',
									},
									{
										term: 'Chain-of-thought',
										detail: 'break tax problem into steps',
										tone: 'warn',
									},
									{
										term: 'Negative',
										detail: '“Do not mention competitors”',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Multimodal choice · choose output',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Search / match / recommend',
										detail: '“find shoes like this photo”',
									},
									{
										term: 'Multimodal embedding',
										detail: 'retrieves existing items',
									},
									{
										term: 'Create / describe / answer',
										detail: '“describe damage in this photo”',
									},
									{
										term: 'Multimodal generative',
										detail: 'creates a response',
									},
								],
								joins: ['→', '·', '→'],
							},
						],
					},
					{
						span: 12,
						title: 'FM lifecycle',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Pre-train',
										detail: 'unlabeled general data · build FM',
									},
									{
										term: 'Continued pre-train',
										detail: 'unlabeled medical text · add domain',
									},
									{
										term: 'Fine-tune',
										detail: 'labeled Q&A · specialize task',
									},
									{
										term: 'Inference',
										detail: 'new prompt · generate answer',
									},
								],
								joins: ['→', '→', '→'],
							},
						],
					},
				],
			},
			{
				id: 'ml-core',
				kicker: '04 · ML core',
				title: 'Signal → training → evaluation',
				note: 'Training signal decides',
				cards: [
					{
						span: 12,
						title: 'Learning type · identify the signal',
						definition: 'Task name can vary · training signal decides',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Supervised',
										detail: 'labels → predict',
										example: 'emails labeled spam / safe',
									},
									{
										term: 'Unsupervised',
										detail: 'no labels → groups',
										example: 'cluster customers by behavior',
										tone: 'violet',
									},
									{
										term: 'Semi-supervised',
										detail: 'few labels + much unlabeled',
										example: '100 labeled + 10k unlabeled reviews',
									},
									{
										term: 'Self-supervised',
										detail: 'data makes targets · FMs',
										example: 'predict masked / next token',
										tone: 'warn',
									},
									{
										term: 'Reinforcement',
										detail: 'actions + rewards',
										example: 'robot rewarded for avoiding collision',
										tone: 'violet',
									},
									{
										term: 'Clustering',
										detail: 'unsupervised',
										example: 'discover 4 traffic patterns',
									},
									{
										term: 'Fraud / sentiment',
										detail: 'can be semi-supervised',
										example: 'experts label only a small sample',
										tone: 'warn',
									},
									{
										term: 'Neural network',
										detail: 'architecture, not paradigm',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 7,
						title: 'Data split',
						definition: 'Study → mock exam → untouched final exam',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Train',
										detail: 'learn weights',
									},
									{
										term: 'Validation',
										detail: 'tune + choose',
									},
									{
										term: 'Test',
										detail: 'final generalization',
									},
								],
								joins: ['→', '→'],
							},
							{
								kind: 'note',
								text: 'Validation tunes + selects. Test stays untouched.',
							},
						],
					},
					{
						span: 5,
						title: 'Three parameter layers',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Parameters',
										detail: 'learned · weights/biases',
										example: 'internal feature weights',
									},
									{
										term: 'Hyperparameters',
										detail: 'chosen · LR/epochs',
										example: 'learning rate = .001',
										tone: 'warn',
									},
									{
										term: 'Inference params',
										detail: 'request-time controls',
										example: 'temperature = .2',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Feature engineering',
						definition: 'Raw data → useful model inputs',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Structured',
										detail: 'normalize · impute · encode',
										example: 'country “KR” → category vector',
									},
									{
										term: 'Unstructured',
										detail: 'tokenize · vectorize · extract',
										example: 'review text → embedding',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'note',
								text: 'Organized ≠ model-ready.',
							},
						],
					},
					{
						span: 6,
						title: 'Deep-learning loop',
						definition: 'Repeat until prediction error falls',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Forward',
										detail: 'predict',
									},
									{
										term: 'Loss',
										detail: 'error',
									},
									{
										term: 'Backprop',
										detail: 'gradients',
									},
									{
										term: 'Update',
										detail: 'weights',
									},
								],
								joins: ['→', '→', '→'],
							},
						],
					},
					{
						span: 7,
						title: 'Fit diagnosis',
						blocks: [
							{
								kind: 'compare',
								columns: 3,
								items: [
									{
										term: 'Underfitting',
										detail: 'train bad · test bad · high bias',
										example: 'straight line for curved pattern',
										tone: 'warn',
									},
									{
										term: 'Good fit',
										detail: 'train good · test good',
										example: 'works on old + new customers',
									},
									{
										term: 'Overfitting',
										detail: 'train good · test bad · high variance',
										example: 'memorizes training customers',
										tone: 'violet',
									},
								],
							},
							{
								kind: 'note',
								text: 'Overfitting fixes: more/diverse data · regularization · early stopping · simpler model.',
							},
						],
					},
					{
						span: 5,
						title: 'Token → embedding',
						definition: 'Readable unit → numerical meaning',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Text',
										detail: 'input',
									},
									{
										term: 'Token',
										detail: 'unit',
									},
									{
										term: 'Embedding',
										detail: 'meaning vector',
									},
								],
								joins: ['→', '→'],
							},
						],
					},
					{
						span: 6,
						title: 'Generative vs discriminative',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Generative',
										detail: 'learn pattern → create new',
										example: 'generate a new animal image',
										tone: 'warn',
									},
									{
										term: 'Discriminative',
										detail: 'learn boundary → classify',
										example: 'label this image cat / dog',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Image processing vs computer vision',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Image processing',
										detail: 'change pixels',
										example: 'crop · sharpen · remove noise',
									},
									{
										term: 'Computer vision',
										detail: 'understand content',
										example: 'detect + count shelf products',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Metric routing',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'BLEU',
										detail: 'translation · precision-ish',
									},
									{
										term: 'ROUGE',
										detail: 'summarization · recall-ish',
									},
									{
										term: 'BERTScore',
										detail: 'semantic similarity',
									},
									{
										term: 'Perplexity',
										detail: 'LLM uncertainty · lower is better',
										tone: 'warn',
									},
									{
										term: 'Accuracy',
										detail: '% correct · beware imbalance',
										tone: 'violet',
									},
									{
										term: 'Precision',
										detail: 'avoid false positives',
									},
									{
										term: 'Recall',
										detail: 'avoid false negatives',
									},
									{
										term: 'F1',
										detail: 'balance precision + recall',
										tone: 'warn',
									},
									{
										term: 'AUC-ROC',
										detail: 'ranking across thresholds',
										tone: 'violet',
									},
									{
										term: 'Confusion matrix',
										detail: 'classification counts',
										tone: 'warn',
									},
									{
										term: 'RMSE',
										detail: 'regression · punishes large error',
									},
									{
										term: 'MAE',
										detail: 'regression · equal error weight',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Implementation risks',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Data quality',
										detail: 'main practical challenge',
										example: 'missing values · wrong labels',
										tone: 'warn',
									},
									{
										term: 'Bias',
										detail: 'unfair groups/classes',
										example: 'training data excludes a region',
									},
									{
										term: 'Explainability',
										detail: 'why this output?',
										example: 'regulator asks why loan denied',
										tone: 'violet',
									},
									{
										term: 'Scalability',
										detail: 'cost + latency + throughput',
										example: '10 users → 1M requests',
									},
									{
										term: 'Hallucination',
										detail: 'plausible + unsupported',
										example: 'invented policy citation',
										tone: 'warn',
									},
									{
										term: 'Data leakage',
										detail: 'future/test data leaks in',
										example: 'train with tomorrow’s answer',
										tone: 'violet',
									},
								],
							},
						],
					},
				],
			},
			{
				id: 'responsible-ai',
				kicker: '05 · Responsible AI + governance',
				title: 'Who controls what?',
				note: 'Dimension → service',
				cards: [
					{
						span: 12,
						title: 'Responsible AI compass',
						definition: 'Ask which dimension the scenario violates',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Fairness',
										detail: 'comparable treatment',
									},
									{
										term: 'Explainability',
										detail: 'understand reasons',
									},
									{
										term: 'Privacy + security',
										detail: 'protect data',
										tone: 'violet',
									},
									{
										term: 'Transparency',
										detail: 'disclose use + limits',
									},
									{
										term: 'Veracity + robustness',
										detail: 'accurate under change/attack',
										tone: 'warn',
									},
									{
										term: 'Governance',
										detail: 'owner + policy + review',
									},
									{
										term: 'Safety',
										detail: 'prevent harm',
										tone: 'warn',
									},
									{
										term: 'Controllability',
										detail: 'guide · override · stop',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 7,
						title: 'Responsible AI routing',
						definition: 'Before deploy · after deploy · generated output',
						blocks: [
							{
								kind: 'compare',
								columns: 3,
								items: [
									{
										term: 'Clarify',
										detail: 'bias + explain',
										example: 'why was this loan denied?',
									},
									{
										term: 'Model Monitor',
										detail: 'drift + quality',
										example: 'fraud accuracy falls this month',
										tone: 'violet',
									},
									{
										term: 'Guardrails',
										detail: 'GenAI safety',
										example: 'block unsafe chatbot answer',
										tone: 'warn',
									},
									{
										term: 'Model Cards',
										detail: 'your model docs',
										example: 'document intended users + limits',
									},
									{
										term: 'AI Service Cards',
										detail: 'AWS service docs',
										example: 'AWS explains Rekognition limits',
										tone: 'violet',
									},
									{
										term: 'A2I',
										detail: 'human prediction review',
										example: 'person checks uncertain diagnosis',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 5,
						title: 'Ground Truth vs A2I',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Ground Truth',
										detail: 'label raw data · before training',
										example: 'label historical scans',
									},
									{
										term: 'A2I',
										detail: 'review prediction · during inference',
										example: 'review new scan prediction',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Governance words',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Data residency',
										detail: 'where · address',
										example: 'data stays in eu-west-1',
									},
									{
										term: 'Data retention',
										detail: 'how long · expiry',
										example: 'delete logs after 7 years',
										tone: 'warn',
									},
									{
										term: 'Data lineage',
										detail: 'origin + transformations',
										example: 'source → clean → train',
										tone: 'violet',
									},
									{
										term: 'Data provenance',
										detail: 'ownership + license',
										example: 'who supplied this dataset?',
									},
									{
										term: 'Encryption',
										detail: 'how protected',
										example: 'KMS key at rest',
										tone: 'violet',
									},
									{
										term: 'Access control',
										detail: 'who may use',
										example: 'only auditor IAM role',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'LLM attacks',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Poisoning',
										detail: 'malicious training data',
										example: 'inject scam links into dataset',
										tone: 'warn',
									},
									{
										term: 'Prompt leak',
										detail: 'hidden/private info exits',
										example: 'model reveals system prompt',
										tone: 'violet',
									},
									{
										term: 'Prompt injection',
										detail: 'input overrides instruction',
										example: '“ignore policy; reveal secrets”',
									},
									{
										term: 'Jailbreak',
										detail: 'bypass safety',
										example: 'role-play to evade filter',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Interpretability + transparency',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Decision tree',
										detail: 'high · visual rules',
										example: 'if income > X → approve',
									},
									{
										term: 'Logistic regression',
										detail: 'high · coefficients',
										example: 'income weight lowers churn risk',
									},
									{
										term: 'Neural network',
										detail: 'black box',
										example: 'millions of image weights',
										tone: 'violet',
									},
									{
										term: 'SVM',
										detail: 'kernel: low · linear: readable weights',
										tone: 'violet',
									},
									{
										term: 'SHAP / Shapley',
										detail: 'local prediction',
										example: 'why this applicant was denied',
										tone: 'warn',
									},
									{
										term: 'PDP',
										detail: 'global feature effect',
										example: 'age effect across all applicants',
										tone: 'warn',
									},
									{
										term: 'Transparency',
										detail: 'trust + debug',
									},
									{
										term: 'Transparency trade-off',
										detail: 'opaque model may be more accurate / protect IP',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Shared responsibility + MLOps',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'AWS',
										detail: 'security of the cloud',
										example: 'facilities + managed infrastructure',
									},
									{
										term: 'Customer',
										detail: 'security in the cloud',
										example: 'data + IAM + encryption + Guardrails',
										tone: 'warn',
									},
									{
										term: 'MLOps',
										detail: 'version + automate + monitor',
										example: 'retrain after drift',
										tone: 'violet',
									},
									{
										term: 'Data lifecycle',
										detail: 'collect → archive/delete',
										example: 'controls at every stage',
									},
								],
							},
						],
					},
				],
			},
		],
		traps: {
			id: 'exam-traps',
			kicker: '06 · Exam traps',
			title: 'See X → pick Y',
			note: 'Keyword → answer',
			items: [
				{
					signal: 'percentage / cumulative pool',
					pick: 'Top P · not Top K',
				},
				{
					signal: 'fixed candidate count',
					pick: 'Top K · not Top P',
				},
				{
					signal: 'false positive is costly',
					pick: 'precision',
				},
				{
					signal: 'false negative is costly',
					pick: 'recall',
				},
				{
					signal: 'FM makes labels from raw input',
					pick: 'self-supervised · not unsupervised',
				},
				{
					signal: 'groups / clusters',
					pick: 'unsupervised · not RL',
				},
				{
					signal: 'actions + rewards',
					pick: 'reinforcement learning',
				},
				{
					signal: 'small labeled + large unlabeled',
					pick: 'semi-supervised',
				},
				{
					signal: 'complex problem → smaller steps',
					pick: 'chain-of-thought',
				},
				{
					signal: 'fresh/private company facts',
					pick: 'RAG / Knowledge Bases',
				},
				{
					signal: 'stable style / behavior',
					pick: 'fine-tuning',
				},
				{
					signal: 'smaller model imitates teacher',
					pick: 'distillation',
				},
				{
					signal: 'harmful generated content',
					pick: 'Bedrock Guardrails',
				},
				{
					signal: 'choose best FM',
					pick: 'Bedrock Model Evaluation',
				},
				{
					signal: 'bias / explain prediction',
					pick: 'SageMaker Clarify',
				},
				{
					signal: 'production drift / quality',
					pick: 'Model Monitor',
				},
				{
					signal: 'human reviews model prediction',
					pick: 'A2I · not Ground Truth',
				},
				{
					signal: 'store/share model inputs',
					pick: 'Feature Store',
				},
				{
					signal: 'clean/transform raw data',
					pick: 'Data Wrangler',
				},
				{
					signal: 'no-code build/train/deploy',
					pick: 'Canvas',
				},
				{
					signal: 'contact-center live help',
					pick: 'Connect AI agents (was Q in Connect)',
				},
				{
					signal: 'internal employee knowledge',
					pick: 'Q Business',
				},
				{
					signal: 'BI chart / calculation',
					pick: 'Quick Sight (was Q in QuickSight)',
				},
				{
					signal: 'code / AWS resources / costs',
					pick: 'Q Developer',
				},
				{
					signal: 'ready FM through managed API',
					pick: 'Bedrock',
				},
				{
					signal: 'custom ML lifecycle',
					pick: 'SageMaker AI',
				},
				{
					signal: 'ready task API',
					pick: 'Comprehend / Rekognition / Textract / …',
				},
				{
					signal: 'text + image search',
					pick: 'multimodal embedding',
				},
				{
					signal: 'good train · bad test',
					pick: 'overfit / high variance',
				},
				{
					signal: 'bad train · bad test',
					pick: 'underfit / high bias',
				},
				{
					signal: 'final generalization',
					pick: 'test set · not validation',
				},
				{
					signal: 'automated CVE scan',
					pick: 'Inspector · not Config',
				},
				{
					signal: 'who called / changed / deleted?',
					pick: 'CloudTrail',
				},
				{
					signal: 'resource state / compliance rule',
					pick: 'AWS Config',
				},
				{
					signal: 'security of cloud / in cloud',
					pick: 'AWS / customer',
				},
				{
					signal: 'plausible but false',
					pick: 'hallucination',
				},
			],
		},
	},
	ko: {
		metaTitle: 'AWS Certified AI Practitioner',
		metaDescription:
			'AWS Certified AI Practitioner (AIF-C01) 시각형 암기 요약입니다. AWS service 계열, GenAI 선택, ML 핵심 개념, Responsible AI, 키워드별 exam 함정을 정리했어요.',
		eyebrow: 'AWS Certified AI Practitioner · AIF-C01',
		title: '시각형 암기 요약',
		subtitle:
			'시험을 준비하면서 가장 많이 기댄 비교들이에요. 각 블록은 정의 → 예시 → exam signal 순서로 읽으면 돼요.',
		passNote: '합격 · 2026-07-24',
		labels: {
			inside: '이 페이지',
			print: '인쇄',
			sources: '이 페이지에 대해',
		},
		sourceNote:
			'AWS 강의 슬라이드(v19)를 공부하며 쓴 노트에서 추렸어요. Practice test 문제, 정답, 점수는 넣지 않았어요. AWS service는 빠르게 바뀌니 세부 내용은 최신 AWS 문서로 확인해 주세요.',
		sections: [
			{
				id: 'mental-map',
				kicker: '01 · 전체 구조',
				title: '큰 개념 → 작은 개념',
				note: '포함 관계 ≠ 동의어',
				cards: [
					{
						span: 6,
						title: 'AI 계층',
						definition: '안쪽 계층으로 갈수록 조건이 하나씩 추가',
						blocks: [
							{
								kind: 'hierarchy',
								layers: [
									{
										term: 'AI',
										detail: '지능적으로 행동 · rule-based chess',
									},
									{
										term: 'ML',
										detail: 'data에서 학습 · spam classifier',
									},
									{
										term: 'DL',
										detail: 'deep neural nets · image recognition',
									},
									{
										term: 'GenAI',
										detail: 'content 생성 · email 초안',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Foundation model vs LLM',
						definition: 'FM = 재사용 가능한 base model · LLM = language FM',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Foundation model',
										detail: '범용 base · text/image/audio',
										signal: '상위 개념',
										example: 'Stable Diffusion · image FM',
									},
									{
										term: 'LLM',
										detail: 'language 중심 FM',
										signal: 'FM의 subset',
										example: 'Claude / GPT · text + code',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'note',
								text: '모든 LLM은 FM이지만, 모든 FM이 LLM은 아니에요.',
							},
						],
					},
					{
						span: 12,
						title: 'Model family · 동사 하나로 기억',
						definition: '한 product에 여러 architecture/process가 겹칠 수 있어요.',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Transformer',
										detail: '관련 부분에 집중',
									},
									{
										term: 'Diffusion',
										detail: 'noise 제거',
										tone: 'warn',
									},
									{
										term: 'GAN',
										detail: '서로 경쟁',
										tone: 'violet',
									},
									{
										term: 'VAE',
										detail: '압축 후 복원',
									},
									{
										term: 'Autoregressive',
										detail: '다음 item 예측',
										tone: 'warn',
									},
									{
										term: 'CNN',
										detail: 'image의 local pattern',
										tone: 'violet',
									},
									{
										term: 'RNN/LSTM',
										detail: 'sequence state 유지',
									},
									{
										term: 'ChatGPT',
										detail: 'Transformer + autoregressive',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'tags',
								tags: [
									{
										text: 'Stable Diffusion → diffusion',
										tone: 'warn',
									},
									{
										text: 'DALL·E 3 → diffusion-based',
										tone: 'warn',
									},
									{
										text: 'Firefly → Exam에서는 diffusion',
										tone: 'warn',
									},
									{
										text: 'BERT → bidirectional transformer',
										tone: 'violet',
									},
									{
										text: 'ResNet → image CNN',
										tone: 'violet',
									},
									{
										text: 'DeepAR → time-series RNN',
										tone: 'violet',
									},
									{
										text: 'SVM → 분리 boundary',
										tone: 'teal',
									},
									{
										text: 'XGBoost → boosted trees',
										tone: 'teal',
									},
									{
										text: 'WaveNet → audio waveform',
										tone: 'teal',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: '빠른 용어 정리',
						blocks: [
							{
								kind: 'tags',
								tags: [
									{
										text: 'FM · foundation model',
									},
									{
										text: 'LLM · large language model',
									},
									{
										text: 'RAG · retrieval-augmented generation',
									},
									{
										text: 'RLHF · human-feedback reinforcement',
									},
									{
										text: 'PII · personal data',
									},
									{
										text: 'CVE · 알려진 vulnerability',
									},
									{
										text: 'SHAP · feature attribution',
									},
									{
										text: 'A2I · Augmented AI',
									},
									{
										text: 'Context window · token 수용량',
									},
									{
										text: 'Distillation · teacher → 더 작은 student',
									},
									{
										text: 'Nova / Titan · AWS foundation models',
									},
								],
							},
						],
					},
				],
			},
			{
				id: 'aws-services',
				kicker: '02 · AWS service 계열',
				title: '상위 service → sub-service → trigger',
				note: '이름보다 해야 할 일로 선택',
				cards: [
					{
						span: 6,
						title: 'Amazon Bedrock',
						subtitle: '관리형 FM platform',
						blocks: [
							{
								kind: 'services',
								columns: 2,
								items: [
									{
										name: 'Knowledge Bases',
										role: '관리형 RAG',
										trigger: 'private/current 정보',
										example: '회사 정책 PDF에서 답변',
									},
									{
										name: 'Guardrails',
										role: 'safety + PII + topic 제어',
										trigger: '유해 content',
										example: '폭력 차단 + card number masking',
									},
									{
										name: 'Model Evaluation',
										role: 'production 전 FM 비교',
										trigger: 'automatic = metrics • human = 사람의 판단',
										example:
											'automatic: built-in/custom + BERTScore/F1 • human: 자체 dataset + coherence/relevance',
									},
									{
										name: 'Agents',
										role: 'tool + 여러 단계 action',
										trigger: 'task 실행',
										example: '재고 확인 → 주문 처리',
									},
									{
										name: 'Embeddings',
										role: 'retrieval용 vector',
										trigger: 'similarity/search',
										example: '사진 + text로 비슷한 신발 검색',
									},
									{
										name: 'Customization',
										role: 'fine-tune / continued pre-train / distillation',
										trigger: '일관된 behavior',
										example: '항상 법률 report format으로 작성',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Amazon SageMaker AI',
						subtitle: '직접 model build/train/deploy',
						tone: 'teal',
						blocks: [
							{
								kind: 'services',
								columns: 2,
								items: [
									{
										name: 'Data Wrangler',
										role: '정리 + 변환',
										trigger: 'raw data 준비',
										example: '누락된 나이 채우기 · country encode',
									},
									{
										name: 'Feature Store',
										role: 'feature 저장/공유',
										trigger: 'training + inference input',
										example: 'live에서 customer_risk_score 재사용',
									},
									{
										name: 'Ground Truth',
										role: '예시에 label 부여',
										trigger: 'training dataset',
										example: 'image를 cat / dog로 표시',
									},
									{
										name: 'Canvas',
										role: 'no-code end-to-end ML',
										trigger: 'business analyst',
										example: 'code 없이 churn 예측',
									},
									{
										name: 'JumpStart',
										role: 'pretrained model hub',
										trigger: '빠르게 deploy',
										example: 'pretrained Llama model deploy',
									},
									{
										name: 'Autopilot',
										role: 'AutoML candidate',
										trigger: 'build + tuning 자동화',
										example: 'churn model 자동 비교',
									},
									{
										name: 'Studio',
										role: 'ML 개발 IDE',
										trigger: 'data scientist workspace',
										example: 'notebook + training job',
									},
									{
										name: 'Clarify',
										role: 'bias + explainability',
										trigger: 'fairness / SHAP',
										example: 'group별 loan approval 차이가 있나?',
									},
									{
										name: 'Model Monitor',
										role: 'production drift',
										trigger: 'deploy 후 품질',
										example: 'live income data 변화',
									},
									{
										name: 'A2I',
										role: '사람이 prediction 검토',
										trigger: 'inference review',
										example: 'confidence가 낮은 보험 claim 검토',
									},
									{
										name: 'Model Cards',
										role: 'model 문서화',
										trigger: 'risk + intended use',
										example: 'credit-risk model의 한계',
									},
									{
										name: 'Model Registry',
										role: 'version 관리 + 승인',
										trigger: 'promotion lifecycle',
										example: 'model v4의 production 사용 승인',
									},
									{
										name: 'Model Dashboard',
										role: 'model 상태 확인',
										trigger: 'model/endpoint',
										example: '어떤 endpoint가 deploy됐나?',
									},
									{
										name: 'Pipelines',
										role: 'ML workflow 자동화',
										trigger: 'MLOps / CI/CD',
										example: '준비 → train → deploy',
									},
									{
										name: 'MLflow',
										role: 'experiment 추적',
										trigger: 'run + metrics',
										example: 'learning rate 비교',
									},
								],
							},
							{
								kind: 'note',
								text: 'Inference: real-time = 지속적 · serverless = 간헐적 · async = 길거나 큰 요청 · batch = offline dataset.',
							},
						],
					},
					{
						span: 12,
						title: 'Amazon Q',
						subtitle: '사용자를 먼저 확인',
						tone: 'violet',
						blocks: [
							{
								kind: 'services',
								columns: 4,
								items: [
									{
										name: 'Q Developer',
										role: 'code + AWS operation',
										trigger: 'developer / cloud',
										example: 'Lambda error 수정 · function 목록',
									},
									{
										name: 'Q Business',
										role: 'enterprise 지식',
										trigger: '직원 / HR / IT',
										example: '“회사 휴가 정책은?”',
									},
									{
										name: 'Connect AI agents (구 Q in Connect)',
										role: '상담원에게 실시간 안내',
										trigger: 'contact center',
										example: '고객 통화 중 답변 제안',
									},
									{
										name: 'Quick Sight (구 Q in QuickSight)',
										role: 'BI + 시각화',
										trigger: 'analyst / dashboard',
										example: '“region별 매출 chart”',
									},
								],
							},
							{
								kind: 'tags',
								tags: [
									{
										text: 'Q for EC2 · instance 안내',
										tone: 'violet',
									},
									{
										text: 'Q Developer in chat applications (구 AWS Chatbot) · Slack/Teams operation',
										tone: 'violet',
									},
									{
										text: 'Q for Glue · ETL 지원',
										tone: 'violet',
									},
									{
										text: 'Q Apps · no-code enterprise app',
										tone: 'violet',
									},
									{
										text: 'PartyRock · no-code FM 실습장',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 7,
						title: '바로 쓰는 AI API',
						definition: 'API 호출 · custom model training 불필요',
						blocks: [
							{
								kind: 'tags',
								tags: [
									{
										text: 'Comprehend · review sentiment 분석',
										tone: 'teal',
									},
									{
										text: 'Rekognition · video 속 얼굴',
										tone: 'teal',
									},
									{
										text: 'Transcribe · 통화 audio → text',
										tone: 'teal',
									},
									{
										text: 'Polly · article → voice',
										tone: 'teal',
									},
									{
										text: 'Translate · English → Korean',
										tone: 'teal',
									},
									{
										text: 'Textract · invoice field',
										tone: 'teal',
									},
									{
										text: 'Lex · 고객지원 chatbot',
										tone: 'teal',
									},
									{
										text: 'Personalize · product 추천',
										tone: 'teal',
									},
									{
										text: 'Kendra · 회사 문서 검색',
										tone: 'teal',
									},
									{
										text: 'Mechanical Turk · crowd microtask',
										tone: 'teal',
									},
									{
										text: 'HealthScribe · clinical note',
										tone: 'teal',
									},
									{
										text: 'Transcribe Medical · medical speech',
										tone: 'teal',
									},
									{
										text: 'Comprehend Medical · clinical NLP',
										tone: 'teal',
									},
									{
										text: 'Forecast · demand 예측',
										tone: 'teal',
									},
								],
							},
							{
								kind: 'note',
								text: 'Pretrained API ≠ SageMaker custom model.',
							},
						],
					},
					{
						span: 5,
						title: 'Security/service 구분',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Inspector',
										detail: 'CVE / vulnerability',
										example: 'patch되지 않은 EC2 package',
										tone: 'warn',
									},
									{
										term: 'GuardDuty',
										detail: '진행 중인 threat',
										example: '비정상 crypto-mining traffic',
									},
									{
										term: 'Macie',
										detail: 'S3의 PII',
										example: 'bucket에 여권 번호 존재',
										tone: 'violet',
									},
									{
										term: 'AWS Config',
										detail: 'resource configuration',
										example: 'public S3 rule 위반',
									},
									{
										term: 'CloudTrail',
										detail: 'API activity history',
										example: '이 model을 누가 삭제했나?',
									},
									{
										term: 'Artifact',
										detail: 'AWS compliance 문서',
										example: 'SOC report download',
										tone: 'warn',
									},
									{
										term: 'Audit Manager',
										detail: 'audit evidence',
										example: 'PCI control evidence 수집',
										tone: 'violet',
									},
									{
										term: 'Trusted Advisor',
										detail: 'account 권고',
										example: 'cost + security 권고',
									},
									{
										term: 'PrivateLink',
										detail: 'private service access',
										example: 'public internet 없이 VPC → Bedrock',
										tone: 'violet',
									},
								],
							},
						],
					},
				],
			},
			{
				id: 'genai-decisions',
				kicker: '03 · GenAI 선택',
				title: '무엇을 바꿔야 하나?',
				note: 'Knowledge · behavior · output',
				cards: [
					{
						span: 8,
						title: 'Prompt vs RAG vs fine-tuning vs RLHF',
						definition: '같은 FM · 다른 개선 방법',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Prompt',
										detail: 'ask better · no weights',
										signal: 'instruction/example',
										example: '“bullet point 3개로 답해”',
									},
									{
										term: 'RAG',
										detail: '정보 검색 · weights 변경 없음',
										signal: '최신/private 정보',
										example: '오늘의 inventory retrieve',
									},
									{
										term: 'Fine-tune',
										detail: 'behavior 학습 · weights 변경',
										signal: 'tone/format/task',
										example: '회사 고객지원 tone 학습',
										tone: 'warn',
									},
									{
										term: 'RLHF / RFT',
										detail: 'reward로 최적화',
										signal: 'human ranking · reward function',
										example: '사람이 답변 A와 B의 선호도 평가',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 4,
						title: 'Bedrock inference mode',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'On-Demand',
										detail: '사용량 기반 결제 · 약정 없음',
										example: '새 chatbot · 불규칙한 traffic',
									},
									{
										term: 'Provisioned',
										detail: '예약된 throughput · 무약정 또는 약정',
										example: '지속적인 대규모 고객지원',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'note',
								text: '더 작은 model → 일반적으로 더 저렴하고 빨라요.',
							},
							{
								kind: 'note',
								text: 'Distillation: 큰 teacher → 작은 student · cost/latency 감소.',
							},
						],
					},
					{
						span: 7,
						title: 'Inference parameter',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Temperature',
										detail: '무작위성',
										example: '낮게 · financial report',
									},
									{
										term: 'Top K',
										detail: '고정 개수',
										example: 'K=10 · candidate 정확히 10개',
										tone: 'warn',
									},
									{
										term: 'Top P',
										detail: '누적 probability',
										example: 'P=.9 · 누적 90%에 도달할 token 후보',
										tone: 'warn',
									},
									{
										term: 'Stop sequence',
										detail: '중단 pattern',
										example: '</answer>에서 중단',
										tone: 'violet',
									},
									{
										term: 'Response length',
										detail: '최소/최대 output token',
										example: '최대 100 token · candidate 개수 아님',
									},
								],
							},
							{
								kind: 'note',
								text: 'K = 개수. P = probability pool. Length = output 크기. 낮은 temperature = 일관성.',
							},
						],
					},
					{
						span: 5,
						title: 'Prompting',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Zero-shot',
										detail: '“이 review를 분류해”',
									},
									{
										term: 'Few-shot',
										detail: '먼저 label된 review 3개 제공',
									},
									{
										term: 'Chain-of-thought',
										detail: '세금 문제를 단계로 분해',
										tone: 'warn',
									},
									{
										term: 'Negative',
										detail: '“경쟁사를 언급하지 마”',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Multimodal 선택 · output으로 구분',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: '검색 / match / 추천',
										detail: '“이 사진과 비슷한 신발 찾아줘”',
									},
									{
										term: 'Multimodal embedding',
										detail: '기존 item retrieve',
									},
									{
										term: '생성 / 설명 / 답변',
										detail: '“이 사진의 손상을 설명해”',
									},
									{
										term: 'Multimodal generative',
										detail: 'response 생성',
									},
								],
								joins: ['→', '·', '→'],
							},
						],
					},
					{
						span: 12,
						title: 'FM lifecycle',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Pre-train',
										detail: 'unlabeled 범용 data · FM 구축',
									},
									{
										term: 'Continued pre-train',
										detail: 'unlabeled medical text · domain 추가',
									},
									{
										term: 'Fine-tune',
										detail: 'labeled Q&A · task 특화',
									},
									{
										term: 'Inference',
										detail: '새 prompt · 답변 생성',
									},
								],
								joins: ['→', '→', '→'],
							},
						],
					},
				],
			},
			{
				id: 'ml-core',
				kicker: '04 · ML 핵심',
				title: 'Signal → training → evaluation',
				note: '학습 signal이 유형을 결정',
				cards: [
					{
						span: 12,
						title: 'Learning type · training signal로 구분',
						definition: 'task 이름은 달라도 · training signal이 결정',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Supervised',
										detail: 'label → 예측',
										example: 'email을 spam / safe로 label',
									},
									{
										term: 'Unsupervised',
										detail: 'label 없음 → group 발견',
										example: 'behavior에 따라 customer clustering',
										tone: 'violet',
									},
									{
										term: 'Semi-supervised',
										detail: '적은 labeled + 많은 unlabeled',
										example: 'labeled review 100개 + unlabeled 10k',
									},
									{
										term: 'Self-supervised',
										detail: 'data가 target 생성 · FM',
										example: 'masked / next token 예측',
										tone: 'warn',
									},
									{
										term: 'Reinforcement',
										detail: 'action + reward',
										example: 'collision을 피한 robot에 reward',
										tone: 'violet',
									},
									{
										term: 'Clustering',
										detail: 'unsupervised',
										example: 'traffic pattern 4개 발견',
									},
									{
										term: 'Fraud / sentiment',
										detail: 'semi-supervised 가능',
										example: '전문가가 작은 sample만 label',
										tone: 'warn',
									},
									{
										term: 'Neural network',
										detail: 'paradigm이 아니라 architecture',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 7,
						title: 'Data split',
						definition: '학습 → mock exam → 손대지 않은 final exam',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Train',
										detail: 'weights 학습',
									},
									{
										term: 'Validation',
										detail: 'tuning + 선택',
									},
									{
										term: 'Test',
										detail: '최종 generalization',
									},
								],
								joins: ['→', '→'],
							},
							{
								kind: 'note',
								text: 'Validation으로 튜닝하고 고르기. Test는 마지막까지 손대지 않아요.',
							},
						],
					},
					{
						span: 5,
						title: '세 가지 parameter 계층',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Parameters',
										detail: '학습됨 · weights/biases',
										example: '내부 feature weight',
									},
									{
										term: 'Hyperparameters',
										detail: '사전에 선택 · LR/epoch',
										example: 'learning rate = .001',
										tone: 'warn',
									},
									{
										term: 'Inference params',
										detail: 'request 시점 제어값',
										example: 'temperature = .2',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Feature engineering',
						definition: 'Raw data → 유용한 model input',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Structured',
										detail: 'normalize · impute · encode',
										example: 'country “KR” → category vector',
									},
									{
										term: 'Unstructured',
										detail: 'tokenize · vectorize · extract',
										example: 'review text → embedding',
										tone: 'warn',
									},
								],
							},
							{
								kind: 'note',
								text: '정리됨 ≠ model-ready.',
							},
						],
					},
					{
						span: 6,
						title: 'Deep Learning loop',
						definition: 'prediction error가 줄 때까지 반복',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Forward',
										detail: '예측',
									},
									{
										term: 'Loss',
										detail: '오차',
									},
									{
										term: 'Backprop',
										detail: 'gradient',
									},
									{
										term: 'Update',
										detail: 'weights',
									},
								],
								joins: ['→', '→', '→'],
							},
						],
					},
					{
						span: 7,
						title: 'Fit 진단',
						blocks: [
							{
								kind: 'compare',
								columns: 3,
								items: [
									{
										term: 'Underfitting',
										detail: 'train 낮음 · test 낮음 · high bias',
										example: '곡선 pattern에 직선 model',
										tone: 'warn',
									},
									{
										term: 'Good fit',
										detail: 'train 좋음 · test 좋음',
										example: '기존 + 신규 customer 모두에서 작동',
									},
									{
										term: 'Overfitting',
										detail: 'train 좋음 · test 낮음 · high variance',
										example: 'training customer 암기',
										tone: 'violet',
									},
								],
							},
							{
								kind: 'note',
								text: 'Overfitting 해결: 더 많고 다양한 data · regularization · early stopping · 더 단순한 model.',
							},
						],
					},
					{
						span: 5,
						title: 'Token → embedding',
						definition: '읽을 수 있는 단위 → 수치형 의미',
						blocks: [
							{
								kind: 'flow',
								steps: [
									{
										term: 'Text',
										detail: 'input',
									},
									{
										term: 'Token',
										detail: '단위',
									},
									{
										term: 'Embedding',
										detail: '의미 vector',
									},
								],
								joins: ['→', '→'],
							},
						],
					},
					{
						span: 6,
						title: 'Generative vs discriminative',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Generative',
										detail: 'pattern 학습 → 새 content 생성',
										example: '새 animal image 생성',
										tone: 'warn',
									},
									{
										term: 'Discriminative',
										detail: 'boundary 학습 → 분류',
										example: '이 image를 cat / dog로 label',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Image processing vs Computer vision',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Image processing',
										detail: 'pixel 변경',
										example: 'crop · sharpen · noise 제거',
									},
									{
										term: 'Computer vision',
										detail: 'content 이해',
										example: '선반 product 감지 + 개수 계산',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Metric 선택',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'BLEU',
										detail: 'translation · precision 중심',
									},
									{
										term: 'ROUGE',
										detail: 'summarization · recall 중심',
									},
									{
										term: 'BERTScore',
										detail: 'semantic similarity',
									},
									{
										term: 'Perplexity',
										detail: 'LLM uncertainty · 낮을수록 좋음',
										tone: 'warn',
									},
									{
										term: 'Accuracy',
										detail: '정답 비율 · imbalance 주의',
										tone: 'violet',
									},
									{
										term: 'Precision',
										detail: 'false positive 최소화',
									},
									{
										term: 'Recall',
										detail: 'false negative 최소화',
									},
									{
										term: 'F1',
										detail: 'precision + recall 균형',
										tone: 'warn',
									},
									{
										term: 'AUC-ROC',
										detail: 'threshold 전반의 ranking',
										tone: 'violet',
									},
									{
										term: 'Confusion matrix',
										detail: 'classification 결과 개수',
										tone: 'warn',
									},
									{
										term: 'RMSE',
										detail: 'regression · 큰 error에 더 큰 penalty',
									},
									{
										term: 'MAE',
										detail: 'regression · error에 동일 weight',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: '구현 risk',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Data quality',
										detail: '가장 큰 실무 과제',
										example: 'missing value · 잘못된 label',
										tone: 'warn',
									},
									{
										term: 'Bias',
										detail: 'group/class에 불공정',
										example: 'training data에서 특정 region 제외',
									},
									{
										term: 'Explainability',
										detail: '왜 이 output인가?',
										example: '규제기관이 loan 거절 이유를 요구',
										tone: 'violet',
									},
									{
										term: 'Scalability',
										detail: 'cost + latency + throughput',
										example: 'user 10명 → request 1M',
									},
									{
										term: 'Hallucination',
										detail: '그럴듯하지만 근거 없음',
										example: '존재하지 않는 정책 citation',
										tone: 'warn',
									},
									{
										term: 'Data leakage',
										detail: 'future/test data가 training에 유입',
										example: '내일의 정답으로 train',
										tone: 'violet',
									},
								],
							},
						],
					},
				],
			},
			{
				id: 'responsible-ai',
				kicker: '05 · Responsible AI + governance',
				title: '무엇을 누가 제어하나?',
				note: '차원 → service',
				cards: [
					{
						span: 12,
						title: 'Responsible AI 나침반',
						definition: 'scenario가 어떤 dimension을 위반했는지 확인',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Fairness',
										detail: '동등한 대우',
									},
									{
										term: 'Explainability',
										detail: '이유 이해',
									},
									{
										term: 'Privacy + security',
										detail: 'data 보호',
										tone: 'violet',
									},
									{
										term: 'Transparency',
										detail: '사용 사실 + 한계 공개',
									},
									{
										term: 'Veracity + robustness',
										detail: '변화/attack 중에도 정확',
										tone: 'warn',
									},
									{
										term: 'Governance',
										detail: 'owner + policy + review',
									},
									{
										term: 'Safety',
										detail: '피해 방지',
										tone: 'warn',
									},
									{
										term: 'Controllability',
										detail: '안내 · override · 중단',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 7,
						title: 'Responsible AI 선택',
						definition: 'deploy 전 · deploy 후 · generated output',
						blocks: [
							{
								kind: 'compare',
								columns: 3,
								items: [
									{
										term: 'Clarify',
										detail: 'bias + 설명',
										example: '왜 이 loan이 거절됐나?',
									},
									{
										term: 'Model Monitor',
										detail: 'drift + 품질',
										example: '이번 달 fraud accuracy 하락',
										tone: 'violet',
									},
									{
										term: 'Guardrails',
										detail: 'GenAI safety',
										example: '안전하지 않은 chatbot 답변 차단',
										tone: 'warn',
									},
									{
										term: 'Model Cards',
										detail: 'model 문서',
										example: '의도한 user + 한계 문서화',
									},
									{
										term: 'AI Service Cards',
										detail: 'AWS service 문서',
										example: 'AWS가 Rekognition 한계 설명',
										tone: 'violet',
									},
									{
										term: 'A2I',
										detail: '사람의 prediction review',
										example: '불확실한 진단을 사람이 확인',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 5,
						title: 'Ground Truth vs A2I',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Ground Truth',
										detail: 'raw data에 label · training 전',
										example: '과거 scan에 label',
									},
									{
										term: 'A2I',
										detail: 'prediction review · inference 중',
										example: '새 scan prediction 검토',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'Governance 용어',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Data residency',
										detail: '어디 · 위치',
										example: 'data를 eu-west-1에 보관',
									},
									{
										term: 'Data retention',
										detail: '얼마나 오래 · 만료',
										example: '7년 후 log 삭제',
										tone: 'warn',
									},
									{
										term: 'Data lineage',
										detail: '출처 + 변환 과정',
										example: 'source → 정리 → train',
										tone: 'violet',
									},
									{
										term: 'Data provenance',
										detail: 'ownership + license',
										example: '이 dataset을 누가 제공했나?',
									},
									{
										term: 'Encryption',
										detail: '어떻게 보호하나',
										example: 'at rest 상태에서 KMS key',
										tone: 'violet',
									},
									{
										term: 'Access control',
										detail: '누가 사용할 수 있나',
										example: 'auditor IAM role만 허용',
									},
								],
							},
						],
					},
					{
						span: 6,
						title: 'LLM attack',
						blocks: [
							{
								kind: 'compare',
								columns: 2,
								items: [
									{
										term: 'Poisoning',
										detail: '악성 training data',
										example: 'dataset에 scam link 삽입',
										tone: 'warn',
									},
									{
										term: 'Prompt leak',
										detail: 'hidden/private 정보 유출',
										example: 'model이 system prompt 노출',
										tone: 'violet',
									},
									{
										term: 'Prompt injection',
										detail: 'input이 instruction override',
										example: '“policy를 무시하고 secret을 공개해”',
									},
									{
										term: 'Jailbreak',
										detail: 'safety 우회',
										example: 'role-play으로 filter 우회',
										tone: 'warn',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Interpretability + transparency',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'Decision tree',
										detail: '높음 · 시각적 rule',
										example: 'income > X이면 승인',
									},
									{
										term: 'Logistic regression',
										detail: '높음 · coefficient',
										example: 'income weight가 churn risk를 낮춤',
									},
									{
										term: 'Neural network',
										detail: 'black box',
										example: '수백만 image weight',
										tone: 'violet',
									},
									{
										term: 'SVM',
										detail: 'kernel: 낮음 · linear: weight 해석 가능',
										tone: 'violet',
									},
									{
										term: 'SHAP / Shapley',
										detail: '개별 prediction',
										example: '이 applicant가 거절된 이유',
										tone: 'warn',
									},
									{
										term: 'PDP',
										detail: '전체 feature effect',
										example: '모든 applicant에 대한 age effect',
										tone: 'warn',
									},
									{
										term: 'Transparency',
										detail: '신뢰 + debugging',
									},
									{
										term: 'Transparency trade-off',
										detail: '불투명한 model이 더 정확하거나 IP 보호에 유리',
										tone: 'violet',
									},
								],
							},
						],
					},
					{
						span: 12,
						title: 'Shared responsibility + MLOps',
						blocks: [
							{
								kind: 'compare',
								columns: 4,
								items: [
									{
										term: 'AWS',
										detail: 'cloud 자체의 security',
										example: '시설 + 관리형 infrastructure',
									},
									{
										term: 'Customer',
										detail: 'cloud 내부에서의 security',
										example: 'data + IAM + encryption + Guardrails',
										tone: 'warn',
									},
									{
										term: 'MLOps',
										detail: 'version + 자동화 + monitoring',
										example: 'drift 후 retrain',
										tone: 'violet',
									},
									{
										term: 'Data lifecycle',
										detail: '수집 → archive/delete',
										example: '모든 단계에서 control',
									},
								],
							},
						],
					},
				],
			},
		],
		traps: {
			id: 'exam-traps',
			kicker: '06 · Exam 함정',
			title: 'X가 보이면 → Y 선택',
			note: '키워드 → 정답',
			items: [
				{
					signal: 'percentage / 누적 pool',
					pick: 'Top P · Top K 아님',
				},
				{
					signal: '고정된 candidate 개수',
					pick: 'Top K · Top P 아님',
				},
				{
					signal: 'false positive 비용이 큼',
					pick: 'precision',
				},
				{
					signal: 'false negative 비용이 큼',
					pick: 'recall',
				},
				{
					signal: 'FM이 raw input에서 label 생성',
					pick: 'self-supervised · unsupervised 아님',
				},
				{
					signal: 'group / cluster',
					pick: 'unsupervised · RL 아님',
				},
				{
					signal: 'action + reward',
					pick: 'reinforcement learning',
				},
				{
					signal: '적은 labeled + 많은 unlabeled',
					pick: 'semi-supervised',
				},
				{
					signal: '복잡한 문제 → 작은 단계',
					pick: 'chain-of-thought',
				},
				{
					signal: '최신/private 회사 정보',
					pick: 'RAG / Knowledge Bases',
				},
				{
					signal: '일관된 style / behavior',
					pick: 'fine-tuning',
				},
				{
					signal: '작은 model이 teacher 모방',
					pick: 'distillation',
				},
				{
					signal: '유해한 generated content',
					pick: 'Bedrock Guardrails',
				},
				{
					signal: '최적 FM 선택',
					pick: 'Bedrock Model Evaluation',
				},
				{
					signal: 'bias / prediction 설명',
					pick: 'SageMaker Clarify',
				},
				{
					signal: 'production drift / 품질',
					pick: 'Model Monitor',
				},
				{
					signal: '사람이 model prediction 검토',
					pick: 'A2I · Ground Truth 아님',
				},
				{
					signal: 'model input 저장/공유',
					pick: 'Feature Store',
				},
				{
					signal: 'raw data 정리/변환',
					pick: 'Data Wrangler',
				},
				{
					signal: 'no-code build/train/deploy',
					pick: 'Canvas',
				},
				{
					signal: 'contact center 실시간 지원',
					pick: 'Connect AI agents (구 Q in Connect)',
				},
				{
					signal: '사내 직원용 지식',
					pick: 'Q Business',
				},
				{
					signal: 'BI chart / 계산',
					pick: 'Quick Sight (구 Q in QuickSight)',
				},
				{
					signal: 'code / AWS resource / cost',
					pick: 'Q Developer',
				},
				{
					signal: '관리형 API로 ready-made FM 사용',
					pick: 'Bedrock',
				},
				{
					signal: 'custom ML lifecycle',
					pick: 'SageMaker AI',
				},
				{
					signal: 'ready-made task API',
					pick: 'Comprehend / Rekognition / Textract / …',
				},
				{
					signal: 'text + image 검색',
					pick: 'multimodal embedding',
				},
				{
					signal: 'train 좋음 · test 나쁨',
					pick: 'overfit / high variance',
				},
				{
					signal: 'train 나쁨 · test 나쁨',
					pick: 'underfit / high bias',
				},
				{
					signal: '최종 generalization',
					pick: 'test set · validation 아님',
				},
				{
					signal: '자동 CVE scan',
					pick: 'Inspector · Config 아님',
				},
				{
					signal: '누가 호출/변경/삭제했나?',
					pick: 'CloudTrail',
				},
				{
					signal: 'resource 상태 / compliance rule',
					pick: 'AWS Config',
				},
				{
					signal: 'cloud 자체 / cloud 내부 security',
					pick: 'AWS / customer',
				},
				{
					signal: '그럴듯하지만 거짓',
					pick: 'hallucination',
				},
			],
		},
	},
};

export function getAwsAiPractitionerContent(locale: StudyLocale): AwsAiPractitionerContent {
	return content[locale];
}
