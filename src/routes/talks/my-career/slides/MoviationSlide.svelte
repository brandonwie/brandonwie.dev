<!--
  S3 — Moviation, 2023 (0:45)

  One question: what was delivered, and what was built to deliver it faster.

  Step 1 is the product and its shape — a Next.js app inside a Flutter shell,
  with the bridge between them called out because that is the part I owned.
  Step 2 is the tooling instinct: the repetitive parts of every page became
  generated artifacts rather than hand-written ones.

  THE THREE ROWS ARE ONE STORY, NOT THREE TOOLS (Brandon, 2026-07-29). Colors
  were re-edited by hand whenever they changed; translations were consumed as
  raw JSON with no type guarantee; every form component was exported and
  imported individually. All three are the same failure — an artifact a human
  maintains by hand — and all three were answered the same way, by generating
  them at build time. The `from` column therefore carries the manual work rather
  than the artifact's name, because the pain is what makes this read as a
  decision instead of a tool list.

  Every claim here has a verified row in facts.md § Moviation.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';
	import SlideVideo from '$lib/components/deck/SlideVideo.svelte';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// The `from` column is the manual work, not the artifact's name. An earlier
	// version listed "Design tokens (JSON)" and "Translation strings", which named
	// the inputs and hid the point: all three were hand-maintained, and two of
	// them had no type guarantee at all. The pain is what makes the automation
	// read as a decision rather than a tool list.
	const generated = [
		{ from: 'Colors, edited by hand', to: 'Design tokens generated as typed TypeScript' },
		{ from: 'Strings, untyped JSON', to: 'Translations generated as typed accessors' },
		{ from: 'Forms, wired one by one', to: 'One declarative form builder' },
	];

	// Funding rounds stay off the slides by choice: they are the company's
	// achievement, not the engineer's, and citing them reads as borrowed credit.
	// The SITA liaison work stands on its own.
	const notes = [
		'Roughly 5x faster typical page development',
		'Primary technical liaison for SITA API integrations',
	];

	let root = $state<HTMLElement>();
	let tooling = $state(false);
	let ready = $state(false);
	let applied = -1;

	// Held while a step animation runs, so the recording is not moving at the
	// same time as the pipeline rows arrive.
	let videoPaused = $state(false);

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			gsap.set(root.querySelectorAll('.pipe'), { autoAlpha: 0, y: 10 });
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

		tooling = want;
		await tick();

		// One thing moves at a time: hold the recording while the rows arrive.
		if (!still) {
			videoPaused = true;
			setTimeout(() => (videoPaused = false), (DURATION + 0.3) * 1000);
		}

		gsap.to(root.querySelectorAll('.pipe'), {
			autoAlpha: want ? 1 : 0,
			y: want ? 0 : 10,
			duration: DURATION * d,
			stagger: 0.08 * d,
			ease: EASE,
		});

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: target >= 1 ? 1 : 0,
			y: target >= 1 ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: target >= 1 ? (DURATION + 0.25) * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">Moviation</p>
		<!-- "Korea's first" is on the submitted CV and is defensible, but it is
		     dropped here by choice: the work stands without the superlative. -->
		<h1>UAM reservation platform</h1>
		<p class="state">
			{#if tooling}
				Hand-maintained artifacts, generated at build time instead
			{:else}
				A Next.js web app delivered inside a Flutter WebView shell
			{/if}
		</p>
	</header>

	<!--
		Recording and diagram are complementary, not redundant: the video proves it
		shipped and shows what it does, while the diagram shows the one thing the
		video cannot — that this UI is a web app running inside a native shell.
	-->
	<div class="body">
		<figure class="media">
			<SlideVideo
				src="/talks/my-career/moviation"
				label="VONAER reservation flow: searching a departure point, picking it on the map, then choosing an arrival point"
				paused={videoPaused}
			/>
			<figcaption>VONAER — booking a seat</figcaption>
		</figure>

		<div class="detail">
			<div class="shell">
				<span class="shell-label">Flutter shell</span>
				<div class="inner">
					<span class="box-title">Next.js web app</span>
				</div>
				<span class="bridge">
					JavaScript channel — the native&ndash;web bridge, owned end to end
				</span>
			</div>

			<!--
				Always rendered, only revealed. Inserting these rows at step 2 re-flowed
				a vertically-centred slide and shoved everything above them up the
				screen — the title and the diagram moved when neither had changed.
			-->
			<div class="pipeline">
				{#each generated as row (row.from)}
					<div class="pipe">
						<span class="from">{row.from}</span>
						<span class="arrow" aria-hidden="true">&rarr;</span>
						<span class="to">{row.to}</span>
					</div>
				{/each}
			</div>

			<ul class="notes">
				{#each notes as note (note)}
					<li class="note">{note}</li>
				{/each}
			</ul>
		</div>
	</div>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.35rem, 3.5vh, 2.25rem);
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

	.state {
		margin: 0.4rem 0 0;
		font-size: var(--deck-subtitle);
		opacity: 0.6;
	}

	/* Recording left, explanation right. The phone is 1:2, so it costs little
	   width and reads instantly as mobile. */
	.body {
		display: grid;
		grid-template-columns: clamp(9rem, 15vw, 13rem) minmax(0, 1fr);
		gap: clamp(1.25rem, 3vw, 2.5rem);
		align-items: start;
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

	.detail {
		display: flex;
		flex-direction: column;
		gap: clamp(1rem, 2.5vh, 1.75rem);
		min-width: 0;
	}

	/* Nesting carries the architecture: the web app literally sits inside the
	   shell, so the diagram is the sentence. */
	.shell {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 8px;
		padding: clamp(0.75rem, 2vw, 1.25rem);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
		max-width: 46rem;
	}

	.shell-label {
		font-size: var(--deck-meta);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.55;
	}

	.inner {
		border: 1px dashed color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		padding: clamp(0.6rem, 1.6vw, 1rem);
		background: color-mix(in srgb, currentColor 8%, transparent);
	}

	.box-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.bridge {
		font-size: var(--deck-meta);
		opacity: 0.7;
	}

	.pipeline {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		/* Capped so the source column cannot stretch across the full slide and
		   strand the arrow halfway to the output it points at. */
		max-width: 62rem;
	}

	/* Hidden in CSS as well as GSAP: onMount runs after first paint, so a
	   JS-only resting state flashes these rows on entry. */
	.pipe {
		display: grid;
		grid-template-columns: clamp(11rem, 21vw, 17rem) auto minmax(0, 1fr);
		align-items: baseline;
		gap: clamp(0.5rem, 1.5vw, 1.25rem);
		font-size: var(--deck-body);
		visibility: hidden;
		opacity: 0;
	}

	.from {
		opacity: 0.6;
	}

	.arrow {
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
		.body {
			grid-template-columns: 1fr;
		}

		/* The recording drops below the explanation on a phone — the words matter
		   more than the proof when there is only one column to spend. */
		.media {
			order: 2;
			max-width: 11rem;
		}

		.pipe {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}

		.arrow {
			display: none;
		}
	}
</style>
