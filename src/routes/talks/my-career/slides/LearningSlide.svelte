<!--
  S16 — Never stopped learning (0:30) · cut-1

  Added 2026-07-29 at Brandon's request. The claim is NOT "I study" — every
  candidate says that and none of it is checkable. The claim is that all six
  credentials were earned INSIDE the MOBA period (joined Mar 2025), while
  leading backend and shipping the sync engine the previous nine slides just
  described. That is why every row carries a date: the dates are what make the
  claim falsifiable, and a claim the room can check is worth more than one it
  has to take on trust.

  EVERY ROW HAS A VERIFIED LEDGER ENTRY. facts.md § Continuous learning while at
  MOBA. One of the six needed real checking rather than assuming: the AWS AI
  Practitioner is on neither the submitted CV nor LinkedIn, because the exam was
  passed 2026-07-24 and the CV went out on the 22nd. Verified against
  personal/goals/aws-ai-practitioner.md:19 — "Result: Exam passed on
  2026-07-24".

  SAY "PASSED THE EXAM", NOT A CREDENTIAL ID, for the AI Practitioner. The
  credential is still pending issue, so there is nothing he could show if
  challenged. The date on the slide is the honest form.

  NO COURSE CODES. The CV writes these as CS1332xI–xIV. That is an edX/Georgia
  Tech catalogue identifier and it is exactly the class of thing removed from
  S13 on 2026-07-29 — it names nothing to anyone in the room. "Data Structures
  & Algorithms I through IV" is the same information without the decoder ring.

  OMSCS IS DELIBERATELY ABSENT. The four courses are prerequisites on a Georgia
  Tech OMSCS track, which would be the strongest possible version of this beat —
  and it also announces a Master's plan to a room where the referral already
  raised a concern about him leaving again (qa-prep.md § The return story).
  Off-slide by default; honest if asked. Brandon's call, recorded in facts.md.

  REVEAL ONLY, NO DEPICTIVE MOTION. Nothing structural changes here — it is a
  list and then the reading of the list. Per animation-audit.md's distinction
  that is reveal motion, which convention 4 was never about, so there is no
  Flip, no draw, no scale.

  PUBLISH-SAFE: Brandon's own credentials and public course names. Nothing
  employer-internal on this slide.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Dates are load-bearing, not decoration: they are what places every row
	// inside the MOBA period and makes the headline checkable.
	const certifications = [
		{ name: 'AWS Certified Cloud Practitioner', when: 'Sep 2025' },
		{ name: 'AWS Certified AI Practitioner', when: 'Jul 2026' },
	];

	const coursework = [
		{ name: 'Data Structures & Algorithms I', when: 'Apr 2026' },
		{ name: 'Data Structures & Algorithms II', when: 'May 2026' },
		{ name: 'Data Structures & Algorithms III', when: 'Jul 2026' },
		{ name: 'Data Structures & Algorithms IV', when: 'Jul 2026' },
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		// Step-0 resting state. Everything is in the DOM from first paint; these
		// only hide it, so returning to step 0 restores rather than rebuilds.
		gsap.set(root.querySelectorAll('.item'), { autoAlpha: 0, y: 6 });
		gsap.set(root.querySelectorAll('.group-label'), { autoAlpha: 0 });
		gsap.set(root.querySelector('.point'), { autoAlpha: 0, y: 8 });
		gsap.set(root.querySelector('.detail'), { autoAlpha: 0, y: 6 });

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

		// Step 0: the evidence. Labels first so the two groups are distinguishable
		// before the rows start arriving under them.
		timeline.to(root.querySelectorAll('.group-label'), {
			autoAlpha: 1,
			duration: DURATION * d,
			stagger: 0.06 * d,
			ease: EASE,
		});

		timeline.to(
			root.querySelectorAll('.item'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.05 * d, ease: EASE },
			d ? '-=0.3' : 0,
		);

		// Step 1: the reading of it. The list alone invites "so you collect
		// certificates"; these two lines are the answer to that.
		timeline.to(
			root.querySelector('.point'),
			{ autoAlpha: want ? 1 : 0, y: want ? 0 : 8, duration: DURATION * d, ease: EASE },
			d ? '-=0.1' : 0,
		);

		timeline.to(
			root.querySelector('.detail'),
			{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
			d ? '-=0.25' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA &middot; Mar 2025 &ndash; present</p>
		<h1>Six credentials, all while leading backend</h1>
	</header>

	<div class="groups">
		<div class="group">
			<p class="group-label">Certifications</p>
			<ul class="items">
				{#each certifications as row (row.name)}
					<li class="item">
						<span class="name">{row.name}</span>
						<span class="when">{row.when}</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="group">
			<p class="group-label">Georgia Tech, via edX</p>
			<ul class="items">
				{#each coursework as row (row.name)}
					<li class="item">
						<span class="name">{row.name}</span>
						<span class="when">{row.when}</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>

	<p class="point">None of it happened between jobs.</p>

	<p class="detail">
		The two certificates are the two subjects that turned up in the work &mdash; AWS on the
		infrastructure, AI on the pipeline. The four courses were going back for fundamentals on
		purpose, not chasing a framework.
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

	/* Two unequal columns: four rows on the right against two on the left, so the
	   coursework side gets the width its longer names need. */
	.groups {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		gap: clamp(1.5rem, 4vw, 3.5rem);
		align-items: start;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.group-label {
		margin: 0;
		font-size: var(--deck-meta);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.45;
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.item {
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

	/* The date is the evidence, not a footnote — it is what puts the row inside
	   the MOBA period. Quieter than the name, but not dismissed. */
	.when {
		font-size: var(--deck-meta);
		opacity: 0.65;
		white-space: nowrap;
	}

	.point {
		margin: 0;
		font-size: var(--deck-subtitle);
		font-weight: 600;
		visibility: hidden;
	}

	.detail {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.7;
		max-width: 72ch;
		visibility: hidden;
	}

	@media (max-width: 900px) {
		.groups {
			grid-template-columns: 1fr;
			gap: 1.1rem;
		}
	}
</style>
