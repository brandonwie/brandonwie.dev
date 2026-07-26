<!--
  S7 — Sync: coupling → event-driven (0:45)

  The single most important morph in the deck, and the beat where the reasoning
  gets stated rather than just the outcome.

  The animation carries exactly one change: the queue module leaves the block
  module. Everything else on screen holds still so the audience knows where to
  look. That is the whole design rule.

  Claims here are at CV wording (see facts.md). No throughput number on this
  slide — that belongs to S9.
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
		'Separation of concerns between request handling and sync work',
		'Shaped so a future service split is possible, not blocked',
	];

	onMount(async () => {
		const { gsap } = await loadGsap();

		// Pin the resting state before the first render pass. Without this the
		// notes mount visible and only get faded out once GSAP loads, so entering
		// the slide flashed the final step's text.
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
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
		<h1>Decoupling the sync queue</h1>
		<!--
			The subtitle must not outrun the diagram. "Fire and forget" is only true
			once the response no longer waits, so it appears at that step and not
			when the box first moves.
		-->
		<p class="state" class:after={decoupled}>
			{#if respondsImmediately}
				After — event-driven, fire and forget
			{:else if decoupled}
				After — the queue owns its own lifecycle
			{:else}
				Before — queue injected into the block module, tightly coupled
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
