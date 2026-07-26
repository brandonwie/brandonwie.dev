<!--
  S1 — The arc (0:45)

  The spine of the talk: four companies, one direction. Drawn once so no later
  slide feels like a detour.

  Motion carries exactly two facts: the timeline is continuous (the line draws
  left to right), and each stop added a capability (labels appear beneath).
  Nothing else moves.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const stops = [
		{ company: 'MODULABS', years: '2021 – 2023', gained: 'Frontend web' },
		{ company: 'Moviation', years: '2023', gained: 'Frontend web & mobile' },
		{ company: 'Playtag', years: '2023 – 2025', gained: 'Full-stack' },
		{ company: 'MOBA', years: '2025 – now', gained: 'Backend · Infra' },
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1; // plain variable: tracks the last rendered step without re-triggering effects

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		// Resting state before anything is revealed.
		gsap.set(root.querySelector('.rail-line'), { scaleX: 0, transformOrigin: 'left center' });
		gsap.set(root.querySelectorAll('.stop'), { autoAlpha: 0, y: 8 });
		gsap.set(root.querySelectorAll('.gained'), { autoAlpha: 0, y: 6 });

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

		const timeline = gsap.timeline();

		timeline.to(root.querySelector('.rail-line'), {
			scaleX: 1,
			duration: 0.6 * d,
			ease: EASE,
		});

		timeline.to(
			root.querySelectorAll('.stop'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.08 * d, ease: EASE },
			d ? '-=0.25' : 0,
		);

		// Step 1 reveals what each stop added. Kept separate so the presenter can
		// say the four company names before the capability claim lands.
		timeline.to(
			root.querySelectorAll('.gained'),
			{
				autoAlpha: target >= 1 ? 1 : 0,
				y: target >= 1 ? 0 : 6,
				duration: DURATION * d,
				stagger: 0.06 * d,
				ease: EASE,
			},
			d ? '-=0.2' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<h1>Four companies, one direction</h1>

	<!--
		The rail is CSS, not SVG. An SVG viewBox cannot track a CSS grid's gaps
		across breakpoints, so the dots drifted away from the labels they mark.
		Anchoring each dot inside its own grid cell keeps them aligned at every
		width for free.
	-->
	<div class="rail">
		<div class="rail-line" aria-hidden="true"></div>

		<ol class="stops">
			{#each stops as stop (stop.company)}
				<li class="stop">
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
		max-width: 72rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.5rem, 4vh, 3rem);
	}

	h1 {
		font-size: clamp(1.5rem, 4vw, 2.75rem);
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

	.stops {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
	}

	.stop {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.company {
		font-size: clamp(0.95rem, 1.8vw, 1.35rem);
		font-weight: 600;
	}

	.years {
		font-size: clamp(0.7rem, 1.2vw, 0.85rem);
		opacity: 0.55;
		font-variant-numeric: tabular-nums;
	}

	/* Same reason as the notes on the sync slide: onMount runs after first paint,
	   so a JS-only resting state flashes step 2's text during step 1. */
	.gained {
		margin-top: 0.35rem;
		font-size: clamp(0.75rem, 1.3vw, 0.95rem);
		border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		padding-top: 0.35rem;
		visibility: hidden;
		opacity: 0;
	}

	/* Narrow screens: the rail stops being a timeline and becomes a list. Dropping
	   the line and dots is deliberate — a 4-stop horizontal axis wrapped onto two
	   rows reads as broken, and readability outranks the visual. */
	@media (max-width: 640px) {
		.rail {
			padding-top: 0;
		}

		.rail-line,
		.dot {
			display: none;
		}

		.stops {
			grid-template-columns: 1fr 1fr;
			gap: 1.25rem;
		}
	}
</style>
