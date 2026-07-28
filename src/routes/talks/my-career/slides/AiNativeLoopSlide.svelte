<!--
  S12 — 3B, the AI-native loop (1:00) · never cut

  Maps directly to Sarah's scope item #2, "스토리라인 제품 내 AI narrative
  (prompt engineering)". This is the slide that answers it, so it has to read
  as a system rather than as enthusiasm for a tool.

  THE POINT IS THE GATES, NOT THE AUTOMATION. Six stages run as a loop; three
  of them stay human. That is the claim worth making in a room that has to
  trust the output — anyone can show a pipeline of agents, and a pipeline of
  agents with nobody in it is the thing engineers are actually worried about.
  Step 1 lands the gates.

  NO PULSE. The storyboard wanted the loop to "pulse at the current stage",
  which needs the presenter to drive a cursor through six positions — that is
  six states, and DeckSlide.steps is 1 | 2 by type. Dropped deliberately, not
  forgotten. The return bracket carries the loop reading on its own.

  CSS, NOT SVG, for the return path — same reason ArcSlide gives for its rail:
  an SVG viewBox cannot track a CSS grid's gaps across breakpoints without
  either drifting off the cards or distorting the stroke under
  preserveAspectRatio="none".

  Claude since June 2025 with Opus 4 — facts.md C5. NOT April 2025;
  interview-facts.md and the LinkedIn About are both stale on this.

  PUBLISH-SAFE: 3B is Brandon's own repo and every stage name here is a repo
  convention, not employer detail. Deliberately no example spec on the slide —
  both good demo candidates are MOBA-internal (facts.md § 3B).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const stages = [
		{ name: 'Spec', detail: 'A human writes the .me.md. Agents never modify it.', human: true },
		{
			name: 'task-starter',
			detail: 'Investigate, scope with the human, issue, branch, plan.',
			human: true,
		},
		{
			name: 'Topology',
			detail: 'Master and reviewer, architect and workers, or a singleton.',
			human: false,
		},
		{ name: 'Review loop', detail: 'A PR that automated review iterates on.', human: false },
		{ name: 'Merge', detail: 'A human reads the diff and merges it.', human: true },
		{
			name: '/wrap',
			detail: 'Learnings become knowledge entries, published behind a privacy gate.',
			human: false,
		},
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelector('.rail-line'), { scaleX: 0, transformOrigin: 'left center' });
		gsap.set(root.querySelectorAll('.stage'), { autoAlpha: 0, y: 8 });
		gsap.set(root.querySelector('.ret-down'), { scaleY: 0, transformOrigin: 'top center' });
		gsap.set(root.querySelector('.ret-across'), { scaleX: 0, transformOrigin: 'right center' });
		gsap.set(root.querySelector('.ret-up'), { scaleY: 0, transformOrigin: 'bottom center' });
		gsap.set(root.querySelector('.ret-head'), { autoAlpha: 0 });
		gsap.set(root.querySelectorAll('.ret-label, .vendors'), { autoAlpha: 0 });
		gsap.set(root.querySelectorAll('.gate'), { autoAlpha: 0, y: 4 });
		gsap.set(root.querySelector('.gate-note'), { autoAlpha: 0, y: 6 });

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

		const d = !animate || reducedMotion() ? 0 : 1;
		const want = target >= 1;

		const timeline = gsap.timeline();

		// Step 0 draws the loop once. Re-entering step 0 from step 1 must not
		// redraw it, so these all animate to their finished state either way.
		timeline.to(root.querySelector('.rail-line'), { scaleX: 1, duration: 0.6 * d, ease: EASE });

		timeline.to(
			root.querySelectorAll('.stage'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.07 * d, ease: EASE },
			d ? '-=0.3' : 0,
		);

		// The return path, drawn in the direction it flows: down off the last
		// stage, back across, up into the first. This is the whole reason the
		// slide is a loop and not a list.
		timeline.to(
			root.querySelector('.ret-down'),
			{ scaleY: 1, duration: 0.18 * d, ease: EASE },
			d ? '-=0.1' : 0,
		);
		timeline.to(root.querySelector('.ret-across'), { scaleX: 1, duration: 0.45 * d, ease: EASE });
		timeline.to(root.querySelector('.ret-up'), { scaleY: 1, duration: 0.18 * d, ease: EASE });
		timeline.to(root.querySelector('.ret-head'), { autoAlpha: 1, duration: 0.2 * d, ease: EASE });
		// The loop caption and the vendor-span line arrive together, both in step 0.
		// Deliberately NOT a fan diagram: a fan shows today's topology and cannot
		// show a sequence, and the brief's ask is temporal ("history of it like how
		// I improved system overtime"). The arc is narrated; this line only states
		// the span. Text also needs no markup, no CSS, and no breakpoint rule in a
		// slide whose grid already collapses 6 -> 3 columns at 900px.
		timeline.to(
			root.querySelectorAll('.ret-label, .vendors'),
			{ autoAlpha: 1, duration: DURATION * d, stagger: 0.06 * d, ease: EASE },
			d ? '-=0.3' : 0,
		);

		// Step 1: the three gates that stay human.
		timeline.to(
			root.querySelectorAll('.gate'),
			{
				autoAlpha: want ? 1 : 0,
				y: want ? 0 : 4,
				duration: DURATION * d,
				stagger: 0.08 * d,
				ease: EASE,
			},
			d ? '-=0.15' : 0,
		);

		timeline.to(
			root.querySelector('.gate-note'),
			{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
			d ? '-=0.25' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">3B &mdash; my own system, in version control</p>
		<h1>Working with agents as a loop, not a prompt</h1>
	</header>

	<div class="chain">
		<div class="rail-line" aria-hidden="true"></div>

		<ol class="stages">
			{#each stages as stage (stage.name)}
				<li class="stage">
					<span class="dot" aria-hidden="true"></span>
					<span class="name">{stage.name}</span>
					<span class="detail">{stage.detail}</span>
					<!-- Rendered for every stage so the row heights are fixed from the
					     first paint; only the gated three ever become visible. -->
					<span class="gate" class:gated={stage.human} aria-hidden={!stage.human}>
						{stage.human ? 'human' : ''}
					</span>
				</li>
			{/each}
		</ol>

		<!-- Return path: last stage back to first. Three CSS segments plus a head,
		     drawn in flow order. -->
		<div class="return" aria-hidden="true">
			<span class="ret-down"></span>
			<span class="ret-across"></span>
			<span class="ret-up"></span>
			<span class="ret-head"></span>
		</div>
	</div>

	<p class="ret-label">
		What <code>/wrap</code> writes is the context the next spec is written against.
	</p>

	<p class="vendors">One propagation layer renders claude / codex / agy / grok.</p>

	<p class="gate-note">Three gates stay human: what to build, what it means, and what ships.</p>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.25rem, 3vh, 2rem);
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

	.chain {
		position: relative;
		padding-top: 1.5rem;
		/* Room underneath for the return bracket, reserved from the first paint so
		   drawing it cannot shift the stage cards. */
		padding-bottom: 3.25rem;
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

	.stages {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 1rem;
	}

	.stage {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
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

	.name {
		font-size: var(--deck-heading);
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.detail {
		font-size: var(--deck-body);
		opacity: 0.75;
	}

	/* Fixed height whether or not the pill shows, so step 1 cannot re-flow the
	   row. Same discipline as every other slide in the deck. */
	.gate {
		margin-top: 0.35rem;
		min-height: 1.5em;
		font-size: var(--deck-meta);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		visibility: hidden;
		opacity: 0;
	}

	.gate.gated {
		align-self: flex-start;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		border-radius: 999px;
		padding: 0.15rem 0.55rem;
	}

	.return {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0.75rem;
		height: 2.25rem;
	}

	.ret-down,
	.ret-up {
		position: absolute;
		width: 1px;
		height: 100%;
		background: currentColor;
		opacity: 0.35;
	}

	.ret-down {
		right: 0;
		top: 0;
	}

	.ret-up {
		left: 0;
		top: 0;
	}

	.ret-across {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1px;
		background: currentColor;
		opacity: 0.35;
	}

	/* Arrowhead pointing back up into the first stage. */
	.ret-head {
		position: absolute;
		left: -3px;
		top: -1px;
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-bottom: 6px solid currentColor;
		opacity: 0.55;
	}

	/* Shared so the vendor-span line needs no rules of its own and no breakpoint
	   of its own. It participates in the existing column flow. */
	.ret-label,
	.vendors {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.6;
		visibility: hidden;
	}

	.ret-label code {
		font-size: 0.95em;
	}

	.gate-note {
		margin: 0;
		font-size: var(--deck-subtitle);
		font-weight: 600;
		min-height: 1.6em;
		visibility: hidden;
	}

	/* Narrow: six columns stop being readable well before the deck's minimum
	   width, and a wrapped bracket reads as broken rather than as a loop. Drop
	   both, keep the stages as an ordered list — same call ArcSlide makes. */
	@media (max-width: 900px) {
		.chain {
			padding-top: 0;
			padding-bottom: 0;
		}

		.rail-line,
		.dot,
		.return {
			display: none;
		}

		.stages {
			grid-template-columns: repeat(3, 1fr);
			gap: 1.25rem;
		}
	}
</style>
