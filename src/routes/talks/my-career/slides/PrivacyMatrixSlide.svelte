<!--
  S14 — Privacy governance → mono (0:45) · never cut

  The tie-in beat, and per facts.md the most transferable idea in the deck.
  mono processes video of children in childcare settings, so "what may be
  indexed, by which system, and how that is enforced rather than promised" is
  not a side concern for that product — it generalizes to their problem far
  better than any retriever does.

  ONE ADVANCE, TWO TOKENS. The storyboard asked for a denied path bouncing off
  the gate. Showing a permitted path alongside it is what makes the denial mean
  something — otherwise the audience sees a thing fail and has nothing to
  compare it to.

  THEY NO LONGER TRAVEL (Brandon, 2026-07-29). The denied token used to run at
  the gate and reverse, which read as a thing bouncing rather than a thing
  refused, and it was the only motion in the deck that had to be watched to be
  understood — look away for a second and the pill is simply back where it
  started, indistinguishable from never having been sent. Both now fade in on
  their own side of the gate and stay there, each with the verdict as a badge.

  That also deleted a special case. The travelling version had to be HIDDEN
  entirely under `?print` and reduced motion, because a still frame of a
  mid-journey pill is indistinguishable from debris — so the PDF fallback was
  making a weaker argument than the live slide. A placed pill needs no
  exemption, and position carries what the travel carried: left of the gate
  means the content never reached a consumer.

  THE OVERLAY STAYS. `.track` is inset over the flow row and pointer-events:
  none, so the pills sit above the layout without occupying it. Nothing in the
  matrix, the gate, or the consumer list shifts on advance.

  THE CLAIM IS THE SHAPE, NOT THE ROW COUNT. Five matrix rows are shown out of
  a much longer table; they are chosen to show both verdicts, not to be
  complete. Do not read the count out loud.

  NO CODE ON THE SLIDE. Corrected 2026-07-29 on Brandon's instruction. The
  matrix rows were the literal path globs — `personal/**`, `**/*.me.md`,
  `projects/*/decisions/**` — wrapped in `<code>`, which the stylesheet never
  styled, so they rendered in raw browser monospace. That asked the room to
  parse glob syntax on the way to a point that has nothing to do with syntax,
  and the one thing worth understanding here is WHICH KINDS of content each
  verdict covers. Rows now name the content. The consumer list had the same
  problem in a different form: "QMD index", "graphify", "doc-audit lint" are
  internal project names, and the consumer that actually matters — content
  leaving the machine for a model API — was the least legible of the four.

  PUBLISH-SAFE: 3B's own governance rule and its own loader. The mono line is
  inference from a public product description (monoxyz.ai), not anything told
  in confidence — but it IS a statement about their product made in their room,
  so it should be one Brandon is comfortable defending if asked how he knows.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Chosen to show both verdicts, not to be exhaustive. These were the literal
	// path globs until 2026-07-29 — `personal/**`, `**/*.me.md` and so on — which
	// put monospaced code on a slide and made the audience parse syntax to reach
	// a point that is not about syntax. The rule is keyed on paths in the repo;
	// what the room needs to see is which KINDS of content each verdict covers.
	const rows = [
		{ kind: 'Personal notes', verdict: 'private' },
		{ kind: 'Session journals', verdict: 'private' },
		{ kind: 'Anything I hand-wrote as a source', verdict: 'private' },
		{ kind: 'Distilled knowledge', verdict: 'public' },
		{ kind: 'Decision records', verdict: 'public' },
	];

	// Named by what they DO rather than by their internal project names. "QMD
	// index", "graphify", "doc-audit lint" mean nothing outside this repo, and
	// the one that matters — content leaving the machine for a model API — was
	// the least legible of the four.
	const consumers = [
		'The local search index',
		'Anything uploaded to a model API',
		'The embedding store',
		'Automated documentation checks',
	];

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
			timeline.to([pass, deny], { autoAlpha: 0, duration: DURATION * d, ease: EASE });
			timeline.to(root.querySelector('.tie'), {
				autoAlpha: 0,
				y: 6,
				duration: DURATION * d,
				ease: EASE,
			});
			return;
		}

		// Both fade in where they belong and stay there. No travel: the denied token
		// used to run at the gate and reverse, which read as a thing bouncing rather
		// than a thing refused, and it was the only motion in the deck that had to be
		// watched to be understood.
		//
		// Position now carries what the travel carried — one pill left of the gate,
		// one right of it — and that deletes a special case. These two used to be
		// hidden entirely under `?print` and reduced motion, because a still frame of
		// a mid-journey pill is indistinguishable from debris. A static pill needs no
		// such exemption, so the PDF now makes the same argument the room sees.
		timeline.to(
			[deny, pass],
			{ autoAlpha: 1, duration: DURATION * d, stagger: 0.1 * d, ease: EASE },
			d ? '-=0.1' : 0,
		);

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
			{#each rows as row (row.kind)}
				<li class="row">
					<span class="kind">{row.kind}</span>
					<span class="verdict" class:private={row.verdict === 'private'}>{row.verdict}</span>
				</li>
			{/each}
		</ul>

		<div class="gate">
			<span class="gate-bar" aria-hidden="true"></span>
			<span class="gate-label">one shared rule</span>
		</div>

		<ul class="consumers">
			{#each consumers as consumer (consumer)}
				<li class="consumer">{consumer}</li>
			{/each}
		</ul>

		<!-- Overlay only. Absolutely positioned and pointer-events: none, so the
		     travelling tokens cannot shift anything underneath them. -->
		<div class="track" aria-hidden="true">
			<span class="token deny">
				Personal notes
				<span class="badge">never crosses</span>
			</span>
			<span class="token pass">
				Distilled knowledge
				<span class="badge">passes</span>
			</span>
		</div>
	</div>

	<p class="footnote">
		Every one of them reads the same table &mdash; none keeps its own copy &mdash; and a check fails
		the commit if any of them drifts out of line with it.
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

	/* Placed, not animated. Each sits on its own side of the gate, which is the
	   whole claim — left of it means the content never reached a consumer. */
	.token {
		position: absolute;
		top: 0;
		display: inline-flex;
		align-items: baseline;
		gap: 0.5rem;
		border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
		font-size: var(--deck-meta);
		white-space: nowrap;
		visibility: hidden;
		opacity: 0;
	}

	.token.deny {
		left: 2%;
	}

	/* Clear of the gate column, over the consumer list. That position is the only
	   thing this pill's placement has to communicate. */
	.token.pass {
		left: 60%;
	}

	.badge {
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.6;
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
