<!--
  S15 — Close (0:20) · never cut · ONE STEP

  GENERALIZED 2026-07-29 (Brandon: the deck is for general use now). This slide
  used to close on Sarah's three scope items — mono full-stack, StoryLine AI
  narrative, devops later — answered in her order. That list was the single most
  company-locked thing in the deck and it had to go.

  WHAT WAS DELIBERATELY KEPT. Brandon's first instinct was to delete the whole
  slide. It carries two separate things, though, and only one of them was
  company-specific: the scope list, and the callback to the S1 arc. The callback
  is the payoff S1 spends 45 seconds setting up — the same four capability
  labels returning, complete, with an open fifth node. Deleting the slide would
  have thrown that away to remove the list, so the list went and the arc stayed.

  THE CALLBACK IS THE ARC. Labels 1-4 come back VERBATIM from ArcSlide. Rewording
  them here breaks the callback and costs the payoff — that is the entire reason
  this slide exists now.

  THE FIFTH NODE IS DELIBERATELY EMPTY. Its dot is outlined rather than filled
  and its capability cell is blank. That used to be a setup — the three scope
  rows arrived on the advance and filled it. Now it is the statement itself: the
  next slot is open, and the presenter names the company out loud rather than the
  slide naming it. That is what makes this deck reusable without an edit.

  ONE STEP, because the advance had nothing left to reveal once the scope rows
  went. Everything arrives in one sequence: the rail draws, then the five nodes
  stagger in, and the fifth arriving last IS the callback landing.

  PUBLISH-SAFE: four past employers already on the submitted CV, and no fifth
  company named anywhere on the slide.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Labels 1-4 are verbatim from ArcSlide. Do not reword them here.
	// The fifth carries no company name on purpose — see the header note.
	const stops = [
		{ company: 'MODULABS', years: '2021 – 2023', gained: 'Frontend web', next: false },
		{ company: 'Moviation', years: '2023', gained: 'Frontend mobile · web', next: false },
		{ company: 'Playtag', years: '2023 – 2025', gained: 'Full-stack', next: false },
		{ company: 'MOBA', years: '2025 – now', gained: 'Lead backend · Infra', next: false },
		// The em dash is load-bearing, not decoration: an empty years cell would
		// collapse its line box and lift the fifth capability slot out of line with
		// the other four.
		{ company: 'Next', years: '—', gained: '', next: true },
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelector('.rail-line'), { scaleX: 0, transformOrigin: 'left center' });
		gsap.set(root.querySelectorAll('.stop'), { autoAlpha: 0, y: 8 });

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

		timeline.to(root.querySelector('.rail-line'), { scaleX: 1, duration: 0.6 * d, ease: EASE });

		// The fifth node arrives last in the stagger, which is the callback landing.
		timeline.to(
			root.querySelectorAll('.stop'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.08 * d, ease: EASE },
			d ? '-=0.25' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<h1>Four layers, one direction</h1>

	<div class="rail">
		<div class="rail-line" aria-hidden="true"></div>

		<ol class="stops">
			{#each stops as stop (stop.company)}
				<li class="stop" class:next={stop.next}>
					<span class="dot" aria-hidden="true"></span>
					<span class="company">{stop.company}</span>
					<span class="years">{stop.years}</span>
					<span class="gained">{stop.gained}</span>
				</li>
			{/each}
		</ol>
	</div>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.5rem, 4vh, 2.5rem);
	}

	h1 {
		font-size: var(--deck-title);
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0;
	}

	.rail {
		position: relative;
		padding-top: 1.5rem;
	}

	.rail-line {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: currentColor;
		opacity: 0.35;
	}

	.dot {
		position: absolute;
		top: calc(-1.5rem - 3px);
		left: 0;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}

	/* The next one has not happened yet, so its node is outlined rather than
	   filled. */
	.stop.next .dot {
		background: transparent;
		border: 1px solid currentColor;
	}

	.stops {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 1rem;
	}

	.stop {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.company {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.years {
		font-size: var(--deck-meta);
		opacity: 0.55;
		font-variant-numeric: tabular-nums;
	}

	/* Empty on the fifth node, and the reserved height is what makes that read as
	   an open slot rather than a missing one — five columns, one baseline, the
	   last one waiting. */
	.gained {
		margin-top: 0.5rem;
		min-height: 1.5em;
		font-size: var(--deck-body);
		border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		padding-top: 0.5rem;
	}

	@media (max-width: 900px) {
		.rail {
			padding-top: 0;
		}

		.rail-line,
		.dot {
			display: none;
		}

		.stops {
			grid-template-columns: repeat(3, 1fr);
			gap: 1.25rem;
		}
	}
</style>
