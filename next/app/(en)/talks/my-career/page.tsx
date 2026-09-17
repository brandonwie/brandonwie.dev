import type { Metadata } from 'next';

import AccountSeparationSlide from '@/components/deck/AccountSeparationSlide';
import PushSlide from '@/components/deck/PushSlide';
import Deck from '@/components/deck/Deck';
import type { DeckSlide } from '@/deck/types';

/**
 * `/talks/my-career` — presentation deck route shell (PR-A).
 *
 * PR-A hosts ONLY the already-ported `account-separation` beat. The array
 * order below IS the storyboard order (see `+page.svelte` in the Svelte
 * stack: the `Page` column in storyboard.md is this array's one-based
 * index); the other 19 beats land in PR-B. The S57 Flip finding
 * (zero-flight, hosted as-is) travels with this slide, not with the shell.
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

// PR-A registry: one beat. PR-B appends the remaining 19 in storyboard order.
// SAMPLE (PR-B sizing): `push` rides appended, NOT in storyboard position
// (storyboard page 10 — its neighbors are unported). It moves into position
// with the full PR-B landing; deep-link page numbers are construction-order
// until then.
const slides: DeckSlide[] = [
	{
		id: 'account-separation',
		label: 'Sync — account separation',
		steps: 2,
		component: AccountSeparationSlide,
	},
	{
		id: 'push',
		label: 'Sync — polling to push',
		steps: 2,
		component: PushSlide,
	},
];

export default function TalksMyCareerPage() {
	return <Deck slides={slides} title="Seokhyun Wie — Four companies, one direction" />;
}
