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

  SECOND PLAIN-LANGUAGE PASS, 2026-07-29 (Brandon: hard to follow if you are not
  technical). The diagnosis, set at subtitle size and therefore the
  second-largest text here, read "write infrastructure with no forced read path"
  — the purest engineer shorthand in the deck. It now says the same thing in
  words anyone can repeat: everything was filed away, and nothing was ever
  required to read it. "Retrieval" left the eyebrow for the same reason; it now
  matches the plain phrasing S14 already uses for this system.

  THE HEADLINE IS THE ARGUMENT, NOT THE ARC (Brandon, 2026-07-29: "does not seem
  aligned with the page context"). Two drafts failed here and both failed the
  same way. "I measured it, deleted it, and rebuilt it" hung three verbs on a
  pronoun with no antecedent. Its replacement, "I built my own search engine,
  then deleted it", named the thing but restated two of the three column
  headings sitting directly beneath it — and then stopped at the admission,
  while the bottom two-thirds of the slide is about what the rebuild does
  differently. A headline that repeats the row below it and omits the row's
  point is not a headline.

  Every other slide in this deck splits the two: the eyebrow carries the subject
  and the h1 carries the claim ("3B — my own system, in version control" /
  "Working with agents as a loop, not a prompt"). This one now does the same.
  The eyebrow names the system; the h1 states the lesson the whole page is
  evidence for; the beats own the arc; the diagnosis owns the cause; the guards
  own the fix. Nothing says the same thing twice.

  "I stopped trusting my memory" is also the half the old headline could not
  reach. The diagnosis is that nothing was REQUIRED to read; guard one makes it
  required; guard three ends "not remembered" and closes the loop with a number.
  In a room hiring for judgement, being remembered for building the constraint
  beats being remembered for having deleted something.

  The vector half is no longer named on the slide. A technical listener hears the
  right term from the presenter (script.md keeps it); a non-technical one reads
  "the search that matches on meaning" and loses nothing. Naming it and then
  glossing it would have cost a clause and bought nothing on screen.

  EACH GUARD CARRIES ONE CONCRETE EXAMPLE (Brandon, same pass). The rules alone
  were noddable-but-unpicturable: "a quality test blocks the merge" is agreeable
  and imageless. Each example is the instance that makes the rule checkable, and
  the third one deliberately answers the question the claim provokes — every
  search is logged with the reason it fired, which is HOW the two-thirds split is
  known. Expect that question if the room is technical.

  CUT TO ROUGHLY HALF, 2026-07-29 (Brandon: too many words). ~200 words to ~105.
  Everything that survived is a fragment rather than a sentence, because the
  slide gets 45 seconds and the audience is listening rather than reading. The
  cuts were appositives and hedges, not claims: Built lost a three-item list
  restating what "my own notes" already means; the guards lost their sentence
  scaffolding; the evidence paragraph lost the clause explaining what the
  meaning-based search catches, which is a Q&A answer rather than a slide line.
  Every verified claim is still on the slide. script.md keeps the long forms for
  a room that asks.

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
			line: 'A search engine over my own notes.',
			late: false,
		},
		{
			state: 'Deleted',
			line: 'Measured what it was worth. Nothing. Deleted it — and wrote down why.',
			late: false,
		},
		{
			state: 'Rebuilt',
			line: 'From that write-up. The reasons became the build list.',
			late: true,
		},
	];

	// Each guard is a rule plus one concrete instance of it. The rules alone were
	// the abstract part of this slide — "a quality test blocks the merge" is a
	// sentence you can nod along to without picturing anything. Both halves are
	// deliberately fragments, not sentences: this slide gets 45 seconds, and the
	// audience is listening, not reading. The third example answers the question
	// the claim provokes — how would you even know that.
	const guards = [
		{
			rule: 'Seven workflows must search my notes before they answer',
			example: 'Opening a project searches what I wrote last time first.',
		},
		{
			rule: 'A change that makes search worse cannot ship',
			example: 'Fixed questions, answers I already know — miss one, the change stops.',
		},
		{
			rule: 'Two-thirds of searches are forced now, not remembered',
			example: 'Every search logs why it fired. That is how I know.',
		},
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
		<p class="company">3B &mdash; searching my own notes</p>
		<h1>I stopped trusting my memory</h1>
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
		The write-up named the cause:
		<strong>everything was filed away, and nothing was ever required to read it.</strong>
	</p>

	<ul class="guards">
		{#each guards as guard (guard.rule)}
			<li class="guard">
				<span class="rule">{guard.rule}</span>
				<span class="example">{guard.example}</span>
			</li>
		{/each}
	</ul>

	<p class="evidence">
		Plain word-matching does the ranking, on purpose &mdash; a 2026 benchmark had it beat the
		meaning-based search in all ten setups tried.
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
		gap: 0.55rem;
		font-size: var(--deck-body);
		opacity: 0.85;
	}

	/* Column, not the default inline flow: the rule and its example are two
	   spans, and inline they would run together into one sentence that reads as
	   a rule contradicting itself. */
	.guard {
		padding-left: 1rem;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		visibility: hidden;
		opacity: 0;
	}

	/* Dimmer than the rule it sits under, so the three rules still scan as a
	   list of three and the examples read as support rather than as six items. */
	.example {
		opacity: 0.6;
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

	/* Full slide width, NOT the 72ch reading measure the other body copy uses.
	   Adding the guard examples pushed this slide past the stage and the last
	   line landed on the progress rail; the narrow measure was costing two extra
	   lines here. This is the dimmest, most optional paragraph on the slide, so
	   it is the right place to spend line length rather than shorten a claim. */
	.evidence {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.6;
		visibility: hidden;
	}

	@media (max-width: 900px) {
		.beats {
			grid-template-columns: 1fr;
			gap: 0.9rem;
		}
	}
</style>
