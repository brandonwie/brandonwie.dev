<!--
  /talks/my-career

  Presentation deck. Content is governed by the fact ledger in 3B:
  projects/3b/actives/playtag-interview/facts.md — every claim on a slide must
  have a `verified` row there. Structure follows storyboard.md.

  All 17 beats are registered as of 2026-07-28. The array order below IS the
  storyboard order, and the `Page` column in storyboard.md is this array's
  one-based index — if the two ever disagree, the storyboard is the spec and
  this file is wrong.

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

	// Chronological, per storyboard.md: title, the arc, then the four companies in
	// order, then MOBA depth (sync then infrastructure then data), then 3B, then
	// the close. Pages 7–13 are the MOBA section; 14–17 are 3B and the close.
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
			label: 'Privacy governance → mono',
			steps: 2,
			component: PrivacyMatrixSlide,
		},
		{ id: 'close', label: 'Close', steps: 2, component: CloseSlide },
	];
</script>

<Deck {slides} title="Seokhyun Wie — Playtag" />
