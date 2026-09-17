'use client';

import DsaStudyPageLayout from './DsaStudyPageLayout';
import ArrayListVisualizer from './ArrayListVisualizer';
import BigOExplorer from './BigOExplorer';
import BinarySearchVisualizer from './BinarySearchVisualizer';
import RecursionTrace from './RecursionTrace';
import StackQueueVisualizer from './StackQueueVisualizer';
import { getDsaIContent, type StudyLocale } from '../../data/study';

/**
 * DsaIStudyPage — Georgia Tech DSA I: Big-O, arrays, recursion, binary
 * search, stacks and queues. Thin wrapper over `DsaStudyPageLayout`; port
 * of `src/lib/components/study/DsaIStudyPage.svelte`.
 */
export default function DsaIStudyPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getDsaIContent(locale);
	return (
		<DsaStudyPageLayout
			slug="dsa-i"
			locale={locale}
			content={content}
			lab={
				<>
					<BigOExplorer copy={content.visuals.bigO} />
					<ArrayListVisualizer copy={content.visuals.arrayList} />
					<RecursionTrace copy={content.visuals.recursion} />
					<BinarySearchVisualizer copy={content.visuals.binarySearch} />
					<StackQueueVisualizer copy={content.visuals.stackQueue} />
				</>
			}
		/>
	);
}
