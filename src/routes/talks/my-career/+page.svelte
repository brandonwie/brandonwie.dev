<!--
  /talks/my-career

  Presentation deck. Content is governed by the fact ledger in 3B:
  projects/3b/actives/playtag-interview/facts.md — every claim on a slide must
  have a `verified` row there. Structure follows storyboard.md.

  All 20 beats are registered — 17 as of 2026-07-28, plus the learning beat and
  the end card appended 2026-07-29, plus the how-I-work beat inserted before the
  credentials later the same day. The array order below IS the storyboard order,
  and the `Page` column in storyboard.md is this array's one-based index — if the
  two ever disagree, the storyboard is the spec and this file is wrong.

  Build order was deliberate, not chronological: S7 (decoupling the sync queue)
  was built first because Flip plus DrawSVG is the hardest animation here. Once
  that worked, the rest was mass production.

  Navigation: ArrowRight / Space advance, ArrowLeft goes back, Home / End jump.
  Append ?print for the stacked PDF-export view.
-->
<script lang="ts">
	import Deck from '$lib/components/deck/Deck.svelte';
	import type { DeckSlide } from '$lib/components/deck/types';
	import TitleSlide from './slides/TitleSlide.svelte';
	import ArcSlide from './slides/ArcSlide.svelte';
	import ModulabsSlide from './slides/ModulabsSlide.svelte';
	import MoviationSlide from './slides/MoviationSlide.svelte';
	import PlaytagAdminSlide from './slides/PlaytagAdminSlide.svelte';
	import PlaytagBackendSlide from './slides/PlaytagBackendSlide.svelte';
	import MobaSetupSlide from './slides/MobaSetupSlide.svelte';
	import AccountSeparationSlide from './slides/AccountSeparationSlide.svelte';
	import PushSlide from './slides/PushSlide.svelte';
	import ParallelSyncSlide from './slides/ParallelSyncSlide.svelte';
	import InfrastructureSlide from './slides/InfrastructureSlide.svelte';
	import DataPipelineSlide from './slides/DataPipelineSlide.svelte';
	import EventDrivenSlide from './slides/EventDrivenSlide.svelte';
	import AiNativeLoopSlide from './slides/AiNativeLoopSlide.svelte';
	import RetrievalRebuildSlide from './slides/RetrievalRebuildSlide.svelte';
	import PrivacyMatrixSlide from './slides/PrivacyMatrixSlide.svelte';
	import CloseSlide from './slides/CloseSlide.svelte';
	import CommunicationSlide from './slides/CommunicationSlide.svelte';
	import LearningSlide from './slides/LearningSlide.svelte';
	import EndSlide from './slides/EndSlide.svelte';

	// Chronological, per storyboard.md: title, the arc, then the four companies in
	// order, then MOBA depth (sync then infrastructure then data), then 3B, then
	// the close, then the character section, then the end card. Pages 7–13 are the
	// MOBA section, 14–16 are 3B, 17 closes, 18–19 are the character pair (how he
	// works, then what he kept learning), and 20 is FINE.
	const slides: DeckSlide[] = [
		{ id: 'title', label: 'Title', steps: 1, component: TitleSlide },
		{ id: 'arc', label: 'The arc', steps: 2, component: ArcSlide },
		{ id: 'modulabs', label: 'MODULABS', steps: 2, component: ModulabsSlide },
		{ id: 'moviation', label: 'Moviation', steps: 2, component: MoviationSlide },
		{ id: 'playtag-admin', label: 'Playtag — admin tool', steps: 2, component: PlaytagAdminSlide },
		{ id: 'playtag-backend', label: 'Playtag — backend', steps: 2, component: PlaytagBackendSlide },
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
		{ id: 'parallel', label: 'Sync — linear to parallel', steps: 2, component: ParallelSyncSlide },
		{ id: 'infrastructure', label: 'Infrastructure', steps: 2, component: InfrastructureSlide },
		{ id: 'data-pipeline', label: 'Data pipeline', steps: 2, component: DataPipelineSlide },
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
			// Renders live in the progress rail, so this label is on screen the whole
			// time the slide is up. It named the company until 2026-07-29; the slide
			// body had already been generalized and the rail had been missed.
			label: 'Privacy governance',
			steps: 2,
			component: PrivacyMatrixSlide,
		},
		{ id: 'close', label: 'Close', steps: 1, component: CloseSlide },
		// Page 18, inserted immediately before the credentials at Brandon's
		// instruction (2026-07-29). Position matters both ways round: the three
		// anchors on this slide are callbacks to pages 3, 12 and 15, so it has to
		// come after all of them, and putting it directly before the credentials
		// pairs how-he-works with what-he-learned as one character section rather
		// than leaving either stranded on its own after the close.
		{ id: 'communication', label: 'How I work', steps: 2, component: CommunicationSlide },
		// Page 19, appended after the close at Brandon's instruction (2026-07-29).
		// Worth knowing it sits after the close rather than before it: the close
		// answers the role's three scope items and ends on "in that order", which
		// is a deliberate last word, and this beat lands after that. Moving it to
		// page 17 is a one-line swap with the entry above, and there is a real
		// argument for it — the close's third row is "devops, later; Terraform and
		// AWS already", which the two AWS certifications directly back, so putting
		// the evidence immediately before the summary lets the close land on top
		// of it. Left at 18 as asked; the decision is Brandon's.
		{ id: 'learning', label: 'Never stopped learning', steps: 1, component: LearningSlide },
		// The end card, and the slide that is actually on screen longest: Session 1
		// is presentation plus Q&A, so this one holds while the questions run.
		{ id: 'end', label: 'FINE', steps: 1, component: EndSlide },
	];
</script>

<Deck {slides} title="Seokhyun Wie — Playtag" />
