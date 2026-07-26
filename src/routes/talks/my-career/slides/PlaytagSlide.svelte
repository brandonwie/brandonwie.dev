<!--
  S4 — Playtag, 2023–2025 (0:45)

  DELIBERATELY THE SHORTEST COMPANY SLIDE. This audience worked with Brandon
  here, so depth spends stage time proving something they already believe, and
  any wording above what they remember reads as overclaiming. The section is a
  credibility anchor, not a proof.

  The one beat that earns its animation is the TensorFlow.js auto-crop: it is
  computer vision shipped into a real operator workflow on childcare imagery,
  which is the closest prior art in the whole deck to what mono does.

  Every line is at CV wording. See facts.md § Playtag, and note C3 in
  particular: do NOT claim ownership of the Spring repository or service
  layers, or that the migration removed the yearly class-data reset.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const notes = [
		'Core maintainer of the NestJS backend; supported the migration to Kotlin and Spring Boot',
		'Contributed to redesigning the schema for grade and class transitions, with full history preserved',
		'Customer-facing web on Next.js; admin CMS on React and Vite',
		'Infrastructure automation, EFK logging, CI/CD',
	];

	let root = $state<HTMLElement>();
	let automated = $state(false);
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

		if (want !== automated) {
			automated = want;
			await tick();

			const stage = root.querySelector('.stage-swap');
			if (stage && !still) {
				gsap.fromTo(
					stage,
					{ autoAlpha: 0, scale: 0.94 },
					{ autoAlpha: 1, scale: 1, duration: DURATION, ease: EASE },
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
		<p class="company">Playtag</p>
		<h1>Computer vision in the operator workflow</h1>
		<p class="state">
			{#if automated}
				After — TensorFlow.js face detection and auto-cropping
			{:else}
				Before — every photo cropped by hand
			{/if}
		</p>
	</header>

	<!-- Three stages, only the middle one changes. The photo arrives and the
	     photo publishes either way; what changed is who does the work. -->
	<div class="pipeline">
		<div class="stage"><span class="stage-title">Photo captured</span></div>

		<span class="arrow" aria-hidden="true">&rarr;</span>

		{#if automated}
			<div class="stage stage-swap is-auto">
				<span class="stage-title">Face detection · auto-crop</span>
				<span class="stage-note">TensorFlow.js, in the browser</span>
			</div>
		{:else}
			<div class="stage stage-swap">
				<span class="stage-title">Manual cropping</span>
				<span class="stage-note">one photo at a time</span>
			</div>
		{/if}

		<span class="arrow" aria-hidden="true">&rarr;</span>

		<div class="stage"><span class="stage-title">Published to parents</span></div>
	</div>

	<ul class="notes">
		{#each notes as note (note)}
			<li class="note">{note}</li>
		{/each}
	</ul>

	<!-- Their own award, so stating it is recall rather than a claim. Kept
	     small and factual for exactly that reason. -->
	<p class="award">Superman Award, H1 2024 — sole company-wide recipient</p>
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

	.pipeline {
		display: flex;
		align-items: stretch;
		gap: clamp(0.6rem, 1.8vw, 1.5rem);
		flex-wrap: wrap;
	}

	.stage {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		padding: clamp(0.6rem, 1.5vw, 1rem) clamp(0.75rem, 2vw, 1.25rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
		/* Both middle states occupy the same box, so the row does not resize
		   when the work moves from the operator to the model. */
		min-width: clamp(10rem, 18vw, 15rem);
	}

	/* Fixed width, sized for the longer of the two labels. Without it the box
	   grows when the label changes and shoves "Published to parents" sideways —
	   a stage that did not change has no business moving. */
	.stage-swap {
		width: clamp(13rem, 24vw, 20rem);
	}

	.is-auto {
		background: color-mix(in srgb, currentColor 9%, transparent);
	}

	.stage-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.stage-note {
		font-size: var(--deck-meta);
		opacity: 0.55;
	}

	.arrow {
		align-self: center;
		font-size: var(--deck-body);
		opacity: 0.45;
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

	.award {
		margin: 0;
		font-size: var(--deck-meta);
		letter-spacing: 0.04em;
		opacity: 0.55;
	}

	@media (max-width: 760px) {
		.pipeline {
			flex-direction: column;
			align-items: stretch;
		}

		.arrow {
			display: none;
		}
	}
</style>
