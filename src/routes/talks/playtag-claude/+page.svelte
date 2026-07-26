<!--
  /talks/playtag-claude

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
	import EventDrivenSlide from './slides/EventDrivenSlide.svelte';

	const slides: DeckSlide[] = [
		{ id: 'arc', label: 'The arc', steps: 2, component: ArcSlide },
		{
			id: 'event-driven',
			label: 'Decoupling the sync queue',
			steps: 5,
			component: EventDrivenSlide,
		},
	];
</script>

<Deck {slides} title="Seokhyun Wie — Playtag" />
