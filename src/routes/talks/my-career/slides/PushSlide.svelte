<!--
  S8 — Sync: polling → push (0:45) · cut-3

  The change is a reversal of initiative. Before, the client asked on a timer
  and nothing existed between two asks. After, the source announces the change
  and it arrives when it happens.

  BOTH ARROWS FLIP AND NOTHING ELSE MOVES. The three boxes hold their exact
  positions across the step; only the connectors between them change direction
  and label. That is the entire animation, and it is the entire point.

  GOOGLE ONLY. facts.md § Do not say is explicit: the push mechanism is
  Google-only. Apple-originated events are normalized into a Google-centric
  model, which is a different claim and does not belong on this slide. Do NOT
  write "Apple push" here or anywhere in the deck.

  The WebSocket-over-SSE line is Brandon's own design reasoning rather than a
  CV claim, which facts.md permits stating as a decision. Keep it phrased as a
  choice he made, not as a benchmark he measured.

  PUBLISH-SAFE: webhook plus WebSocket is the shape already described on the
  submitted CV, with no internal detail beyond it. Keep it that way — the repo
  this lives in is public.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const notes = [
		'Polling removed entirely — updates arrive when the change happens',
		'WebSocket rather than SSE, chosen for realtime-note scalability',
	];

	let root = $state<HTMLElement>();
	let pushed = $state(false);
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
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
		if (!root) return;

		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = target >= 1;

		if (want !== pushed) {
			pushed = want;
			await tick();

			// The arrows cross-fade in place rather than sliding. A connector that
			// travels would suggest something moved through the system; what
			// actually changed is which end starts the conversation.
			const links = root.querySelectorAll('.link-swap');
			if (links.length && !still) {
				gsap.fromTo(
					links,
					{ autoAlpha: 0, scale: 0.9 },
					{ autoAlpha: 1, scale: 1, duration: DURATION, stagger: 0.1, ease: EASE },
				);
			}
		}

		await tick();

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: want ? 1 : 0,
			y: want ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: want ? DURATION * 0.9 * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA</p>
		<h1>From asking to being told</h1>
		<p class="state">
			{#if pushed}
				After &mdash; Google announces the change, and it reaches the client as it happens
			{:else}
				Before &mdash; the client asked on a timer, and nothing existed between asks
			{/if}
		</p>
	</header>

	<!-- Five fixed columns: three nodes and two connectors. The nodes never move;
	     only the connectors change direction and label. -->
	<div class="chain">
		<div class="node">
			<span class="node-title">Google Calendar</span>
		</div>

		{#if pushed}
			<div class="link link-swap">
				<span class="glyph">&rarr;</span>
				<span class="link-label">webhook</span>
			</div>
		{:else}
			<div class="link link-swap">
				<span class="glyph">&larr;</span>
				<span class="link-label">fetched on request</span>
			</div>
		{/if}

		<div class="node">
			<span class="node-title">Server</span>
		</div>

		{#if pushed}
			<div class="link link-swap">
				<span class="glyph">&rarr;</span>
				<span class="link-label">WebSocket push</span>
			</div>
		{:else}
			<div class="link link-swap">
				<span class="glyph">&larr;</span>
				<span class="link-label">polled on a timer</span>
			</div>
		{/if}

		<div class="node">
			<span class="node-title">Client</span>
		</div>
	</div>

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
	}

	.chain {
		display: grid;
		/* Five columns: node, connector, node, connector, node. */
		grid-template-columns: minmax(0, 14rem) auto minmax(0, 14rem) auto minmax(0, 14rem);
		justify-content: start;
		align-items: stretch;
		gap: 0;
	}

	.node {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, currentColor 6%, transparent);
		padding: clamp(0.7rem, 1.8vw, 1.1rem);
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: clamp(4rem, 9vh, 5.5rem);
	}

	.node-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	/* Reserved width sized for the longest label in either state, so the nodes
	   sit at identical x positions before and after the flip. */
	.link {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		width: clamp(8rem, 15vw, 12rem);
		padding: 0 0.5rem;
	}

	.glyph {
		font-size: var(--deck-heading);
		opacity: 0.5;
		line-height: 1;
	}

	.link-label {
		font-size: var(--deck-meta);
		opacity: 0.55;
		text-align: center;
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

	@media (max-width: 900px) {
		.chain {
			grid-template-columns: minmax(0, 1fr);
			row-gap: 0.4rem;
		}

		.link {
			width: auto;
		}

		/* The arrows point down the column at this size; sideways glyphs in a
		   vertical stack read as the wrong direction. */
		.glyph {
			transform: rotate(90deg);
		}
	}
</style>
