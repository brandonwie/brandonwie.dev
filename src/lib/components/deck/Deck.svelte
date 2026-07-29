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
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
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

	// Position lives in the URL (?page=2&step=3), one-based so it reads the way a
	// person counts. Two things fall out of that: a reload lands where you were
	// rather than back at slide 1, and any slide can be linked to directly.
	let restored = $state(false);

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

	const atStart = $derived(index === 0 && step === 0);
	const atEnd = $derived(index === slides.length - 1 && step === stepCount - 1);

	function clamp(value: number, max: number): number {
		return Math.min(Math.max(value, 0), Math.max(max, 0));
	}

	// Restore before the first paint the user sees. Runs in onMount rather than
	// at init because searchParams cannot be read while prerendering.
	onMount(() => {
		const params = page.url.searchParams;
		const wantedPage = Number(params.get('page'));
		const wantedStep = Number(params.get('step'));

		if (Number.isFinite(wantedPage) && wantedPage > 0) {
			index = clamp(Math.trunc(wantedPage) - 1, slides.length - 1);
		}
		if (Number.isFinite(wantedStep) && wantedStep > 0) {
			step = clamp(Math.trunc(wantedStep) - 1, (slides[index]?.steps ?? 1) - 1);
		}

		restored = true;
	});

	// Mirror position back into the URL. replaceState rather than pushState: a
	// presenter pressing Back mid-talk should leave the deck, not walk back one
	// step at a time through every advance they made.
	$effect(() => {
		if (!browser || !restored || printMode) return;

		const target = new URL(page.url);
		target.searchParams.set('page', String(index + 1));
		target.searchParams.set('step', String(step + 1));

		// Guard the write: page.url updates after replaceState, which re-runs this
		// effect, and an unguarded call would loop.
		if (target.href !== page.url.href) {
			replaceState(target, page.state);
		}
	});

	function onKeyDown(event: KeyboardEvent) {
		// The site layout owns Cmd/Ctrl chords (palette, search). Only claim bare
		// keys so the two handlers never collide.
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const target = event.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;

		// A focused control already handles Space and Enter itself. Without this,
		// Space would fire the button AND this handler, advancing two steps.
		if (target?.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;

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
	<!--
		PUBLISH SURFACE, SETTLED 2026-07-29 (Brandon): unlisted, not hidden. The
		route stays reachable by anyone holding the link and stays out of every
		discovery surface — no nav entry, no sitemap row, no search-index entry, no
		inbound link anywhere in the site.

		This meta tag is what does the work, and it only works BECAUSE robots.txt
		still allows crawling. Adding `Disallow: /talks/` would be the intuitive
		"more private" move and it would backfire: a disallowed URL cannot be
		fetched, so the crawler never reads this tag, and the bare URL can still be
		listed from an external link with no way to remove it. Allow the crawl, deny
		the index. Do not "harden" robots.txt here.
	-->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={onKeyDown} />

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

				<!-- Explicit controls rather than click-anywhere: the diagrams are the
				     point of the deck, and a stray click on one should not advance it. -->
				<div class="deck-controls">
					<button type="button" onclick={prev} disabled={atStart} aria-label="Previous step">
						&larr; Prev
					</button>
					<span class="deck-count">
						{index + 1} / {slides.length}
						{#if stepCount > 1}
							<!-- Labelled, because two bare fractions side by side read as one
							     number over another rather than slide-then-step. -->
							<span class="deck-step">· step {step + 1}/{stepCount}</span>
						{/if}
					</span>
					<button type="button" onclick={next} disabled={atEnd} aria-label="Next step">
						Next &rarr;
					</button>
				</div>
			</div>
		</nav>
	</div>
{/if}

<style>
	/* Fixed overlay rather than a layout reset — the deck covers the site chrome
	   without modifying any shared layout file. */
	/* Shared type scale. Slides read these rather than sizing themselves, so
	   sixteen slides stay one artifact and a scale change is one edit.
	   Sized for a projected room: the floor values assume someone is reading
	   this from the back, not from a laptop at arm's length. */
	.deck,
	.print-deck {
		--deck-title: clamp(2rem, 4.4vw, 3.5rem);
		--deck-subtitle: clamp(1rem, 1.7vw, 1.35rem);
		--deck-heading: clamp(1.15rem, 2vw, 1.6rem);
		--deck-body: clamp(1rem, 1.5vw, 1.25rem);
		--deck-meta: clamp(0.8rem, 1.15vw, 1rem);
	}

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
		font-size: var(--deck-meta);
		letter-spacing: 0.04em;
		opacity: 0.55;
		font-variant-numeric: tabular-nums;
	}

	.deck-step {
		opacity: 0.7;
	}

	.deck-controls {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.deck-controls button {
		background: none;
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 4px;
		color: inherit;
		font: inherit;
		font-size: var(--deck-meta);
		letter-spacing: 0.04em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: border-color 160ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.deck-controls button:hover:not(:disabled) {
		border-color: currentColor;
	}

	.deck-controls button:disabled {
		opacity: 0.3;
		cursor: default;
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
