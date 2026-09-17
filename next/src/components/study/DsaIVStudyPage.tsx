'use client';

import DsaStudyPageLayout from './DsaStudyPageLayout';
import GraphTraversalVisualizer from './GraphTraversalVisualizer';
import LcsTableVisualizer from './LcsTableVisualizer';
import MstVisualizer from './MstVisualizer';
import PatternMatchVisualizer from './PatternMatchVisualizer';
import { getDsaIVContent, type StudyLocale } from '../../data/study';

/**
 * DsaIVStudyPage — Georgia Tech DSA IV: pattern matching, graphs, dynamic
 * programming. Thin wrapper over `DsaStudyPageLayout`; port of
 * `src/lib/components/study/DsaIVStudyPage.svelte`.
 */
export default function DsaIVStudyPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getDsaIVContent(locale);
	return (
		<DsaStudyPageLayout
			slug="dsa-iv"
			locale={locale}
			content={content}
			lab={
				<>
					<PatternMatchVisualizer copy={content.visuals.patternMatch} />
					<GraphTraversalVisualizer copy={content.visuals.graphTraversal} />
					<MstVisualizer copy={content.visuals.mst} />
					<LcsTableVisualizer copy={content.visuals.lcsTable} />
				</>
			}
		/>
	);
}
