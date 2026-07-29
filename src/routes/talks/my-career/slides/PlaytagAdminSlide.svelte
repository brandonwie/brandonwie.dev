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

	// Two flows, same shape: something arrives, an operator used to do the work
	// by hand, the result ships. Only the middle stage changes on advance.
	const flows = [
		{
			id: 'photos',
			input: 'Photo captured',
			before: { title: 'Manual cropping', note: 'in Figma, one photo at a time' },
			// Short enough not to wrap, and it reads as a direct swap for the line
			// above it: manual cropping becomes automatic cropping.
			after: { title: 'Automatic cropping', note: 'TensorFlow.js face detection' },
			// The tool RETURNS cropped files — it does not upload or publish them.
			// An earlier draft said "Published to parents", which invented a delivery
			// step that never existed (facts.md, 2026-07-26).
			output: 'Cropped images returned',
		},
		{
			id: 'roster',
			input: 'Class roster',
			before: { title: 'Entered one by one', note: 'in the admin CMS' },
			after: { title: 'One spreadsheet upload', note: 'a whole class in a single file' },
			output: 'Teachers and children registered',
		},
	];

	const notes = [
		'Admin CMS on React and Vite; customer-facing web on Next.js',
		'Built the prototype of the StoryLine teachers app',
		'Added observability with Sentry logging',
		'Led the migration from GitLab to GitHub',
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

			const swapped = root.querySelectorAll('.stage-swap');
			if (swapped.length && !still) {
				gsap.fromTo(
					swapped,
					{ autoAlpha: 0, scale: 0.94 },
					{ autoAlpha: 1, scale: 1, duration: DURATION, stagger: 0.08, ease: EASE },
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
		<p class="company">Playtag &middot; 2023 &ndash; 2025</p>
		<!--
			NOT "The admin tool operators ran the day on" — descriptive, and its
			definite article assumed the room already knew which tool. It also
			repeated "operators" from the line directly beneath it.

			The `.state` line is gone with it. Every clause in it restated a box in
			the pipeline below — "face detection in the browser" against "Automatic
			cropping / TensorFlow.js face detection", "a whole class in one upload"
			against "One spreadsheet upload", and so on. It was scaffolding, not a
			claim, so nothing in the ledger goes with it.
		-->
		<h1>Removed the step, not sped it up</h1>
	</header>

	<!-- Both flows keep the same three stages; only the middle one changes. The
	     input arrives and the result ships either way — what changed is who does
	     the work in between. -->
	<div class="flows">
		{#each flows as flow (flow.id)}
			<div class="pipeline">
				<div class="stage"><span class="stage-title">{flow.input}</span></div>

				<span class="arrow" aria-hidden="true">&rarr;</span>

				{#if automated}
					<div class="stage stage-swap is-auto">
						<span class="stage-title">{flow.after.title}</span>
						<span class="stage-note">{flow.after.note}</span>
					</div>
				{:else}
					<div class="stage stage-swap">
						<span class="stage-title">{flow.before.title}</span>
						<span class="stage-note">{flow.before.note}</span>
					</div>
				{/if}

				<span class="arrow" aria-hidden="true">&rarr;</span>

				<div class="stage"><span class="stage-title">{flow.output}</span></div>
			</div>
		{/each}
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

	/* One grid for both flows. `display: contents` on each row lets the two
	   pipelines share a single column template, so the middle stages and the
	   output stages line up vertically instead of each row sizing itself. */
	.flows {
		display: grid;
		grid-template-columns: auto auto auto auto auto;
		justify-content: start;
		align-items: stretch;
		column-gap: clamp(0.6rem, 1.8vw, 1.5rem);
		row-gap: clamp(0.6rem, 1.6vh, 1rem);
	}

	.pipeline {
		display: contents;
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

	/* Fixed width AND a reserved height. Without the width the box grows when its
	   label changes and shoves "Published to parents" sideways; without the
	   height the longer label wraps to an extra line, the row grows, and a
	   vertically-centred slide pushes the title up. Both are the same rule: a
	   stage that did not change has no business moving. */
	.stage-swap {
		width: clamp(14rem, 26vw, 25rem);
		min-height: clamp(6.5rem, 13vh, 8rem);
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
