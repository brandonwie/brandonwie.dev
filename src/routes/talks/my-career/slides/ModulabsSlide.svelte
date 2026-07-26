<!--
  S2 — MODULABS, 2021–2023 (1:00)

  One question: what did the architecture look like before, and after.

  Three markets each integrated their own way; a gateway module put them behind
  one surface. The convergence is shown by a single box spanning all three rows
  rather than by diagonal lines — same idea, and it survives a projector and a
  narrow screen, which crossing lines do not.

  Every claim here has a verified row in facts.md § MODULABS.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const markets = ['B2G', 'B2B', 'B2C'];

	const notes = [
		'Migrated a class-component JavaScript codebase to TypeScript with functional components',
		'Refactored a JupyterLab module to TypeScript on an internal fork',
		'Led AUI, the internal Storybook design system used across product teams',
	];

	let root = $state<HTMLElement>();
	let unified = $state(false);
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
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
		if (!root) return;

		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = target >= 1;

		if (want !== unified) {
			unified = want;
			await tick();

			// The gateway grows into the space the three adapters occupied, so the
			// reduction is legible as one motion rather than a swap.
			const gateway = root.querySelector('.gateway');
			if (gateway && !still) {
				gsap.fromTo(
					gateway,
					{ autoAlpha: 0, scaleY: 0.72 },
					{ autoAlpha: 1, scaleY: 1, duration: DURATION, ease: EASE, transformOrigin: 'center' },
				);
			}
		}

		await tick();

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: target >= 1 ? 1 : 0,
			y: target >= 1 ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: target >= 1 ? DURATION * 0.6 * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<h1>One surface for three markets</h1>
		<p class="state">
			{#if unified}
				After — a single gateway module, proposed and adopted internally
			{:else}
				Before — B2G, B2B and B2C each integrated their own way
			{/if}
		</p>
	</header>

	<!--
		One grid, not three stacked ones: the market label and its adapter share a
		row, so they stay aligned at any width without hand-tuned heights.
	-->
	<div class="diagram" class:is-unified={unified}>
		{#each markets as market, i (market)}
			<span class="source" style="grid-row: {i + 1}">{market}</span>
		{/each}

		{#if unified}
			<div class="box gateway">
				<span class="box-title">Gateway module</span>
				<span class="box-note">one integration surface</span>
			</div>
		{:else}
			{#each markets as market, i (market)}
				<div class="box adapter" style="grid-row: {i + 1}">
					<span class="box-note">own integration</span>
				</div>
			{/each}
		{/if}

		<div class="box platform"><span class="box-title">AIFFEL platform</span></div>
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

	.diagram {
		display: grid;
		grid-template-columns: auto minmax(0, 26rem) auto;
		grid-template-rows: repeat(3, auto);
		justify-content: start;
		align-items: center;
		row-gap: 0.6rem;
		column-gap: clamp(0.75rem, 2.5vw, 2rem);
	}

	.source {
		grid-column: 1;
		display: flex;
		align-items: center;
		font-size: var(--deck-heading);
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.box {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		padding: clamp(0.6rem, 1.4vw, 1rem) clamp(0.75rem, 2vw, 1.25rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
	}

	.adapter {
		grid-column: 2;
		border-style: dashed;
	}

	/* The gateway spans all three rows. That span IS the point of the slide —
	   one surface where there were three — so it carries the idea without any
	   diagonal lines to draw or explain. */
	.gateway {
		grid-column: 2;
		grid-row: 1 / 4;
		background: color-mix(in srgb, currentColor 9%, transparent);
	}

	.platform {
		grid-column: 3;
		grid-row: 1 / 4;
	}

	.box-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.box-note {
		font-size: var(--deck-meta);
		opacity: 0.55;
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
		.diagram {
			grid-template-columns: auto minmax(0, 1fr);
			column-gap: 0.75rem;
		}

		/* The platform drops below rather than squeezing a third column into a
		   phone width; the row alignment that matters is label-to-adapter. */
		.platform {
			grid-column: 1 / -1;
			grid-row: 4;
			margin-top: 0.5rem;
		}
	}
</style>
