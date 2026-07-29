<!--
  S0 — Title (0:15) · never cut

  Name and one thesis line. Nothing else; the presenter says the rest.

  THE HEADLINE ADDRESSES THE ROOM, NOT A COMPANY (Brandon, 2026-07-29). It read
  "The layer I'd bring to mono", which pinned the first sentence of the deck to
  one employer and made the whole thing single-use. "to you" says the same thing
  to whoever is sitting there, so this deck can be walked again without an edit.
  It also lands better spoken: it is addressed to the people in the room rather
  than to their company name.

  The headline leads with the destination rather than repeating S1's "Four
  companies, one direction" verbatim two slides running. It is a claim about
  fit, not a claim of past credit, so it does not trip the downward-correction
  rule the earlier sections went through.

  NO SplitText. The storyboard asked for a SplitText line reveal, but SplitText
  is a Club GreenSock plugin and gsap.ts registers only Flip and DrawSVG.
  Licensing a plugin the day before the talk buys nothing a per-line stagger
  does not already read as at this size.

  steps: 1 — a title slide has no transition to make.

  PUBLISH-SAFE: a name and a sentence. Nothing to scrub.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	// `step` is accepted for the DeckSlide contract but unused — this slide has
	// one state.
	let { animate = true }: { step?: number; animate?: boolean } = $props();

	let root = $state<HTMLElement>();

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		const lines = root.querySelectorAll('.reveal');
		const d = !animate || reducedMotion() ? 0 : 1;

		gsap.set(lines, { autoAlpha: 0, y: 10 });
		gsap.to(lines, {
			autoAlpha: 1,
			y: 0,
			duration: DURATION * d,
			stagger: 0.1 * d,
			ease: EASE,
		});
	});
</script>

<section class="slide" bind:this={root}>
	<p class="who reveal">Seokhyun Wie</p>
	<h1 class="reveal">The layer I'd bring to you</h1>
	<p class="thesis reveal">
		Frontend to full-stack to backend to infrastructure &mdash; four companies, one direction.
	</p>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(0.75rem, 2vh, 1.25rem);
	}

	/* Resting state in CSS, not only in JS: onMount runs after first paint, so a
	   JS-only resting state flashes the finished title. Same reason as the notes
	   on the sync and data-pipeline slides. */
	.reveal {
		visibility: hidden;
		opacity: 0;
	}

	.who {
		margin: 0;
		font-size: var(--deck-meta);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	h1 {
		font-size: var(--deck-title);
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0;
	}

	.thesis {
		margin: 0.5rem 0 0;
		font-size: var(--deck-subtitle);
		opacity: 0.7;
		max-width: 46ch;
	}
</style>
