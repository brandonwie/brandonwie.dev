/**
 * Study copy, read from the Svelte tree rather than copied.
 *
 * Same rule as `system-snapshot.ts` and `content/social-feed.tsx`: while both
 * stacks exist, a shared input is imported across rather than duplicated, so
 * the two builds cannot drift apart while nobody is looking.
 *
 * `src/lib/data/study.ts` is plain TypeScript — 2,710 lines of typed copy with
 * no Svelte import and no framework dependency — so it needs no port at all.
 * That is why its lines are excluded from the Slice 2 calibration: counting
 * them would flatter the rate with work nobody has to do.
 */
export type {
	BstTraversalCopy,
	HashMapVisualizerCopy,
	StepperCopy,
	StudyLocale,
} from '../../../src/lib/data/study';
export { getDsaIIContent } from '../../../src/lib/data/study';
