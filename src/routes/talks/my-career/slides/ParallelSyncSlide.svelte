<!--
  S9 — Sync: linear → parallel (0:45)

  FIVE BLOCKS, NOT FOUR, AND THAT IS DELIBERATE. Run in line, five batches
  occupy the whole track; run together, they occupy one fifth of it. The
  animation therefore *is* the 5x — the number is not asserted next to a
  picture, it is the picture. Change the count and the arithmetic on screen
  stops matching the claim.

  5x is locked in facts.md C1 and matches the submitted CV. The interview-facts
  file offers a 5–20x range; that range is deliberately NOT used. Pick the
  figure the panel is holding.

  The blocks are the same DOM nodes in both states — a class flips the flex
  direction and Flip animates the delta. Nothing is created or destroyed, so
  the five things that were queued are visibly the five things now running.

  PUBLISH-SAFE: batch parallelism and a removed history cap, both already on the
  submitted CV, with no internal detail beyond it. Keep it that way — the repo
  this lives in is public.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Five, because five in line versus five at once is exactly the 5x claim.
	const BATCHES = [1, 2, 3, 4, 5];

	const notes = [
		'The one-year history cap was removed',
		'Heavy accounts no longer overflow memory during a sync',
	];

	let root = $state<HTMLElement>();
	let parallel = $state(false);
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
			gsap.set(root.querySelectorAll('.gain'), { autoAlpha: 0 });
		}
		ready = true;
	});

	$effect(() => {
		const target = step;
		if (!ready || target === applied) return;
		applied = target;
		render(target);
	});

	async function render(target: number) {
		const { gsap, Flip } = await loadGsap();
		if (!root) return;

		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = target >= 1;

		if (want !== parallel) {
			const state = still ? null : Flip.getState(root.querySelectorAll('.batch'));

			parallel = want;
			await tick();

			// Slower than the deck default. The blocks travel a long way and land in
			// a different arrangement; at the standard duration it reads as a jump
			// rather than as five things pulling alongside each other.
			if (state) Flip.from(state, { duration: DURATION * 1.5, ease: EASE, absolute: true });
		}

		await tick();

		// The multiple arrives after the blocks land, in the space the sequential
		// run used to occupy. That empty track is the argument.
		gsap.to(root.querySelectorAll('.gain'), {
			autoAlpha: want ? 1 : 0,
			duration: DURATION * d,
			ease: EASE,
			delay: want ? DURATION * 1.5 * d : 0,
		});

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: want ? 1 : 0,
			y: want ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: want ? DURATION * 1.7 * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA</p>
		<h1>Running the sync in parallel</h1>
		<p class="state">
			{#if parallel}
				After &mdash; the batches run together, and the history cap is gone
			{:else}
				Before &mdash; the batches ran one after another, under a one-year history cap
			{/if}
		</p>
	</header>

	<!-- The stage is a fixed box representing elapsed time. Five blocks in a row
	     fill it; five blocks stacked occupy one fifth of it. -->
	<div class="stage">
		<div class="lanes" class:parallel>
			{#each BATCHES as batch (batch)}
				<div class="batch"><span>Batch</span></div>
			{/each}
		</div>

		<span class="gain">&asymp;5x throughput</span>
	</div>

	<ul class="notes">
		{#each notes as note (note)}
			<li class="note">{note}</li>
		{/each}
	</ul>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.35rem, 3.5vh, 2.25rem);
	}

	.company {
		margin: 0 0 0.4rem;
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

	.state {
		margin: 0.4rem 0 0;
		font-size: var(--deck-subtitle);
		opacity: 0.6;
	}

	/* Fixed height, sized for the stacked state, so the slide cannot grow when
	   the row becomes a column. */
	.stage {
		position: relative;
		width: 100%;
		height: clamp(11rem, 25vh, 14rem);
	}

	.lanes {
		display: flex;
		flex-direction: row;
		gap: 0.5rem;
		width: 100%;
	}

	.lanes.parallel {
		flex-direction: column;
	}

	.batch {
		flex: 1;
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, currentColor 9%, transparent);
		height: clamp(1.9rem, 4.2vh, 2.4rem);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--deck-meta);
	}

	/* One fifth of the track — the same fraction of time five parallel batches
	   take against five sequential ones. */
	.lanes.parallel .batch {
		flex: none;
		width: calc(20% - 0.4rem);
	}

	/* Absolutely positioned so revealing it cannot shift the blocks. It sits in
	   the stretch of track the sequential run used to fill. */
	.gain {
		position: absolute;
		left: 26%;
		top: 50%;
		transform: translateY(-50%);
		font-size: var(--deck-heading);
		font-weight: 600;
		opacity: 0;
		visibility: hidden;
	}

	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: var(--deck-body);
		opacity: 0.85;
	}

	.note {
		padding-left: 1rem;
		position: relative;
		visibility: hidden;
		opacity: 0;
	}

	.note::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.62em;
		width: 0.4rem;
		height: 1px;
		background: currentColor;
		opacity: 0.5;
	}

	@media (max-width: 760px) {
		.lanes.parallel .batch {
			width: 40%;
		}

		.gain {
			left: 46%;
		}
	}
</style>
