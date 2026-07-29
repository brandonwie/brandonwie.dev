<!--
  S17 — FINE (0:10) · never cut · ONE STEP

  Added 2026-07-29 at Brandon's request: an end card with a thank-you to the
  room.

  "FINE" IS SPELLED THAT WAY ON PURPOSE. It is the Italian end title — the card
  that closes the film — and Brandon's degree is a B.A. in Theater & Film,
  Film Directing (Hanyang University; it is on the submitted CV). Left exactly as
  he wrote it. Do NOT "correct" it to FIN, THE END, or anything else.

  IT IS ALSO THE SLIDE THAT STAYS UP THROUGH Q&A. Session 1 is presentation plus
  questions, so this card is on screen for longer than any other beat in the
  deck — which is why it carries the invitation to ask, and why it is the one
  slide that must look composed rather than busy. Nothing moves after it lands.

  PRICED AT 0:10, NOT 0:00. The storyboard prices SPOKEN time, and "thank you —
  happy to take questions" is a spoken sentence. A card is not free just because
  it is small.

  PUBLISH-SAFE: a name and a thank-you. Nothing else on it.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelector('.fine'), { autoAlpha: 0, y: 10 });
		gsap.set(root.querySelectorAll('.line'), { autoAlpha: 0, y: 6 });

		ready = true;
	});

	$effect(() => {
		const target = step;
		if (!ready || target === applied) return;
		applied = target;
		render(target);
	});

	// Single step. `target` is accepted only to match the signature every other
	// slide in the deck uses.
	async function render(_target: number) {
		const { gsap } = await loadGsap();
		await tick();
		if (!root) return;

		const d = !animate || reducedMotion() ? 0 : 1;

		const timeline = gsap.timeline();

		// The card sets, then the thanks. Slower than the deck default because
		// this is the one place where arriving unhurried is the point — every
		// other beat is trying to get somewhere, and this one has arrived.
		timeline.to(root.querySelector('.fine'), {
			autoAlpha: 1,
			y: 0,
			duration: DURATION * 1.3 * d,
			ease: EASE,
		});

		timeline.to(
			root.querySelectorAll('.line'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.12 * d, ease: EASE },
			d ? '-=0.15' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<p class="fine">FINE</p>

	<p class="line thanks">Thank you for your time.</p>
	<p class="line ask">Happy to take questions.</p>

	<p class="line who">Seokhyun Wie</p>
</section>

<style>
	/* Centred rather than left-aligned like every other slide in the deck. That
	   break is deliberate: it signals the talk is over before a word is said. */
	.slide {
		width: 100%;
		max-width: 82rem;
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 0.6rem;
	}

	.fine {
		margin: 0 0 0.8rem;
		font-size: var(--deck-title);
		font-weight: 600;
		/* Wide tracking is what makes three letters read as a title card rather
		   than as a word someone forgot to finish. */
		letter-spacing: 0.4em;
		/* The tracking adds space after the final letter too, which visually
		   pushes the word off-centre; half of it back corrects that. */
		text-indent: 0.4em;
		visibility: hidden;
	}

	.line {
		margin: 0;
		font-size: var(--deck-subtitle);
		visibility: hidden;
	}

	.ask {
		opacity: 0.7;
	}

	.who {
		margin-top: 1.4rem;
		font-size: var(--deck-meta);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.5;
	}
</style>
