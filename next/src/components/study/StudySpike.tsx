'use client';

import { getDsaIIContent, type StudyLocale } from '../../data/study';
import BstTraversalVisualizer from './BstTraversalVisualizer';
import HashMapVisualizer from './HashMapVisualizer';

/**
 * Client boundary for the two Slice 2 visualizer samples.
 *
 * WHY THE COPY IS RESOLVED HERE AND NOT IN THE ROUTE. `HashMapVisualizerCopy`
 * carries FUNCTIONS — `messages.place(key, index)` and four siblings build
 * their sentences from runtime values. A Server Component cannot pass a
 * function to a Client Component; the boundary only takes serializable props.
 * So the copy has to be read on the client side of the boundary, which is why
 * this wrapper exists at all.
 *
 * That is a finding for the Slice 4 estimate, not a detail of this route: any
 * study page whose copy object holds message builders faces the same
 * constraint, and the shape of the fix — resolve copy inside the client
 * subtree, or flatten the builders into pre-rendered strings — is a decision
 * the cohort port has to make once.
 *
 * The cost of resolving here is that `src/lib/data/study.ts` enters the client
 * bundle. That matches the Svelte build, where the same module is imported by
 * the same components and shipped to the browser for the same reason.
 */
export default function StudySpike({ locale }: { locale: StudyLocale }) {
	const content = getDsaIIContent(locale);
	return (
		<div className="grid gap-6">
			<BstTraversalVisualizer copy={content.visuals.bstTraversal} />
			<HashMapVisualizer copy={content.visuals.hashMap} />
		</div>
	);
}
