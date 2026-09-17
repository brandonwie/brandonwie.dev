'use client';

import DsaStudyPageLayout from './DsaStudyPageLayout';
import AvlTreeVisualizer from './AvlTreeVisualizer';
import DivideConquerSortVisualizer from './DivideConquerSortVisualizer';
import IterativeSortVisualizer from './IterativeSortVisualizer';
import TwoFourTreeVisualizer from './TwoFourTreeVisualizer';
import { getDsaIIIContent, type StudyLocale } from '../../data/study';

/**
 * DsaIIIStudyPage — Georgia Tech DSA III: balanced trees and sorting. Thin
 * wrapper over `DsaStudyPageLayout`; port of
 * `src/lib/components/study/DsaIIIStudyPage.svelte`.
 */
export default function DsaIIIStudyPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getDsaIIIContent(locale);
	return (
		<DsaStudyPageLayout
			slug="dsa-iii"
			locale={locale}
			content={content}
			lab={
				<>
					<AvlTreeVisualizer copy={content.visuals.avl} />
					<TwoFourTreeVisualizer copy={content.visuals.twoFour} />
					<IterativeSortVisualizer copy={content.visuals.iterativeSort} />
					<DivideConquerSortVisualizer copy={content.visuals.dcSort} />
				</>
			}
		/>
	);
}
