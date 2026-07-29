<!--
  S15b — How I work (0:35) · cut-1

  Sits between the close and the credentials, at Brandon's instruction
  (2026-07-29). The suffix means "inserted after S15" — unlike S4a/S4b it is NOT
  a split of that beat. Nothing was renumbered, deliberately: S16 and S17 are
  referenced by number in storyboard.md, script.md and todos.md, and renaming
  them a few hours before the talk buys nothing and risks a stale pointer.

  THE HARDEST SLIDE IN THE DECK TO MAKE HONEST. A slide that asserts personal
  qualities is the weakest genre there is: everyone claims intellectual humility,
  nobody can check it, and the room has heard it before. Worse, this deck's whole
  discipline is that nothing goes on a slide without a verified row — and "I am
  open to being wrong" is not the kind of claim a ledger can gate.

  So the slide does not stop at asserting the qualities. Each one points at a
  moment the room has already watched, and the moments carry it. That is the only
  reason this beat earns its 35 seconds:

    - Critical thinking — page 3. The gateway module was proposed and built, not
      complained about. init.me.md § MODULABS: "architected a gateway module
      convinces team and implemented".
    - Strong opinions, weakly held — page 15. He built a search engine, measured
      it, found it delivered nothing, and deleted it. Held strongly enough to
      build; let go on the measurement. Verified in facts.md as a deletion for
      zero measured value.
    - Intellectual humility — page 15's second guard. A regression test that
      blocks HIS OWN change when results get worse. Humility stated as a feeling
      is unfalsifiable; humility built into a gate that can veto him is not.

  Note the anchors are his own work failing or being constrained in all three
  cases. That is deliberate. An anchor where he was proved right would make these
  claims about competence; an anchor where he was checked makes them about
  character, which is what the slide is for.

  The closing line is the whole device and it must not be cut: without it, the
  three rows read as self-description, and the audience has no reason to believe
  any of them.

  THE NAMES ARE LOAD-BEARING (Brandon, 2026-07-29, correcting the first build):
  "strong opinions weakly held, intellectual humility, critical thinking — these
  three are the most important aspects of me." The first version of this slide
  translated all three into plain sentences and dropped the names, on the
  grounds that two of them are insider vocabulary. That was the wrong call. They
  are the words he identifies with, and a slide about how someone works that
  refuses to use their own vocabulary is describing a different person.

  The jargon problem is real but it is solved by the gloss line, not by deletion.
  Each row names the concept, then says it in ordinary language, then anchors it.
  A listener who has never met "strong opinions, weakly held" gets the meaning
  from the line underneath; a listener who has met it gets the shorthand and the
  respect of being spoken to in it. Removing the names bought plainness at the
  cost of the only thing the slide is actually about.

  "Critical thinking" is NEW as of this correction — it is not among the four
  positions in facts.md § Communication style and not in init.me.md's five
  bullets. It arrived when Brandon named the three out loud, which makes him the
  source for it exactly as init.me.md is the source for the rest. Recorded in
  facts.md as a position added on 2026-07-29.

  BIAS FOR ACTION IS DELIBERATELY NOT HERE. "When I cannot change all of it, I
  change the part I can" is the fourth ledger position and it was a row in the
  first build. Three abstract nouns is already the most abstraction this deck
  carries on one slide; a fourth turns a set of claims into a list of virtues.
  It moved to script.md as a spoken line, and it is the one of the four that the
  MOBA infrastructure beats already demonstrate without help. Restoring it is a
  one-entry change if Brandon wants it back.

  DO NOT put the scouting story on this slide. facts.md marks it `input — true
  but self-reported; strong as a spoken aside, weak as a slide claim`. It is the
  obvious thing to reach for here and the ledger already ruled on it.

  DO NOT let this slide drift toward the tenure question. The concern about
  repeated one-year moves is real and it is answered off-slide, in qa-prep.md.
  A slide that edges toward it invites the question early and on worse terms.

  steps: 2 — claims first, receipts second. The order is the argument: the room
  should get to think "everyone says that" before the anchors arrive.

  PUBLISH-SAFE: three callbacks to slides already in this deck. No new employer
  detail of any kind.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Three tiers per row, and each does a job the other two cannot.
	//
	//   name   — the concept Brandon actually identifies with. These are the words
	//            he uses about himself, so they lead.
	//   gloss  — the same idea in ordinary language, because two of the three
	//            names are insider vocabulary and half the room will not have met
	//            them. The gloss is what stops the row being a badge.
	//   anchor — the moment in this talk that already demonstrated it. Never a
	//            restatement of the gloss in other words; if it were, the row
	//            would assert twice and prove nothing.
	const rules = [
		{
			name: 'Critical thinking',
			gloss:
				'I argue based on evidence. An objection is not finished until it carries an alternative.',
			anchor: 'The gateway module was a proposal, not a complaint.',
		},
		{
			name: 'Strong opinions, weakly held',
			gloss: 'I commit to a position, and I let it go when the evidence turns.',
			anchor: 'The search engine I deleted was my own.',
		},
		{
			name: 'Intellectual humility',
			gloss: 'I assume I will be wrong, so I build the thing that catches it.',
			anchor: 'A test blocks my own change when the results get worse.',
		},
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelectorAll('.name'), { autoAlpha: 0, y: 8 });
		gsap.set(root.querySelectorAll('.gloss'), { autoAlpha: 0, y: 8 });
		gsap.set(root.querySelectorAll('.anchor'), { autoAlpha: 0 });
		gsap.set(root.querySelector('.point'), { autoAlpha: 0, y: 6 });

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

		timeline.to(root.querySelectorAll('.name'), {
			autoAlpha: 1,
			y: 0,
			duration: DURATION * d,
			stagger: 0.1 * d,
			ease: EASE,
		});

		// Glosses trail their names closely rather than arriving as a second wave.
		// The name and its plain-language version are one unit — separating them
		// would leave three abstract nouns alone on screen, which is the exact
		// impression this slide exists to avoid.
		timeline.to(
			root.querySelectorAll('.gloss'),
			{
				autoAlpha: 0.85,
				y: 0,
				duration: DURATION * d,
				stagger: 0.1 * d,
				ease: EASE,
			},
			d ? '-=0.42' : 0,
		);

		// The anchors arrive together rather than staggered under their own rules.
		// Staggered, the eye tracks down the column and reads them as three more
		// items; arriving as a set, they read as the receipts for what is already
		// on screen.
		// autoAlpha resolves to opacity, so the resting dimness has to be the tween
		// target — a CSS `opacity: 0.65` would be overwritten by an autoAlpha of 1.
		timeline.to(
			root.querySelectorAll('.anchor'),
			{
				autoAlpha: want ? 0.65 : 0,
				duration: DURATION * d,
				stagger: 0.05 * d,
				ease: EASE,
			},
			d ? '-=0.15' : 0,
		);

		// Last, and after a beat. This line is what turns three assertions into
		// three citations, so it cannot land while the anchors are still fading.
		timeline.to(
			root.querySelector('.point'),
			{ autoAlpha: want ? 0.75 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
			d ? '-=0.05' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">How I work</p>
		<h1>Being right is not the useful part</h1>
	</header>

	<ul class="rules">
		{#each rules as rule (rule.name)}
			<li class="rule">
				<span class="name">{rule.name}</span>
				<span class="gloss">{rule.gloss}</span>
				<span class="anchor">{rule.anchor}</span>
			</li>
		{/each}
	</ul>

	<p class="point">Not claims about myself &mdash; three slides you just watched.</p>
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

	.rules {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: clamp(0.9rem, 2.2vh, 1.4rem);
	}

	/* Column layout, and both spans exist from the first paint. The anchor is
	   hidden with `visibility`, never `display: none` — revealing it must not
	   re-space the principles above it, and onMount runs after first paint. */
	.rule {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding-left: 1rem;
		position: relative;
	}

	.rule::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.68em;
		width: 0.4rem;
		height: 1px;
		background: currentColor;
		opacity: 0.5;
	}

	.name {
		font-size: var(--deck-heading);
		font-weight: 600;
		letter-spacing: -0.01em;
		visibility: hidden;
		opacity: 0;
	}

	.gloss {
		font-size: var(--deck-body);
		opacity: 0;
		visibility: hidden;
	}

	/* Dimmer than the rule it backs, so the three principles still scan as three
	   and the anchors read as evidence rather than as three more assertions. */
	.anchor {
		font-size: var(--deck-body);
		opacity: 0;
		visibility: hidden;
	}

	.point {
		margin: 0;
		font-size: var(--deck-subtitle);
		opacity: 0.7;
		visibility: hidden;
	}
</style>
