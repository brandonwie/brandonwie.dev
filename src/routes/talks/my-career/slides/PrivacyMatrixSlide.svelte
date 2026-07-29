<!--
  S14 — Privacy governance (0:45) · never cut

  The tie-in beat, and per facts.md the most transferable idea in the deck.

  THE FOOTNOTE WAS WRONG, CORRECTED 2026-07-29 after Brandon asked whether it is
  really "one rule". It is — and the slide was understating it while overstating
  the enforcement.

  What is true: the rule is a MARKDOWN TABLE in a documentation file,
  `.agents/rules/information-layer.md` § Privacy matrix. `scripts/lib/
  privacy-matrix.js` parses that markdown at runtime — its header names the file
  as the SoT and `parseMatrix(ruleBody)` reads the table out of the prose.
  Twelve consumers import that loader and none carries its own list. So the
  document IS the executable policy, which is a better story than a shared
  config file.

  What was false: the footnote said "a check fails the commit if any of them
  drifts out of line with it." No such check exists, and it describes behaviour
  that was DELIBERATELY REMOVED. `.husky/pre-commit` (the .graphifyignore drift
  gate) regenerates and re-stages instead of failing; its own comment records
  why they moved off `--check` mode — it could be passed by running the
  regenerator and forgetting to `git add`, leaving committed state stale. The
  honest version is the stronger one: it cannot drift, because committing a
  change to the table rewrites the enforcement list.

  THE PATH IS NOW ON THE SLIDE, reversing what this note said hours earlier
  (Brandon asked, and he was right). The first call treated it as an internal
  identifier like the ADR numbers removed from S13. It is not the same thing.
  `ADR-005` is an OPAQUE KEY — the number carries no information and cannot be
  decoded without the repo. A path is SELF-DESCRIBING: read it and you already
  know there is a rules directory and that one of those rules governs the
  information layer. It survives the test that killed the ADR numbers — said out
  loud to a non-specialist it needs no translation.

  It also earns its place rather than merely surviving. The natural skeptical
  response to "one rule decides what every system may read" is whether that is
  real or just a diagram, and the path is the answer: not an architecture
  drawing, a file. That is the whole reason this beat is interesting, and it was
  the one thing the slide did not show.

  It sits in the LEAD, not on the gate where it belongs semantically. The gate
  column is `auto`-width; a 33-character nowrap string there roughly doubles it
  and squeezes the matrix and the consumer list either side. The lead is
  full-width, and it is directly under the claim the path is evidence for.

  Monospaced deliberately, and this is the one place in the deck where that is
  right — see the `.rule-path` rule for why a citation differs from the glob
  rows that were removed.

  NEVER ASSERT WHAT THE AUDIENCE'S OWN PRODUCT DOES (Brandon, 2026-07-29). This
  slide used to end by naming the company being presented to and stating what
  its product handled, then arguing that such data has to be governed. Two
  problems, and the second is the serious one.

  It was vague — "the kind of thing that has to be" asserts importance without
  saying what breaks. And it was WRONG, or at least too narrow. The line came
  from inferring a product's scope off its public description, then stating that
  inference back to the people who build it, in their own room, as though it were
  established. Being narrated a version of their own product that is not quite
  right is a bad way to open the beat that is supposed to prove judgement.

  What replaces it claims nothing about anyone's product. Any product that adds
  AI ends up with several systems reading the same user data; that is true of
  theirs without anyone having to assert what theirs is. Any connection to what
  the room actually builds is left for the presenter to make out loud — a
  presenter can read whether that lands, a slide cannot.

  This is also why the slide is reusable: the argument is about the shape of the
  problem, not about one company's product, so it needs no edit per audience.

  LEGIBILITY (same note). Some of this room is not technical. The headline said
  "One table decides what every index may read", where "table" reads as a
  database table and "index" is jargon for the thing being governed. It is now a
  rule and a system. The new subtitle exists purely to narrate the diagram —
  content kinds on the left, the shared rule in the middle, the systems that must
  ask it on the right — because that reading is obvious only if you already know
  what you are looking at.

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
  verdict covers. Rows now name the content.

  FOURTH PASS ON THE CONSUMER LIST, 2026-07-29 (Brandon: "Anything that leaves
  my machine for an AI service" sounds vague). It was. Three faults in one line:
  "anything" implied a category when it is ONE tool doing one specific thing;
  "an AI service" was a euphemism for the concrete thing, a model API; and it
  hid the asymmetry that is the entire reason this slide exists.

  The asymmetry, verified against the repo: search is local — `3b-retrieve.js`
  runs a transformers.js pipeline and contains no network calls at all — and the
  checks are local. The repo map is the ONLY consumer where content leaves the
  machine, and even then only for non-code: code is parsed locally, AST-only,
  while the markdown gets sent to a model API to be summarised into the graph.
  Two of three never leave the laptop; one does. Listing them as peers made the
  rule look like general tidiness rather than the thing standing between private
  notes and an upload.

  The two lines now say which side they are on. The third is left alone — it was
  checked and it is TRUE: `graphify-privacy-diff.js` is a real drift auditor with
  `--baseline` snapshot diffing. It is a manual audit rather than the pre-commit
  path, which is why the footnote describes regeneration and this line describes
  catching. Do not "fix" it into agreement with the footnote; they describe two
  different mechanisms and both exist.

  THE CONSUMER LIST TOOK THREE PASSES BEFORE THAT (see the `consumers` comment). It went
  from internal project names, to terms of art, to what each one risks — and
  only the third pass survived Brandon reading it, because the test that
  mattered was not "is this shorter" but "can he finish the sentence if someone
  asks". He could not define "embedding store" from the stage, which makes it a
  trap with a delay on it rather than a detail.

  The crosscheck that produced the third pass also found the list was WRONG:
  two of the four entries were the same consumer. Worth remembering that
  de-jargoning something twice is not the same as checking it once.

  PUBLISH-SAFE: 3B's own governance rule and its own loader, and now nothing
  else. The slide previously carried an inference about the audience's product,
  drawn from that company's public description — removed 2026-07-29, see above.
  This note used to warn that it was a statement about their product made in
  their room and that Brandon should be ready to defend how he knew it. The
  warning was correct and the right answer to it turned out to be deletion, not
  a better defence: there is no version of guessing at someone's product on a
  slide that is worth the sentence it buys.
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
		{ kind: 'Anything I hand-wrote', verdict: 'private' },
		{ kind: 'Distilled knowledge', verdict: 'public' },
		{ kind: 'Decision records', verdict: 'public' },
	];

	// Named by what they RISK, not by what they are. Two earlier passes at this
	// list both failed, in different ways:
	//
	//   1. Internal project names — "QMD index", "graphify", "doc-audit lint".
	//      Meaningless outside this repo.
	//   2. Terms of art — "the local search index", "anything uploaded to a model
	//      API", "the embedding store". Better, and still jargon: Brandon could
	//      not have explained "embedding store" from the stage, and a slide
	//      carrying a phrase its presenter cannot define is a trap with a delay
	//      on it.
	//
	// Crosschecked 2026-07-29 against the actual readers of
	// scripts/lib/privacy-matrix.js. That check found the list was also WRONG,
	// not just opaque: "the local search index" and "the embedding store" are the
	// same consumer. 3b-retrieve.js is FTS5 and sqlite-vec merged by RRF — one
	// index with two halves — so the column was showing four things over three,
	// and padding the count with a duplicate is the opposite of what a list like
	// this is for.
	//
	// Three now, each one a sentence Brandon can finish. The real matrix has more
	// readers (the ignore-file generator, the freshness gate, get-privacy);
	// the claim is the shape, not the count.
	const consumers = [
		'Search over my own notes — never leaves the machine',
		'The repo map — sends file contents to a model API',
		'The checks that catch it when one of them drifts off the rule',
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
		<h1>One rule decides what every system may read</h1>
		<!--
			Was 32 words with an appositive hanging off a path and a relative clause
			hanging off the appositive — a written paragraph on the slide with the
			deck's worst words-per-second load. Its last sentence ("every tool checks
			there first") was also said again in the footnote below the diagram.
		-->
		<p class="lead">
			One row per kind of content, in
			<span class="rule-path">.agents/rules/information-layer.md</span>. The code reads that table
			at runtime.
		</p>
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
		None of them keeps its own copy &mdash; change the table and the enforcement list changes with
		it.
	</p>

	<p class="tie">
		Any product that adds AI ends up with several systems reading the same user data. Writing the
		policy is easy. Enforcing it is the part you build.
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

	/* Narrates the diagram rather than adding a claim. Same slot the other slides
	   give their before/after line, which this beat has no use for — nothing here
	   is a before. */
	.lead {
		margin: 0.4rem 0 0;
		font-size: var(--deck-subtitle);
		opacity: 0.6;
		max-width: 72ch;
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

	/* The rule, named, so "one rule decides" reads as a file that exists rather
	   than as a claim about architecture. Monospaced ON PURPOSE, and this is the
	   one place in the deck where that is right: the glob rows were removed for
	   rendering as raw code the room had to PARSE, whereas a path is a citation
	   the room only has to RECOGNISE. It lives in the lead rather than on the
	   gate, where it belongs semantically — the gate column is `auto`-width, and
	   a 33-character nowrap string there would have roughly doubled it and
	   squeezed the matrix and the consumer list either side. */
	.rule-path {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		opacity: 0.75;
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
