import type { Metadata } from 'next';

import StudySpike from '@/components/study/StudySpike';

/**
 * Slice 2 study-visualizer spike route — scaffolding, deleted at Slice 4.
 *
 * WHY A SPIKE ROUTE AND NOT `/study/dsa-ii`. The real route renders nine study
 * components, and `behavior-matrix.md` assigns all nine of them, plus both
 * locales, to Slice 4. Shipping it now would pull that cohort forward and
 * bury the two samples this slice exists to measure inside seven it has not
 * ported. This route costs exactly one comparator difference — `present in
 * candidate, absent from baseline` — and one ledger entry approving it, the
 * same arrangement `migration-fixture/mermaid` uses and for the same reason.
 *
 * WHY THESE TWO SAMPLES. The seventeen study visualizers split into two
 * disjoint behavior classes: twelve are Stepper-driven traces, and four use
 * `animate:flip`, which React has no equivalent for. One sample cannot price
 * both, and calibrating the cohort from the cheaper class would understate the
 * other four by whatever the FLIP reimplementation costs.
 * `BstTraversalVisualizer` (212 lines) and `HashMapVisualizer` (260 lines) are
 * one of each, and both already live on the same baseline-captured route.
 *
 * WHY IT IS LEDGERED AND NOT SKIPPED. A skip hides pages from the comparator
 * and nobody reads it again. A ledger entry is visible and self-cleaning: when
 * Slice 4 deletes this directory the entry stops matching anything, is counted
 * stale, and fails the run until it is removed too.
 */
export const metadata: Metadata = {
	title: 'Slice 2 study spike',
	description:
		'Slice 2 verification fixture: one Stepper-driven visualizer and one keyed-list FLIP visualizer.',
	robots: { index: false, follow: false },
};

export default function StudySpikePage() {
	return (
		<main>
			<h1>Slice 2 study spike</h1>
			<StudySpike locale="en" />
		</main>
	);
}
