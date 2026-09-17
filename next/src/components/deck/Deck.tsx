'use client';

/**
 * Deck — fullscreen, keyboard-driven slide runner. The React port of
 * `src/lib/components/deck/Deck.svelte`.
 *
 * WHAT: fullscreen overlay above the site chrome; owns two indices (which
 * slide, which step within it). Slides receive `step` and animate
 * themselves; the deck never touches their internals.
 *
 * STEP MODEL: a slide declares `steps: N`. ArrowRight walks steps first,
 * then moves to the next slide. Stepping backwards lands on the previous
 * slide's FIRST step, not its last — re-playing a morph backwards reads as
 * a mistake to an audience; re-playing it forwards reads as deliberate.
 *
 * PRINT MODE: `?print` renders every slide stacked at its final step with
 * animation disabled, one per printed page. The PDF fallback for a venue
 * where the laptop cannot drive the projector.
 *
 * WHAT CHANGED (Svelte → React), and nothing else:
 * - `$state` → `useState`; `$derived` → plain expressions per render.
 * - `onMount` restore → isomorphic layout effect (layout on the client so
 *   the restore lands before first paint, passive during the static export
 *   so React does not warn about `useLayoutEffect` in SSR).
 * - `page.url.searchParams` → a one-shot `window.location.search` read in
 *   that same mount effect. Deliberately NOT `useSearchParams()`: the hook
 *   suspends at prerender, which would leave the deck body out of the
 *   exported HTML (the Svelte baseline prerenders the live slide content —
 *   only the URL restore is mount-deferred there too). Until the mount
 *   effect runs, `printMode` is false and the live deck renders, exactly
 *   like the baseline's prerender-then-mount sequence.
 * - SvelteKit `replaceState` → `window.history.replaceState` with the same
 *   href guard (replace, never push: Back mid-talk must leave the deck, not
 *   walk back one step at a time). `useRouter().replace` would route-navigate
 *   and re-render; the history call mirrors Svelte exactly.
 * - `<svelte:window onkeydown>` → a window listener added in an effect.
 * - `<svelte:head>` (title + robots) lives in the route's `generateMetadata`,
 *   not here — see `next/app/(en)/talks/my-career/page.tsx`.
 * - `{#key index}` remount → `key={current.id}` on the slide body: a new
 *   slide remounts, a step advance does not.
 */

import { useEffect, useLayoutEffect, useState } from 'react';

import type { DeckSlide } from '@/deck/types';

/** A layout effect on the client and a passive one during the static export. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Props {
	slides: DeckSlide[];
	title?: string;
}

function clamp(value: number, max: number): number {
	return Math.min(Math.max(value, 0), Math.max(max, 0));
}

export default function Deck({ slides, title = 'Presentation' }: Props) {
	const [index, setIndex] = useState(0);
	const [step, setStep] = useState(0);

	// Position lives in the URL (?page=2&step=3), one-based so it reads the way
	// a person counts. A reload lands where you were; any slide links directly.
	const [restored, setRestored] = useState(false);

	// The live query, once the page is live in a browser. Null during the
	// static prerender — and that null is load-bearing: it renders the live
	// deck (slide content included) into the exported HTML, the way the
	// Svelte baseline prerenders before onMount restores position.
	const [query, setQuery] = useState<URLSearchParams | null>(null);

	// Reading searchParams during prerender throws — the whole route is
	// statically generated, so the print view only resolves once live.
	// Until the mount effect below runs, this is false and the live deck
	// renders (its slide content lands in the exported HTML).
	const printMode = query !== null && query.has('print');
	const current = slides[index];
	const stepCount = current?.steps ?? 1;
	const progress = (index + 1) / slides.length;

	function next() {
		if (step < stepCount - 1) {
			setStep(step + 1);
			return;
		}
		if (index < slides.length - 1) {
			setIndex(index + 1);
			setStep(0);
		}
	}

	function prev() {
		if (step > 0) {
			setStep(step - 1);
			return;
		}
		if (index > 0) {
			setIndex(index - 1);
			setStep(0);
		}
	}

	function go(target: number) {
		setIndex(clamp(target, slides.length - 1));
		setStep(0);
	}

	const atStart = index === 0 && step === 0;
	const atEnd = index === slides.length - 1 && step === stepCount - 1;

	// Restore before the first paint the user sees. Runs on mount rather than
	// at init because searchParams cannot be read while prerendering.
	useIsomorphicLayoutEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setQuery(params);

		const wantedPage = Number(params.get('page'));
		const wantedStep = Number(params.get('step'));

		if (Number.isFinite(wantedPage) && wantedPage > 0) {
			const nextIndex = clamp(Math.trunc(wantedPage) - 1, slides.length - 1);
			setIndex(nextIndex);
			if (Number.isFinite(wantedStep) && wantedStep > 0) {
				setStep(clamp(Math.trunc(wantedStep) - 1, (slides[nextIndex]?.steps ?? 1) - 1));
			}
		} else if (Number.isFinite(wantedStep) && wantedStep > 0) {
			setStep(clamp(Math.trunc(wantedStep) - 1, (slides[index]?.steps ?? 1) - 1));
		}

		setRestored(true);
	}, []);

	// Mirror position back into the URL. Guard the write: location updates
	// after replaceState, which would re-run this effect unguarded into a loop.
	useEffect(() => {
		if (!restored || printMode) return;

		const target = new URL(window.location.href);
		target.searchParams.set('page', String(index + 1));
		target.searchParams.set('step', String(step + 1));

		if (target.href !== window.location.href) {
			window.history.replaceState(window.history.state, '', target);
		}
	}, [index, step, restored, printMode]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			// The site layout owns Cmd/Ctrl chords (palette, search). Only claim
			// bare keys so the two handlers never collide.
			if (event.metaKey || event.ctrlKey || event.altKey) return;

			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;

			// A focused control already handles Space and Enter itself. Without
			// this, Space would fire the button AND this handler, advancing two
			// steps.
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

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});

	if (printMode) {
		// PDF fallback: every slide, final step, no motion, one per page.
		return (
			<div className="print-deck" id="main-content" tabIndex={-1}>
				{slides.map((slide) => {
					const Body = slide.component;
					return (
						<section className="print-slide" key={slide.id}>
							<Body step={(slide.steps ?? 1) - 1} animate={false} />
						</section>
					);
				})}
			</div>
		);
	}

	const Body = current.component;
	return (
		<div className="deck" role="application" aria-label={title}>
			{/* Satisfies the layout's skip-to-content link and gives keyboard users a
			    landing target when they jump past the site chrome. */}
			<div className="deck-stage" id="main-content" tabIndex={-1}>
				<Body key={current.id} step={step} animate={true} />
			</div>

			{/* Progress rail. Deliberately quiet: a presenter aid, not decoration. */}
			<nav className="deck-rail" aria-label="Slide navigation">
				<div className="deck-bar" style={{ '--progress': progress } as React.CSSProperties} />
				<div className="deck-meta">
					<span className="deck-label">{current.label}</span>

					{/* Explicit controls rather than click-anywhere: the diagrams are
					    the point of the deck, and a stray click on one should not
					    advance it. */}
					<div className="deck-controls">
						<button type="button" onClick={prev} disabled={atStart} aria-label="Previous step">
							&larr; Prev
						</button>
						<span className="deck-count">
							{index + 1} / {slides.length}
							{stepCount > 1 && (
								// Labelled, because two bare fractions side by side read as
								// one number over another rather than slide-then-step.
								<span className="deck-step">
									· step {step + 1}/{stepCount}
								</span>
							)}
						</span>
						<button type="button" onClick={next} disabled={atEnd} aria-label="Next step">
							Next &rarr;
						</button>
					</div>
				</div>
			</nav>
		</div>
	);
}
