<!--
  S13 — 3B: kill, diagnose, rebuild (0:45) · never cut

  The engineering-maturity beat, and per facts.md the strongest one in the
  deck. It works because the admission comes first: the interesting fact is
  that it was measured and deleted, not that it was rebuilt.

  DELIBERATELY UNDER-DECORATED. The storyboard is explicit — text driven, three
  states, do not over-decorate. Nothing here moves except opacity.

  DO NOT SAY "RAG" ABOUT THE STACK. Only QMD is retrieval-for-generation;
  context-mode, code-review-graph, graphify and serena are not. facts.md § Do
  not say + rag-layer.md Part 4. The slide says "retrieval", never "RAG stack".

  NUMBERS RE-MEASURED 2026-07-28, on the day before the talk, per the standing
  rule in facts.md that no eval number reaches this slide unverified:
    - eval gate    6/7 PASS, p50 96ms, p95 207ms  (gate threshold is 6/7)
    - forced-read  897/1351 = 66.4%               ("two-thirds", stated round)
  Both re-run from a fresh index build. If this slide is shown after
  2026-07-28, re-run `pnpm run retrieve:eval:quick` and
  `node scripts/3b-retrieve.js stats` before trusting either.

  NO CORPUS SIZE ON THIS SLIDE. facts.md and rag-layer.md both recorded 10,930
  docs; the index rebuilt on 2026-07-28 holds 6,582. Both ledgers were corrected
  in the same pass. The count stays off the slide anyway — it is not
  load-bearing for this beat, and a figure that moved by a third inside three
  days is exactly the kind of number not to say out loud in a room that may
  ask how it was measured.

  NO INTERNAL IDENTIFIERS, AND NO ENGINEER SHORTHAND. Corrected 2026-07-29 on
  Brandon's instruction. The two decisions used to be cited as "ADR-005" and
  "ADR-041", which name nothing to anyone outside this repo — the audience
  cannot look them up and the number carries none of the meaning. What those
  references were actually doing was signalling "this was written down, not
  improvised", so the slide now says that in words: deleted it AND wrote down
  why, then rebuilt against that write-up. Same signal, no decoder ring.

  The supporting lines were shell and retrieval jargon for the same reason —
  "exits non-zero", "telemetry", "recall aid merged via RRF", "harness-model
  pairs". All rewritten as plain sentences. The claims are unchanged; only the
  register is. If a line cannot be said out loud to a non-specialist without
  translating it, it does not belong on a slide.

  PUBLISH-SAFE: entirely Brandon's own repo, and both decision records are
  already public in it. Nothing employer-related on this slide.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const beats = [
		{
			state: 'Built',
			line: 'A search layer over the whole knowledge base.',
			late: false,
		},
		{
			state: 'Deleted',
			line: 'Measured it. It delivered nothing. Deleted it, and wrote down why.',
			late: false,
		},
		{
			state: 'Rebuilt',
			line: 'Against that write-up — against the post-mortem, not the disappointment.',
			late: true,
		},
	];

	const guards = [
		'Seven workflows are required to call it, so the read path cannot be skipped',
		'A quality test that blocks the merge whenever results get worse',
		'Two-thirds of searches now happen because the system demands it, not because I remembered',
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelectorAll('.beat'), { autoAlpha: 0, y: 8 });
		gsap.set(root.querySelectorAll('.beat.late'), { autoAlpha: 0 });
		gsap.set(root.querySelector('.diagnosis'), { autoAlpha: 0, y: 6 });
		gsap.set(root.querySelectorAll('.guard'), { autoAlpha: 0, y: 6 });
		gsap.set(root.querySelector('.evidence'), { autoAlpha: 0, y: 6 });

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

		// Built and Deleted are the step-0 pair. The admission lands before the
		// recovery does; that ordering is the whole point of the beat.
		timeline.to(root.querySelectorAll('.beat:not(.late)'), {
			autoAlpha: 1,
			y: 0,
			duration: DURATION * d,
			stagger: 0.12 * d,
			ease: EASE,
		});

		timeline.to(
			root.querySelector('.diagnosis'),
			{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
			d ? '-=0.1' : 0,
		);

		timeline.to(
			root.querySelector('.beat.late'),
			{ autoAlpha: want ? 1 : 0, y: want ? 0 : 8, duration: DURATION * d, ease: EASE },
			d ? '-=0.25' : 0,
		);

		timeline.to(
			root.querySelectorAll('.guard'),
			{
				autoAlpha: want ? 1 : 0,
				y: want ? 0 : 6,
				duration: DURATION * d,
				stagger: 0.07 * d,
				ease: EASE,
			},
			d ? '-=0.2' : 0,
		);

		timeline.to(
			root.querySelector('.evidence'),
			{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
			d ? '-=0.2' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">3B &mdash; retrieval</p>
		<h1>I measured it, deleted it, and rebuilt it</h1>
	</header>

	<ol class="beats">
		{#each beats as beat (beat.state)}
			<li class="beat" class:late={beat.late}>
				<span class="state">{beat.state}</span>
				<span class="line">{beat.line}</span>
			</li>
		{/each}
	</ol>

	<p class="diagnosis">
		The post-mortem named the cause:
		<strong>write infrastructure with no forced read path.</strong>
	</p>

	<ul class="guards">
		{#each guards as guard (guard)}
			<li class="guard">{guard}</li>
		{/each}
	</ul>

	<p class="evidence">
		Keyword search does the ranking, on purpose. A 2026 benchmark had plain text search beat vector
		search in all ten combinations it tested, so vector search still runs to widen what gets found
		&mdash; it never decides the order.
	</p>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1rem, 2.5vh, 1.6rem);
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

	.beats {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	/* All three columns are laid out from the first paint; step 1 only reveals
	   the third. Laying it out on advance would re-space the first two, and the
	   first two are exactly what did not change. */
	.beat {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding-top: 0.6rem;
		border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		visibility: hidden;
		opacity: 0;
	}

	.state {
		font-size: var(--deck-heading);
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.line {
		font-size: var(--deck-body);
		opacity: 0.75;
	}

	.diagnosis {
		margin: 0;
		font-size: var(--deck-subtitle);
		min-height: 1.6em;
		visibility: hidden;
	}

	.guards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: var(--deck-body);
		opacity: 0.85;
	}

	.guard {
		padding-left: 1rem;
		position: relative;
		visibility: hidden;
		opacity: 0;
	}

	.guard::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.62em;
		width: 0.4rem;
		height: 1px;
		background: currentColor;
		opacity: 0.5;
	}

	.evidence {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.6;
		max-width: 72ch;
		visibility: hidden;
	}

	@media (max-width: 900px) {
		.beats {
			grid-template-columns: 1fr;
			gap: 0.9rem;
		}
	}
</style>
