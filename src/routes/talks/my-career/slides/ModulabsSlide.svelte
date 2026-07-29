<!--
  S2 — MODULABS, 2021–2023 (1:00)

  One question: what did this codebase look like before, and after.

  THREE CHANGES, ONE ADVANCE (restructured 2026-07-29 at Brandon's call). The
  gateway HOC used to own the whole slide, with the TypeScript migration and AUI
  demoted to text bullets underneath. Both of those are structural changes of the
  same weight, so all three now get equal visual treatment and swap together on a
  single advance. Same pattern InfrastructureSlide uses for its four beats.

  Control — three products each shipped their own user state and routing; a
  higher-order component took that layer over. Every product kept its own layout,
  so what converged was CONTROL, not appearance. This is a FRONTEND composition
  layer, not a backend gateway; getting that wrong in the room invites a question
  with an awkward correction.

  Codebase — class-component JavaScript to TypeScript with functional components.
  The chips carry it as one migration sweeping left to right, which is why the
  stagger exists: a simultaneous swap would read as a rewrite rather than a
  migration.

  Components — per-team UI converging into AUI, the internal Storybook design
  system. Scattered units settle into alignment inside a frame that appears
  around them.

  NO FLIP, NO DOM SWAP for anything animated. Every animated element is in the
  DOM from first paint and moves only via autoAlpha and transform, so nothing
  depends on layout measurement and print mode cannot catch a half-built state.
  The captions are the only thing that swap text, exactly as the old `.state`
  line did.

  DROPPED FROM THE SLIDE 2026-07-29: the JupyterLab-fork TypeScript refactor. It
  is a fourth item that does not fit a three-change frame, and it is the smallest
  of the four. Still verified in facts.md § MODULABS and fair game in Q&A.

  Every claim here has a verified row in facts.md § MODULABS.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';
	import SlideVideo from '$lib/components/deck/SlideVideo.svelte';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// All three call the same AIFFEL APIs. What was shared was never the UI — it
	// was user state and routing, which is why the answer was a HOC and not a
	// component library. (The component library is the third row.)
	const markets = ['B2G', 'B2B', 'B2C'];

	// Five is enough to read as "a codebase" without becoming a count the audience
	// tries to interpret.
	const files = [0, 1, 2, 3, 4];

	// Fixed offsets, never random: print mode and a re-render must produce the
	// same scatter, or the frozen PDF frame shows a different picture than the
	// one that was rehearsed.
	const SCATTER = [
		{ x: -13, y: 7, r: -5 },
		{ x: 10, y: -6, r: 4 },
		{ x: -5, y: 9, r: 6 },
		{ x: 15, y: -4, r: -3 },
		{ x: -11, y: -8, r: 5 },
		{ x: 6, y: 6, r: -6 },
		{ x: -8, y: -3, r: 3 },
	];

	let root = $state<HTMLElement>();
	let unified = $state(false);
	let ready = $state(false);
	let applied = -1;

	// Held while the three changes run, so only one thing on screen moves.
	let videoPaused = $state(false);

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			// Step-0 state, set once. Everything below is already rendered — these
			// only position it, so re-entering step 0 restores rather than rebuilds.
			gsap.set(root.querySelector('.bar-span'), {
				autoAlpha: 0,
				scaleX: 0.3,
				transformOrigin: 'left center',
			});
			gsap.set(root.querySelectorAll('.lang-after'), { autoAlpha: 0 });
			gsap.set(root.querySelector('.frame'), { autoAlpha: 0 });
			gsap.set(root.querySelectorAll('.unit'), {
				x: (i: number) => SCATTER[i].x,
				y: (i: number) => SCATTER[i].y,
				rotate: (i: number) => SCATTER[i].r,
			});
			// Only now is it safe to show them — see the `.units` rule.
			gsap.set(root.querySelector('.units'), { opacity: 1 });
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
		const { gsap } = await loadGsap();
		await tick();
		if (!root) return;

		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = target >= 1;

		unified = want;

		if (!still) {
			videoPaused = true;
			setTimeout(() => (videoPaused = false), 1250);
		}

		// One timeline, three segments, lightly overlapped. Sequenced rather than
		// simultaneous so the eye is led through them in the order they are
		// narrated; simultaneous would be a flash, not three changes.
		const timeline = gsap.timeline();

		// 1 — Control. Three per-product bars give way to one span. The span grows
		// into the width they occupied, so the reduction reads as one motion.
		timeline.to(
			root.querySelectorAll('.bar-own'),
			{ autoAlpha: want ? 0 : 1, duration: DURATION * d, ease: EASE },
			0,
		);
		timeline.to(
			root.querySelector('.bar-span'),
			{
				autoAlpha: want ? 1 : 0,
				scaleX: want ? 1 : 0.3,
				duration: DURATION * d,
				ease: EASE,
			},
			d ? 0.05 : 0,
		);

		// 2 — Codebase. The stagger IS the claim: a migration moving through the
		// files, not an instantaneous rewrite.
		timeline.to(
			root.querySelectorAll('.lang-before'),
			{ autoAlpha: want ? 0 : 1, duration: DURATION * d, stagger: 0.05 * d, ease: EASE },
			d ? 0.18 : 0,
		);
		timeline.to(
			root.querySelectorAll('.lang-after'),
			{ autoAlpha: want ? 1 : 0, duration: DURATION * d, stagger: 0.05 * d, ease: EASE },
			d ? 0.21 : 0,
		);

		// 3 — Components. Loose units settle into alignment, then the shared frame
		// appears around them. Frame last: the system is the consequence of the
		// convergence, not the cause of it.
		timeline.to(
			root.querySelectorAll('.unit'),
			{
				x: (i: number) => (want ? 0 : SCATTER[i].x),
				y: (i: number) => (want ? 0 : SCATTER[i].y),
				rotate: (i: number) => (want ? 0 : SCATTER[i].r),
				duration: DURATION * d,
				stagger: 0.04 * d,
				ease: EASE,
			},
			d ? 0.36 : 0,
		);
		timeline.to(
			root.querySelector('.frame'),
			{ autoAlpha: want ? 1 : 0, duration: DURATION * d, ease: EASE },
			d ? 0.52 : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MODULABS &middot; 2021&ndash;2023</p>
		<h1>Three fixes, none of them a feature</h1>
	</header>

	<div class="body">
		<div class="changes">
			<!-- 1 — Control -->
			<div class="change">
				<p class="change-label">Control</p>
				<div class="stage">
					<div class="markets">
						{#each markets as market (market)}
							<span class="market">{market}</span>
						{/each}
					</div>
					<div class="bars">
						<!--
							Column set inline, per item. Grid auto-placement REFUSES to
							overlap: an item with a definite row but an auto column, whose
							columns are already taken by the span, gets pushed into implicit
							columns 4-6 rather than stacking — which blows the row sideways
							and is exactly what broke here. Explicitly placed items may share
							cells, which is what the crossfade needs.
						-->
						{#each markets as market, i (market)}
							<span class="bar bar-own" style="grid-column: {i + 1}">state &middot; routing</span>
						{/each}
						<span class="bar bar-span">Gateway HOC &mdash; user state &middot; route control</span>
					</div>
				</div>
				<p class="change-caption">
					{#if unified}
						One HOC owns control. Each product keeps its own layout.
					{:else}
						Three products, three copies of user state and routing.
					{/if}
				</p>
			</div>

			<!-- 2 — Codebase -->
			<div class="change">
				<p class="change-label">Codebase</p>
				<div class="stage">
					<div class="chips">
						{#each files as file (file)}
							<span class="chip">
								<span class="lang lang-before">.js</span>
								<span class="lang lang-after">.ts</span>
							</span>
						{/each}
					</div>
				</div>
				<p class="change-caption">
					{#if unified}
						TypeScript, functional components. Types where the contracts were.
					{:else}
						JavaScript, class components. Contracts held in people's heads.
					{/if}
				</p>
			</div>

			<!-- 3 — Components -->
			<div class="change">
				<p class="change-label">Components</p>
				<div class="stage">
					<div class="system">
						<div class="frame" aria-hidden="true"></div>
						<div class="units">
							<!-- Iterating SCATTER only to get its length; the offsets are
							     applied by GSAP, not by markup. Underscore prefix is what the
							     lint rule wants for a deliberately unused binding. -->
							{#each SCATTER as _offset, i (i)}
								<span class="unit"></span>
							{/each}
						</div>
					</div>
				</div>
				<p class="change-caption">
					{#if unified}
						AUI &mdash; one Storybook design system, used across product teams.
					{:else}
						The same components, rebuilt slightly differently in each product.
					{/if}
				</p>
			</div>
		</div>

		<!--
			The three market labels are abstractions until the audience sees one of
			the products. This is what "B2G, B2B and B2C" actually shipped as.
		-->
		<figure class="media">
			<SlideVideo
				src="/talks/my-career/modulabs"
				label="The AIFFEL learning platform: a Python lesson with runnable code blocks"
				paused={videoPaused}
			/>
			<figcaption>AIFFEL &mdash; one of the three products</figcaption>
		</figure>
	</div>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.1rem, 3vh, 1.9rem);
	}

	/* Company eyebrow above the title: the audience always knows which chapter
	   they are in without the title having to carry the company name. */
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

	/* Explanation left, evidence right. The recording is deliberately the
	   smaller element — it supports the claims, it is not the point. */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) clamp(11rem, 18vw, 16rem);
		gap: clamp(1.25rem, 3vw, 2.5rem);
		align-items: start;
	}

	.changes {
		display: flex;
		flex-direction: column;
		gap: clamp(0.9rem, 2.4vh, 1.6rem);
		min-width: 0;
	}

	.change {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.change-label {
		margin: 0;
		font-size: var(--deck-meta);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.45;
	}

	/* Fixed-height stage per row, so a caption changing length can never move the
	   visual and the three rows stay put across the advance. */
	.stage {
		min-height: 3.4rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.3rem;
	}

	.change-caption {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.7;
		/* Reserves two lines at the narrowest width the deck supports. */
		min-height: 1.5em;
	}

	/* --- 1. Control ------------------------------------------------------- */

	.markets,
	.bars {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
		max-width: 34rem;
	}

	.market {
		font-size: var(--deck-meta);
		font-weight: 600;
		letter-spacing: 0.06em;
		opacity: 0.75;
	}

	.bar {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 5px;
		background: color-mix(in srgb, currentColor 4%, transparent);
		padding: 0.4rem 0.6rem;
		font-size: var(--deck-meta);
		opacity: 0.85;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		/* Both states occupy the same grid cell so the swap is a crossfade in
		   place, with no reflow between them. */
		grid-row: 1;
	}

	.bar-own {
		border-style: dashed;
	}

	/* Hidden in CSS as well as by the onMount set: onMount runs after the first
	   paint, so without this the after-state flashes before step 0 is applied.
	   Same convention every two-step slide in this deck follows. */
	.bar-span {
		grid-column: 1 / -1;
		background: color-mix(in srgb, currentColor 9%, transparent);
		font-weight: 600;
		opacity: 0;
	}

	/* --- 2. Codebase ------------------------------------------------------ */

	.chips {
		display: flex;
		gap: 0.4rem;
	}

	.chip {
		position: relative;
		width: 3.1rem;
		height: 1.9rem;
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 5px;
		background: color-mix(in srgb, currentColor 4%, transparent);
	}

	/* Stacked, not swapped: both labels exist from first paint, which is what
	   lets the crossfade run without a DOM change mid-advance. */
	.lang {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: var(--deck-meta);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.lang-after {
		opacity: 0;
	}

	/* --- 3. Components ---------------------------------------------------- */

	.system {
		position: relative;
		width: fit-content;
		padding: 0.55rem 0.7rem;
	}

	.frame {
		position: absolute;
		inset: 0;
		border: 1px solid color-mix(in srgb, currentColor 32%, transparent);
		border-radius: 7px;
		background: color-mix(in srgb, currentColor 6%, transparent);
		opacity: 0;
	}

	/* The units are visible in BOTH states, so they cannot be hidden the way the
	   after-state elements are — but they must not paint aligned before onMount
	   scatters them, or the first frame shows the answer. Hidden here, revealed
	   by onMount once the offsets are on. */
	.units {
		position: relative;
		display: flex;
		gap: 0.45rem;
		opacity: 0;
	}

	.unit {
		width: 1.5rem;
		height: 1.5rem;
		border: 1px solid color-mix(in srgb, currentColor 34%, transparent);
		border-radius: 4px;
		background: color-mix(in srgb, currentColor 7%, transparent);
	}

	.media {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.media figcaption {
		font-size: var(--deck-meta);
		opacity: 0.5;
	}

	@media (max-width: 760px) {
		.body {
			grid-template-columns: 1fr;
		}

		.media {
			order: 2;
			max-width: 15rem;
		}

		/* Three products stop being readable as three columns well before the
		   deck's minimum width; the bar text is the part that carries the row.
		   Two of the three identical per-product bars go with them — three copies
		   of one string stacked in a single cell reads as one bar anyway, so show
		   one and keep the crossfade honest. */
		.markets {
			display: none;
		}

		.bars {
			grid-template-columns: 1fr;
		}

		.bars > :nth-child(2),
		.bars > :nth-child(3) {
			display: none;
		}
	}
</style>
