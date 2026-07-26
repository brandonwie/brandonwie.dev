<!--
  /talks/my-career

  Presentation deck. Content is governed by the fact ledger in 3B:
  projects/3b/actives/playtag-interview/facts.md — every claim on a slide must
  have a `verified` row there. Structure follows storyboard.md.

  Currently a vertical slice: S1 (the arc) and S7 (decoupling the sync queue).
  S7 first because it is the hardest animation in the deck — if Flip plus
  DrawSVG works cleanly here, the remaining slides are mass production.

  Navigation: ArrowRight / Space advance, ArrowLeft goes back, Home / End jump.
  Append ?print for the stacked PDF-export view.
-->
<script lang="ts">
	import Deck from '$lib/components/deck/Deck.svelte';
	import type { DeckSlide } from '$lib/components/deck/types';
	import ArcSlide from './slides/ArcSlide.svelte';
	import ModulabsSlide from './slides/ModulabsSlide.svelte';
	import MoviationSlide from './slides/MoviationSlide.svelte';
	import PlaytagAdminSlide from './slides/PlaytagAdminSlide.svelte';
	import PlaytagBackendSlide from './slides/PlaytagBackendSlide.svelte';
	import MobaSetupSlide from './slides/MobaSetupSlide.svelte';
	import AccountSeparationSlide from './slides/AccountSeparationSlide.svelte';
	import EventDrivenSlide from './slides/EventDrivenSlide.svelte';

	// Chronological, per storyboard.md. The sync-queue slide is MOBA work and now
	// sits behind the MOBA setup slide; the remaining sync beats slot in around
	// it as they are built.
	const slides: DeckSlide[] = [
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
	];
</script>

<Deck {slides} title="Seokhyun Wie — Playtag" />
