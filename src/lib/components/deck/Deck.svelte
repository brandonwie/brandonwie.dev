<!--
  Deck.svelte — presentation shell
  ================================

  WHAT: Fullscreen, keyboard-driven slide runner.
  WHY:  Talks need to escape the site chrome (header/footer) and advance by
        keypress, without pulling in a slide framework that would fight Svelte
        for DOM ownership.
  HOW:  Fixed overlay above the layout. Owns two indices — which slide, and
        which step within that slide. Slides receive `step` and animate
        themselves; the deck never touches their internals.

  STEP MODEL: a slide declares `steps: N`. ArrowRight walks steps first, then
  moves to the next slide. This is what lets one architecture diagram morph
  through several states instead of becoming several near-identical slides.

  PRINT MODE: `?print` renders every slide stacked at its final step with
  animation disabled, one per printed page. That is the PDF fallback for a
  venue where the laptop cannot drive the projector.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import type { DeckSlide } from './types';

	let {
		slides,
		title = 'Presentation',
	}: {
		slides: DeckSlide[];
		title?: string;
	} = $props();

	let index = $state(0);
	let step = $state(0);

	// `browser &&` short-circuits before `searchParams` is touched. Reading it
	// during prerender throws — the whole route is statically generated, so the
	// print view can only be resolved once the page is live in a browser.
	const printMode = $derived(browser && page.url.searchParams.has('print'));
	const current = $derived(slides[index]);
	const stepCount = $derived(current?.steps ?? 1);
	const progress = $derived((index + 1) / slides.length);

	function next() {
		if (step < stepCount - 1) {
			step += 1;
			return;
		}
		if (index < slides.length - 1) {
			index += 1;
			step = 0;
		}
	}

	function prev() {
		// Stepping backwards lands on the previous slide's FIRST step rather than
		// its last. Re-playing a morph backwards reads as a mistake to an audience;
		// re-playing it forwards reads as deliberate.
		if (step > 0) {
			step -= 1;
			return;
		}
		if (index > 0) {
			index -= 1;
			step = 0;
		}
	}

	function go(target: number) {
		index = Math.min(Math.max(target, 0), slides.length - 1);
		step = 0;
	}

	// Click advances one step, same as ArrowRight. A presenter driving from a
	// clicker or trackpad gets the same one-change-per-input control as the
	// keyboard, which is what makes it possible to land each animation on the
	// sentence it belongs to.
	function onClick() {
		if (printMode) return;
		next();
	}

	function onKeyDown(event: KeyboardEvent) {
		// The site layout owns Cmd/Ctrl chords (palette, search). Only claim bare
		// keys so the two handlers never collide.
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const target = event.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;

		switch (event.key) {
			case 'ArrowRight':
			case 'PageDown':
			case ' ':
				event.preventDefault();
				next();
				break;
			case 'ArrowLeft':
			case 'PageUp':
				event.preventDefault();
				prev();
				break;
			case 'Home':
				event.preventDefault();
				go(0);
				break;
			case 'End':
				event.preventDefault();
				go(slides.length - 1);
				break;
		}
	}
</script>

<svelte:head>
	<title>{title}</title>
	<!-- Not for search engines until the publish surface is decided. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={onKeyDown} onclick={onClick} />

{#if printMode}
	<!-- PDF fallback: every slide, final step, no motion, one per page. -->
	<div class="print-deck" id="main-content" tabindex="-1">
		{#each slides as slide (slide.id)}
			{@const Body = slide.component}
			<section class="print-slide">
				<Body step={(slide.steps ?? 1) - 1} animate={false} />
			</section>
		{/each}
	</div>
{:else}
	<div class="deck" role="application" aria-label={title}>
		<!-- Satisfies the layout's skip-to-content link and gives keyboard users a
		     landing target when they jump past the site chrome. -->
		<div class="deck-stage" id="main-content" tabindex="-1">
			{#key index}
				{@const Body = current.component}
				<Body {step} animate={true} />
			{/key}
		</div>

		<!-- Progress rail. Deliberately quiet: a presenter aid, not decoration. -->
		<nav class="deck-rail" aria-label="Slide navigation">
			<div class="deck-bar" style="--progress: {progress}"></div>
			<div class="deck-meta">
				<span class="deck-label">{current.label}</span>
				<span class="deck-count">
					{index + 1} / {slides.length}
					{#if stepCount > 1}
						<!-- Labelled, because two bare fractions side by side read as one
						     number over another rather than slide-then-step. -->
						<span class="deck-step">· step {step + 1}/{stepCount}</span>
					{/if}
				</span>
			</div>
		</nav>
	</div>
{/if}

<style>
	/* Fixed overlay rather than a layout reset — the deck covers the site chrome
	   without modifying any shared layout file. */
	.deck {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: flex;
		flex-direction: column;
		background: var(--color-bg, #0d0d0d);
		color: var(--color-ink, #e8e8e8);
		overflow: hidden;
	}

	.deck-stage {
		flex: 1;
		display: grid;
		place-items: center;
		padding: clamp(1.5rem, 4vw, 4rem);
		min-height: 0;
	}

	.deck-rail {
		flex: none;
		padding: 0 clamp(1.5rem, 4vw, 4rem) 1.25rem;
	}

	.deck-bar {
		height: 2px;
		width: 100%;
		background: color-mix(in srgb, currentColor 15%, transparent);
		position: relative;
		overflow: hidden;
	}

	.deck-bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--progress) * 100%);
		background: currentColor;
		opacity: 0.55;
		/* Single easing curve, deck-wide. */
		transition: width 320ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.deck-meta {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 0.6rem;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		opacity: 0.55;
		font-variant-numeric: tabular-nums;
	}

	.deck-step {
		opacity: 0.7;
	}

	/* Print / PDF export */
	.print-deck {
		background: #fff;
		color: #111;
	}

	.print-slide {
		display: grid;
		place-items: center;
		min-height: 100vh;
		padding: 2rem;
		break-after: page;
	}

	@media print {
		.print-slide {
			min-height: auto;
			height: 100vh;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.deck-bar::after {
			transition: none;
		}
	}
</style>
