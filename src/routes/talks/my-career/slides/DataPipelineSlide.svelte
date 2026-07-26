<!--
  S11 — Data pipeline (0:45) · cut-1

  The hero beat is CADENCE, because it is the one change on this slide that a
  picture can carry without explanation: one pull a day becomes a pull every
  two hours. Everything else the pipeline work involved — the production move,
  the monorepo, the Parquet layout, the search-sync — rides in the notes.

  TYPESENSE ONLY. facts.md § Do not say is explicit: search-sync against
  Postgres, and NOTHING about pgvector, embeddings, or RAG under MOBA. RAG
  depth belongs to Crucio, a separate project. The note here deliberately omits
  "behind the AI feature" as well — true, but it invites a RAG question this
  slide has no business answering.

  The twelve tick marks are fixed in place from the first render; step 1 simply
  hides eleven of them. Laying them out on advance would slide the first tick
  as the row re-spaced, and the first tick is the one thing that did not
  change.

  PUBLISH-SAFE: named managed services and a schedule, both already on the
  submitted CV. No bucket names, no DAG contents, no schemas. Keep it that way
  — the repo this lives in is public.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Twelve runs a day is the two-hourly cadence, drawn literally.
	const TICKS = Array.from({ length: 12 }, (_, i) => i);

	const notes = [
		'Amplitude to Airflow to S3 as Parquet, partitioned on event time, with completeness checks',
		'Each run re-pulls a four-to-two-day window, so late-arriving events are not missed',
		'Three repos — Airflow, ETL, events — consolidated into a monorepo with shared Python contracts',
		'A Typesense search-sync service kept continuously in step with Postgres',
	];

	let root = $state<HTMLElement>();
	let frequent = $state(false);
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
			gsap.set(root.querySelectorAll('.tick.extra'), { autoAlpha: 0 });
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

		frequent = want;
		await tick();

		// Left to right, so the day fills up rather than the marks all blinking on
		// at once. The first tick is untouched — it was already there.
		gsap.to(root.querySelectorAll('.tick.extra'), {
			autoAlpha: want ? 1 : 0,
			duration: DURATION * 0.7 * d,
			stagger: 0.045 * d,
			ease: EASE,
		});

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: want ? 1 : 0,
			y: want ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: want ? DURATION * 1.2 * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA</p>
		<h1>Moving the pipeline into production</h1>
		<p class="state">
			{#if frequent}
				After &mdash; Terraform-managed Airflow on AWS, shipped by GitHub Actions
			{:else}
				Before &mdash; a prototype that ran locally, by hand
			{/if}
		</p>
	</header>

	<div class="strip">
		<span class="strip-label">One day</span>

		<!-- All twelve ticks are laid out from the first render; step 1 hides
		     eleven. Nothing re-spaces on advance. -->
		<div class="track">
			{#each TICKS as t (t)}
				<span class="tick" class:extra={t > 0}></span>
			{/each}
		</div>

		<p class="cadence">
			{#if frequent}
				A run every two hours
			{:else}
				One run a day
			{/if}
		</p>
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

	.strip {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.strip-label {
		font-size: var(--deck-meta);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	.track {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		height: clamp(2.25rem, 5vh, 3rem);
		border-bottom: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		padding: 0 1px;
	}

	.tick {
		width: 2px;
		height: 65%;
		background: currentColor;
		opacity: 0.75;
	}

	.extra {
		visibility: hidden;
		opacity: 0;
	}

	/* Fixed height so the longer caption cannot add a line and push the notes. */
	.cadence {
		margin: 0;
		font-size: var(--deck-heading);
		font-weight: 600;
		min-height: 1.6em;
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
</style>
