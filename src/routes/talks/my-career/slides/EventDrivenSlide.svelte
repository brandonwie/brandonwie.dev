<!--
  S7 — Sync: coupling → event-driven (0:45)

  The single most important morph in the deck, and the beat where the reasoning
  gets stated rather than just the outcome.

  The animation carries exactly one change: the queue module leaves the block
  module. Everything else on screen holds still so the audience knows where to
  look. That is the whole design rule.

  THE SYNC CALL, ADDED 2026-07-29 (Brandon, mid-walk). Decoupling alone was the
  smaller half of this beat. The optimistic update was unreliable, so every
  request forced a full sync as insurance — the heaviest module in the system,
  one Google round trip per request, and users meeting Google's rate limits as a
  result. Correcting the optimistic update removed the call entirely. That is a
  root-cause story rather than a refactor, and it is the strongest thing on this
  slide, so the line under the diagram carries it.

  Its verified row is facts.md § Sync engine — force-sync from Google on every
  request, hitting rate limits → correct optimistic updates survive without a
  Google round trip. The row existed the whole time and had no beat; it was the
  storyboard that was incomplete, not the ledger.

  DO NOT attribute the forced sync to a person on stage, in any wording. The
  ledger row describes a mechanism and so does this slide. "The optimistic update
  was unreliable, so every request forced a sync" is the whole story, and naming
  who wrote it adds nothing except a way to look bad in a room of engineers.

  It crossfades in one grid cell rather than getting a second Flip. One expensive
  morph per slide is the budget, and this slide already spends it on the queue.

  Claims here are at CV wording (see facts.md). No throughput number on this
  slide — that belongs to S9. Error rate stays off it too: C4 locks that to
  "near-zero" and it belongs with the recurring-event work.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	let root = $state<HTMLElement>();
	let decoupled = $state(false);
	let ready = $state(false);
	let applied = -1;

	// TWO STEPS: before and after. Deck-wide rule — no slide gets a third.
	//
	// A slide answers one question, so it has one transition. Everything after
	// the single advance is choreographed inside that one step: the queue lands,
	// the event channel draws into the gap, then the response and its reasons
	// arrive. Sequenced, but one input.
	const showChannel = $derived(step >= 1);
	const respondsImmediately = $derived(step >= 1);

	const notes = [
		'Fire and forget — the request no longer waits on the queue',
		'No Google round trip on the common path, so no rate-limit pressure',
		'Shaped so a future service split is possible, not blocked',
	];

	onMount(async () => {
		const { gsap } = await loadGsap();

		// Pin the resting state before the first render pass. Without this the
		// notes mount visible and only get faded out once GSAP loads, so entering
		// the slide flashed the final step's text.
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
			gsap.set(root.querySelector('.sync-after'), { autoAlpha: 0 });
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
		const { gsap, Flip } = await loadGsap();
		if (!root) return;

		const still = !animate || reducedMotion();
		const wantDecoupled = target >= 1;

		if (wantDecoupled !== decoupled) {
			// Capture geometry BEFORE Svelte moves the node, then let Flip animate
			// the delta. The element is destroyed and recreated by the {#if}, so
			// data-flip-id is what lets Flip match old position to new element.
			const state = still ? null : Flip.getState(root.querySelectorAll('[data-flip-id]'));

			decoupled = wantDecoupled;
			await tick();

			if (state) {
				Flip.from(state, {
					duration: DURATION,
					ease: EASE,
					absolute: true,
				});
			}
		}

		await tick();
		const d = still ? 0 : 1;

		// Draw the channel only on the advance that introduces it. Re-running the
		// draw on every later step would re-animate a line that is already there,
		// which reads as a glitch rather than a change.
		const introducingChannel = target === 1 || (still && target >= 1);

		if (introducingChannel) {
			// Delayed past the Flip so the two reads as cause and effect — the box
			// leaves, then the channel fills the gap — rather than as two things
			// moving at once.
			const channel = root.querySelector('.channel-line');
			if (channel) {
				gsap.fromTo(
					channel,
					{ drawSVG: '0%' },
					{ drawSVG: '100%', duration: 0.4 * d, ease: EASE, delay: DURATION * 0.7 * d },
				);
			}

			const head = root.querySelector('.channel-head');
			if (head) {
				gsap.fromTo(
					head,
					{ autoAlpha: 0 },
					{ autoAlpha: 0.65, duration: 0.2 * d, ease: EASE, delay: (DURATION * 0.7 + 0.35) * d },
				);
			}
		}

		// The sync call goes after the channel lands, because it is the consequence
		// of the change and not part of it: the queue leaves, the event replaces the
		// call, and only then does the round trip stop being necessary.
		const syncDelay = (DURATION * 0.7 + 0.3) * d;
		gsap.to(root.querySelector('.sync-before'), {
			autoAlpha: target >= 1 ? 0 : 0.75,
			duration: DURATION * d,
			ease: EASE,
			delay: target >= 1 ? syncDelay : 0,
		});
		gsap.to(root.querySelector('.sync-after'), {
			autoAlpha: target >= 1 ? 1 : 0,
			duration: DURATION * d,
			ease: EASE,
			delay: target >= 1 ? syncDelay : 0,
		});

		// Last in the sequence: the reasoning only makes sense once the diagram
		// and the response have both settled.
		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: target >= 1 ? 1 : 0,
			y: target >= 1 ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: target >= 1 ? (DURATION * 0.7 + 0.45) * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA</p>
		<h1>Decoupling the sync queue</h1>
		<!--
			The subtitle must not outrun the diagram. "Fire and forget" is only true
			once the response no longer waits, so it appears at that step and not
			when the box first moves.
		-->
		<p class="state" class:after={decoupled}>
			{#if respondsImmediately}
				After — event-driven, and the sync call is gone
			{:else if decoupled}
				After — the queue owns its own lifecycle
			{:else}
				Before — queue injected into the block module, and every request forces a sync
			{/if}
		</p>
	</header>

	<div class="diagram" class:is-decoupled={decoupled}>
		<div class="column">
			<div class="box block" data-flip-id="block">
				<span class="box-title">Block module</span>
				{#if !decoupled}
					<div class="box queue" data-flip-id="queue">
						<span class="box-title">Google queue module</span>
						<span class="box-note">dependency-injected</span>
					</div>
				{/if}
			</div>
		</div>

		<div class="column channel" aria-hidden="true">
			{#if showChannel}
				<svg viewBox="0 0 120 24" preserveAspectRatio="xMidYMid meet">
					<line class="channel-line" x1="2" y1="12" x2="108" y2="12" />
					<!-- Direction matters: the block emits, the queue consumes. The head
					     fades in after the line lands so it never floats detached. -->
					<polyline class="channel-head" points="103,7.5 111,12 103,16.5" />
				</svg>
				<span class="channel-label">event</span>
			{/if}
		</div>

		<div class="column lane">
			{#if decoupled}
				<div class="box queue" data-flip-id="queue">
					<span class="box-title">Google queue module</span>
					<span class="box-note">own lifecycle</span>
				</div>
			{/if}
		</div>
	</div>

	<!--
		The sync call, crossfading in one grid cell. Both states are in the DOM from
		first paint and neither is placed automatically, which is what lets them
		share a cell — the same mechanic ModulabsSlide and MoviationSlide use, and
		deliberately NOT another Flip. One expensive morph per slide is the budget.
	-->
	<div class="synccall">
		<span class="sync-state sync-before">
			Then a full sync, every time &mdash; the heaviest module, a Google round trip per request, and
			users meeting Google&rsquo;s rate limits
		</span>
		<span class="sync-state sync-after">
			No sync call at all &mdash; correct optimistic updates hold without a Google round trip
		</span>
	</div>

	<p class="response">
		Response to the caller:
		<strong>{respondsImmediately ? 'immediate' : 'waits for the queue'}</strong>
	</p>

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
		/* Only the wording changes here; no motion, so attention stays on the boxes. */
	}

	.diagram {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: clamp(0.75rem, 2vw, 1.5rem);
		min-height: clamp(140px, 26vh, 240px);
	}

	.column {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.box {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		padding: clamp(0.75rem, 2vw, 1.25rem);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
	}

	.block {
		min-width: min(20rem, 100%);
		gap: 0.75rem;
	}

	.queue {
		border-style: dashed;
		background: color-mix(in srgb, currentColor 8%, transparent);
	}

	.box-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.box-note {
		font-size: var(--deck-meta);
		opacity: 0.55;
	}

	/* The line is centred on the boxes; the label hangs below it rather than
	   sharing a flex column, which previously pushed the line above centre. */
	.channel {
		position: relative;
		min-width: 7rem;
	}

	.channel svg {
		width: 100%;
		height: 24px;
		overflow: visible;
	}

	/* No stroke-dasharray here: DrawSVG animates by rewriting dasharray and
	   dashoffset, so a dashed style would be overwritten mid-tween. */
	.channel-line {
		stroke: currentColor;
		stroke-width: 2;
		opacity: 0.65;
	}

	.channel-head {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.65;
	}

	.channel-label {
		position: absolute;
		top: calc(50% + 0.75rem);
		left: 0;
		right: 0;
		text-align: center;
		font-size: var(--deck-meta);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	/* Both states occupy the same cell so the swap is a crossfade in place with no
	   reflow, and the row's height is the taller of the two in both steps. */
	.synccall {
		display: grid;
	}

	.sync-state {
		grid-area: 1 / 1;
		font-size: var(--deck-body);
		max-width: 62rem;
	}

	.sync-before {
		opacity: 0.75;
	}

	/* Hidden in CSS as well as by the onMount set: onMount runs after the first
	   paint, so without this the after-state flashes on entry. */
	.sync-after {
		font-weight: 600;
		opacity: 0;
	}

	.response {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.85;
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

	/* Hidden in CSS, not just via GSAP: onMount runs after first paint, so a
	   JS-only resting state still flashes the final text for a frame. GSAP's
	   autoAlpha writes inline styles that override this when the step arrives. */
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

	/* Narrow screens: the three columns stack, and the horizontal event channel
	   would read as a stray line, so it is hidden and the label carries it. */
	@media (max-width: 760px) {
		.diagram {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}

		.channel {
			min-width: 0;
			flex-direction: row;
			gap: 0.5rem;
		}

		.channel svg {
			display: none;
		}

		.block {
			min-width: 0;
			width: 100%;
		}

		.queue {
			width: 100%;
		}
	}
</style>
