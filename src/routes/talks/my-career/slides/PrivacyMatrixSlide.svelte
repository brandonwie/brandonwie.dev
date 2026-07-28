<!--
  S14 — Privacy governance → mono (0:45) · never cut

  The tie-in beat, and per facts.md the most transferable idea in the deck.
  mono processes video of children in childcare settings, so "what may be
  indexed, by which system, and how that is enforced rather than promised" is
  not a side concern for that product — it generalizes to their problem far
  better than any retriever does.

  ONE ADVANCE, TWO TOKENS. The storyboard asked for a denied path bouncing off
  the gate. Sending a permitted path through on the same advance is what makes
  the bounce mean something — otherwise the audience sees a thing fail and has
  nothing to compare it to. Both are choreography inside one input, which is
  what the two-step rule allows (staggered arrival, not a third state).

  TOKENS TRAVEL IN AN ABSOLUTE OVERLAY. `.track` is inset over the flow row and
  pointer-events: none, so animating `left` moves nothing else on the slide.
  Nothing in the matrix, the gate, or the consumer list shifts on advance.

  THE CLAIM IS THE SHAPE, NOT THE ROW COUNT. Five matrix rows are shown out of
  a much longer table; they are chosen to show both verdicts, not to be
  complete. Do not read the count out loud.

  PUBLISH-SAFE: 3B's own path globs and its own loader. The mono line is
  inference from a public product description (monoxyz.ai), not anything told
  in confidence — but it IS a statement about their product made in their room,
  so it should be one Brandon is comfortable defending if asked how he knows.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Chosen to show both verdicts, not to be exhaustive.
	const rows = [
		{ path: 'personal/**', verdict: 'private' },
		{ path: 'journals/**', verdict: 'private' },
		{ path: '**/*.me.md', verdict: 'private' },
		{ path: 'knowledge/**', verdict: 'public' },
		{ path: 'projects/*/decisions/**', verdict: 'public' },
	];

	const consumers = ['QMD index', 'graphify → model API', 'vector store', 'doc-audit lint'];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelectorAll('.row'), { autoAlpha: 0, y: 6 });
		gsap.set(root.querySelector('.gate'), { autoAlpha: 0, scaleY: 0.7 });
		gsap.set(root.querySelectorAll('.consumer'), { autoAlpha: 0, y: 6 });
		gsap.set(root.querySelectorAll('.token'), { autoAlpha: 0 });
		gsap.set(root.querySelector('.tie'), { autoAlpha: 0, y: 6 });

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

		const pass = root.querySelector('.token.pass');
		const deny = root.querySelector('.token.deny');

		const timeline = gsap.timeline();

		// Step 0: the table, the loader, the consumers. Static.
		timeline.to(root.querySelectorAll('.row'), {
			autoAlpha: 1,
			y: 0,
			duration: DURATION * d,
			stagger: 0.05 * d,
			ease: EASE,
		});

		timeline.to(
			root.querySelector('.gate'),
			{ autoAlpha: 1, scaleY: 1, duration: DURATION * d, ease: EASE },
			d ? '-=0.2' : 0,
		);

		timeline.to(
			root.querySelectorAll('.consumer'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.05 * d, ease: EASE },
			d ? '-=0.25' : 0,
		);

		if (!want) {
			// Returning to step 0: park both tokens back at the start, invisible.
			timeline.set([pass, deny], { autoAlpha: 0, left: '3%' });
			timeline.to(root.querySelector('.tie'), {
				autoAlpha: 0,
				y: 6,
				duration: DURATION * d,
				ease: EASE,
			});
			return;
		}

		if (d === 0) {
			// Print (`?print` renders every slide at its final step with animate
			// false) and reduced-motion. These two tokens carry their entire meaning
			// in the TRAVEL — a still frame of one pill at 86% and one back at 3%
			// cannot show that the second was refused rather than never sent, so in
			// a PDF it reads as debris. Hide them. The matrix, the gate, the
			// footnote and the tie line still make the whole argument without them.
			timeline.set([pass, deny], { autoAlpha: 0 });
		} else {
			// Permitted first, so the denial has something to be measured against;
			// then the denial, which is the beat that lands.
			timeline.set([pass, deny], { left: '3%' });

			timeline.to(pass, { autoAlpha: 1, duration: 0.15, ease: EASE });
			// 600ms, not the 750ms this first shipped at. 750 made it the longest
			// single motion in the deck — longer than S9's Flip, which at least
			// depicts an architecture change. 600 matches the S1/S12/S15 rail draw,
			// which is the established ceiling for a one-time structural move.
			// See animation-audit.md finding 1.
			timeline.to(pass, { left: '86%', duration: 0.6, ease: EASE });

			timeline.to(deny, { autoAlpha: 1, duration: 0.15, ease: EASE }, '-=0.35');
			timeline.to(deny, { left: '44%', duration: 0.45, ease: EASE });
			// Refused at the gate and sent back. Faster on the way out than on the
			// way in — it did not negotiate.
			timeline.to(deny, { left: '3%', duration: 0.3, ease: EASE });
		}

		timeline.to(
			root.querySelector('.tie'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, ease: EASE },
			d ? '-=0.15' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">3B &mdash; privacy governance</p>
		<h1>One table decides what every index may read</h1>
	</header>

	<div class="flow">
		<ul class="matrix">
			{#each rows as row (row.path)}
				<li class="row">
					<code>{row.path}</code>
					<span class="verdict" class:private={row.verdict === 'private'}>{row.verdict}</span>
				</li>
			{/each}
		</ul>

		<div class="gate">
			<span class="gate-bar" aria-hidden="true"></span>
			<span class="gate-label">one shared loader</span>
		</div>

		<ul class="consumers">
			{#each consumers as consumer (consumer)}
				<li class="consumer">{consumer}</li>
			{/each}
		</ul>

		<!-- Overlay only. Absolutely positioned and pointer-events: none, so the
		     travelling tokens cannot shift anything underneath them. -->
		<div class="track" aria-hidden="true">
			<span class="token pass"><code>knowledge/**</code></span>
			<span class="token deny"><code>personal/**</code></span>
		</div>
	</div>

	<p class="footnote">
		One loader, N consumers, a generated ignore file, and a pre-commit gate that fails on drift.
	</p>

	<p class="tie">
		mono processes video of children. What may be indexed, by which system, is the kind of thing
		that has to be enforced rather than promised.
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

	.flow {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) auto minmax(0, 1fr);
		align-items: center;
		gap: clamp(1.5rem, 4vw, 3.5rem);
		/* Reserved lane for the token overlay, so revealing it changes nothing. */
		padding-bottom: 3rem;
	}

	.matrix,
	.consumers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		font-size: var(--deck-body);
		border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
		padding-bottom: 0.3rem;
		visibility: hidden;
		opacity: 0;
	}

	.verdict {
		font-size: var(--deck-meta);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.55;
	}

	.verdict.private {
		opacity: 0.9;
		font-weight: 600;
	}

	.gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		visibility: hidden;
		opacity: 0;
	}

	.gate-bar {
		display: block;
		width: 3px;
		height: clamp(5rem, 14vh, 8rem);
		background: currentColor;
		opacity: 0.75;
	}

	.gate-label {
		font-size: var(--deck-meta);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.55;
		white-space: nowrap;
	}

	.consumer {
		font-size: var(--deck-body);
		opacity: 0.8;
		visibility: hidden;
	}

	.track {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0.25rem;
		height: 2.25rem;
		pointer-events: none;
	}

	.token {
		position: absolute;
		top: 0;
		left: 3%;
		border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
		font-size: var(--deck-meta);
		white-space: nowrap;
		visibility: hidden;
		opacity: 0;
	}

	.token.deny {
		top: 1.35rem;
	}

	.footnote {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.6;
	}

	.tie {
		margin: 0;
		font-size: var(--deck-subtitle);
		font-weight: 600;
		max-width: 68ch;
		min-height: 1.6em;
		visibility: hidden;
	}

	/* Narrow: a three-column flow with a travelling token stops being readable.
	   Stack the columns and drop the animation lane entirely — the table and the
	   consumer list still carry the claim. */
	@media (max-width: 900px) {
		.flow {
			grid-template-columns: 1fr;
			gap: 1.25rem;
			padding-bottom: 0;
		}

		.gate {
			flex-direction: row;
			align-self: flex-start;
		}

		.gate-bar {
			width: clamp(4rem, 30vw, 8rem);
			height: 3px;
		}

		.track {
			display: none;
		}
	}
</style>
