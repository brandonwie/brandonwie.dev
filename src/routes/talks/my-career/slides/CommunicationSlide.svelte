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

  So the slide does not assert the qualities. It points at three moments the room
  has already watched, and lets them carry it. That is the only reason this beat
  earns its 35 seconds:

    - "I argue from evidence, and change my mind on it" — page 15. He measured
      his own search engine, found it delivered nothing, deleted it, and wrote
      down why. Verified in facts.md as a deletion for zero measured value.
    - "An objection is not finished until it carries an alternative" — page 3.
      The gateway module was proposed and built, not complained about. init.me.md
      § MODULABS: "architected a gateway module convinces team and implemented".
    - "When I cannot change all of it, I change the part I can" — page 12. Cheap
      exact-path blocking rules went in immediately; the move behind a private
      network happened gradually afterwards. init.me.md § Infrastructure.

  The closing line is the whole device and it must not be cut: without it, the
  three rows read as self-description, and the audience has no reason to believe
  any of them.

  SOURCE IS facts.md § Communication style, which holds four positions. Rows 1
  and 2 of that section — intellectual humility, and strong opinions weakly held
  — are merged here into a single line. They are two halves of one behavior
  (commit on evidence, revise on evidence), and stating them as separate bullets
  reads as padding. No claim is lost in the merge; the ledger keeps both.

  REGISTER: the source note in init.me.md asks for "more formal and academic
  words". That instruction predates the plain-language direction the deck took on
  2026-07-29, and following it would fight pages 15 and 16, which were rewritten
  the other way on the same day. "Intellectual humility" and "strong opinions,
  weakly held" are both insider vocabulary — the second is a borrowed phrase most
  of the room will not know. They are said here in ordinary words instead. Raised
  with Brandon rather than silently overridden; see progress.md.

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

	// `anchor` is the moment in this talk that already demonstrated the rule. It
	// is never a restatement of the rule in other words — if it were, the slide
	// would be asserting twice and proving nothing.
	const rules = [
		{
			principle: 'I argue from evidence, and I change my mind on it',
			anchor: 'The search engine I deleted was my own.',
		},
		{
			principle: 'An objection is not finished until it carries an alternative',
			anchor: 'The gateway module was a proposal, not a complaint.',
		},
		{
			principle: 'When I cannot change all of it, I change the part I can',
			anchor: 'The cheap blocking rules shipped first. The private network came after.',
		},
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelectorAll('.principle'), { autoAlpha: 0, y: 8 });
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

		timeline.to(root.querySelectorAll('.principle'), {
			autoAlpha: 1,
			y: 0,
			duration: DURATION * d,
			stagger: 0.1 * d,
			ease: EASE,
		});

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
		{#each rules as rule (rule.principle)}
			<li class="rule">
				<span class="principle">{rule.principle}</span>
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

	.principle {
		font-size: var(--deck-heading);
		font-weight: 600;
		letter-spacing: -0.01em;
		visibility: hidden;
		opacity: 0;
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
