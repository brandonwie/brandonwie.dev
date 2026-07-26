<!--
  S3 — Moviation, 2023 (0:45)

  One question: what was delivered, and what was built to deliver it faster.

  Step 1 is the product and its shape — a Next.js app inside a Flutter shell,
  with the bridge between them called out because that is the part I owned.
  Step 2 is the tooling instinct: the repetitive parts of every page became
  generated artifacts rather than hand-written ones.

  Every claim here has a verified row in facts.md § Moviation.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const generated = [
		{ from: 'Design tokens (JSON)', to: 'Typed TypeScript + colour schemes' },
		{ from: 'Translation strings', to: 'Typed i18n accessors' },
		{ from: 'Form definitions', to: 'Declarative form builder' },
	];

	const notes = [
		'Roughly 5x faster typical page development',
		'Primary technical liaison for SITA API integrations, through a 500 Global round',
	];

	let root = $state<HTMLElement>();
	let tooling = $state(false);
	let ready = $state(false);
	let applied = -1;

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
				And the build-time tooling behind every page
			{:else}
				A Next.js web app delivered inside a Flutter WebView shell
			{/if}
		</p>
	</header>

	<div class="shell">
		<span class="shell-label">Flutter shell</span>
		<div class="inner">
			<span class="box-title">Next.js web app</span>
		</div>
		<span class="bridge">JavaScript channel — the native&ndash;web bridge, owned end to end</span>
	</div>

	<!--
		Always rendered, only revealed. Inserting these rows at step 2 re-flowed a
		vertically-centred slide and shoved everything above them up the screen —
		the title and the diagram moved when neither had changed. Reserving the
		space means the only thing that moves is the thing that changed.
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
		.pipe {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}

		.arrow {
			display: none;
		}
	}
</style>
