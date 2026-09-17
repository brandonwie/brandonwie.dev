'use client';

import DsaStudyPageLayout from './DsaStudyPageLayout';
import BstRemovalVisualizer from './BstRemovalVisualizer';
import BstTraversalVisualizer from './BstTraversalVisualizer';
import HashMapVisualizer from './HashMapVisualizer';
import HeapVisualizer from './HeapVisualizer';
import { getDsaIIContent, type StudyLocale } from '../../data/study';

/**
 * DsaIIStudyPage — Georgia Tech DSA II: BSTs, heaps, hash maps. Thin wrapper
 * over `DsaStudyPageLayout`; port of
 * `src/lib/components/study/DsaIIStudyPage.svelte`.
 */
export default function DsaIIStudyPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getDsaIIContent(locale);
	return (
		<DsaStudyPageLayout
			slug="dsa-ii"
			locale={locale}
			content={content}
			lab={
				<>
					<BstTraversalVisualizer copy={content.visuals.bstTraversal} />
					<BstRemovalVisualizer copy={content.visuals.bstRemoval} />
					<HeapVisualizer copy={content.visuals.heap} />
					<HashMapVisualizer copy={content.visuals.hashMap} />
				</>
			}
		/>
	);
}
