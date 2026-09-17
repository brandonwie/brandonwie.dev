import type { Metadata } from 'next';

import AccountSeparationSlide from '@/components/deck/AccountSeparationSlide';
import AiNativeLoopSlide from '@/components/deck/AiNativeLoopSlide';
import ArcSlide from '@/components/deck/ArcSlide';
import CloseSlide from '@/components/deck/CloseSlide';
import CommunicationSlide from '@/components/deck/CommunicationSlide';
import DataPipelineSlide from '@/components/deck/DataPipelineSlide';
import EndSlide from '@/components/deck/EndSlide';
import EventDrivenSlide from '@/components/deck/EventDrivenSlide';
import InfrastructureSlide from '@/components/deck/InfrastructureSlide';
import LearningSlide from '@/components/deck/LearningSlide';
import MobaSetupSlide from '@/components/deck/MobaSetupSlide';
import ModulabsSlide from '@/components/deck/ModulabsSlide';
import MoviationSlide from '@/components/deck/MoviationSlide';
import ParallelSyncSlide from '@/components/deck/ParallelSyncSlide';
import PlaytagAdminSlide from '@/components/deck/PlaytagAdminSlide';
import PlaytagBackendSlide from '@/components/deck/PlaytagBackendSlide';
import PrivacyMatrixSlide from '@/components/deck/PrivacyMatrixSlide';
import PushSlide from '@/components/deck/PushSlide';
import RetrievalRebuildSlide from '@/components/deck/RetrievalRebuildSlide';
import TitleSlide from '@/components/deck/TitleSlide';
import Deck from '@/components/deck/Deck';
import type { DeckSlide } from '@/deck/types';

/**
 * `/talks/my-career` — presentation deck route shell (PR-A).
 *
 * PR-B landed the remaining 18 beats in four storyboard-ordered batches
 * around the two previously ported slides. The registry below is final.
 * EventDriven and ParallelSync carried the binding S60 Flip prescriptions
 * at port time.
 *
 * Publish surface, settled 2026-07-29 (Brandon): unlisted, not hidden —
 * reachable by link, out of every discovery surface (no nav entry, no
 * sitemap row, no search-index entry, no inbound link). The `robots`
 * metadata below is what does the work, and it only works because
 * robots.txt still allows crawling: do NOT add `Disallow: /talks/`.
 *
 * Metadata is deliberately title + robots only. The baseline record
 * carries no description, canonical, alternates, or OG on this route
 * (all null/empty), and the tab title takes no `| Brandon Wie` suffix —
 * it quotes the slide headline verbatim.
 */
export function generateMetadata(): Metadata {
	return {
		title: 'Seokhyun Wie — Four companies, one direction',
		robots: 'noindex, nofollow',
	};
}

// Final PR-B registry: all 20 beats are in exact storyboard order. The
// storyboard's Page column maps one-based onto this array's index.
const slides: DeckSlide[] = [
	{ id: 'title', label: 'Title', steps: 1, component: TitleSlide },
	{ id: 'arc', label: 'The arc', steps: 2, component: ArcSlide },
	{ id: 'modulabs', label: 'MODULABS', steps: 2, component: ModulabsSlide },
	{ id: 'moviation', label: 'Moviation', steps: 2, component: MoviationSlide },
	{ id: 'playtag-admin', label: 'Playtag — admin tool', steps: 2, component: PlaytagAdminSlide },
	{
		id: 'playtag-backend',
		label: 'Playtag — backend',
		steps: 2,
		component: PlaytagBackendSlide,
	},
	{ id: 'moba-setup', label: 'MOBA — the setup', steps: 2, component: MobaSetupSlide },
	{
		id: 'account-separation',
		label: 'Sync — account separation',
		steps: 2,
		component: AccountSeparationSlide,
	},
	{
		id: 'event-driven',
		label: 'Decoupling the sync queue',
		steps: 2,
		component: EventDrivenSlide,
	},
	{ id: 'push', label: 'Sync — polling to push', steps: 2, component: PushSlide },
	{
		id: 'parallel',
		label: 'Sync — linear to parallel',
		steps: 2,
		component: ParallelSyncSlide,
	},
	{
		id: 'infrastructure',
		label: 'Infrastructure',
		steps: 2,
		component: InfrastructureSlide,
	},
	{
		id: 'data-pipeline',
		label: 'Data pipeline',
		steps: 2,
		component: DataPipelineSlide,
	},
	{
		id: 'ai-native-loop',
		label: '3B — the AI-native loop',
		steps: 2,
		component: AiNativeLoopSlide,
	},
	{
		id: 'retrieval-rebuild',
		label: '3B — kill, diagnose, rebuild',
		steps: 2,
		component: RetrievalRebuildSlide,
	},
	{
		id: 'privacy-matrix',
		label: 'Privacy governance',
		steps: 2,
		component: PrivacyMatrixSlide,
	},
	{ id: 'close', label: 'Close', steps: 1, component: CloseSlide },
	{
		id: 'communication',
		label: 'How I work',
		steps: 2,
		component: CommunicationSlide,
	},
	{
		id: 'learning',
		label: 'Never stopped learning',
		steps: 1,
		component: LearningSlide,
	},
	{ id: 'end', label: 'FINE', steps: 1, component: EndSlide },
];

export default function TalksMyCareerPage() {
	return <Deck slides={slides} title="Seokhyun Wie — Four companies, one direction" />;
}
