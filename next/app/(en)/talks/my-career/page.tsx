import type { Metadata } from 'next';

import AccountSeparationSlide from '@/components/deck/AccountSeparationSlide';
import ArcSlide from '@/components/deck/ArcSlide';
import ModulabsSlide from '@/components/deck/ModulabsSlide';
import MoviationSlide from '@/components/deck/MoviationSlide';
import PlaytagAdminSlide from '@/components/deck/PlaytagAdminSlide';
import PushSlide from '@/components/deck/PushSlide';
import TitleSlide from '@/components/deck/TitleSlide';
import Deck from '@/components/deck/Deck';
import type { DeckSlide } from '@/deck/types';

/**
 * `/talks/my-career` — presentation deck route shell (PR-A).
 *
 * PR-B lands the remaining beats in storyboard-ordered batches around the
 * two previously ported slides. Until the full set lands, the registry comment
 * below identifies its temporary construction order. EventDriven and
 * ParallelSync carry the binding S60 Flip prescriptions at port time.
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

// Partial PR-B registry: batch 1 lands storyboard pages 1–5 in order, ahead of
// the two already-ported MOBA beats. Pages 6–7 and 9+ are still unported, so
// `account-separation` and `push` ride appended, NOT in storyboard position;
// deep-link page numbers are construction-order until the full PR-B landing.
const slides: DeckSlide[] = [
	{ id: 'title', label: 'Title', steps: 1, component: TitleSlide },
	{ id: 'arc', label: 'The arc', steps: 2, component: ArcSlide },
	{ id: 'modulabs', label: 'MODULABS', steps: 2, component: ModulabsSlide },
	{ id: 'moviation', label: 'Moviation', steps: 2, component: MoviationSlide },
	{ id: 'playtag-admin', label: 'Playtag — admin tool', steps: 2, component: PlaytagAdminSlide },
	{
		id: 'account-separation',
		label: 'Sync — account separation',
		steps: 2,
		component: AccountSeparationSlide,
	},
	{ id: 'push', label: 'Sync — polling to push', steps: 2, component: PushSlide },
];

export default function TalksMyCareerPage() {
	return <Deck slides={slides} title="Seokhyun Wie — Four companies, one direction" />;
}
