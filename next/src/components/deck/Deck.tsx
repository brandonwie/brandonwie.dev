'use client';

/**
 * Deck — fullscreen, keyboard-driven slide runner. The React port of
 * `src/lib/components/deck/Deck.svelte`.
 *
 * WHAT: owns two indices (which slide, which step within it). Slides
 * receive `step` and animate themselves; the deck never touches their
 * internals.
 *
 * TWO VIEWS (Phosphor Fade, D8): presenting — the default, as in
 * production: a full-viewport overlay above all site chrome, no frames, no
 * prompt, the page never scrolls. Escape or `[ exit ]` switches to browsing —
 * the deck inside the terminal shell as a `deck play` prompt, the slide frame
 * and a rail frame (20-cell meter, label, controls) — and `[ present ]`
 * switches back. Keys, URL sync and print behave the same in both.
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
 * - `<svelte:window onkeydown>` → a window listener added in an effect. It
 *   claims a key only when focus is inside the deck or nowhere (body), so a
 *   key pressed on the shell's chrome (status line, title bar, footer,
 *   palette) keeps its own default and never moves the slide.
 * - `<svelte:head>` (title + robots) lives in the route's `generateMetadata`,
 *   not here — see `next/app/(en)/talks/my-career/page.tsx`.
 * - `{#key index}` remount → `key={current.id}` on the slide body: a new
 *   slide remounts, a step advance does not.
 */

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { DeckSlide } from '@/deck/types';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';

/** A layout effect on the client and a passive one during the static export. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Props {
	slides: DeckSlide[];
	title?: string;
}

function clamp(value: number, max: number): number {
	return Math.min(Math.max(value, 0), Math.max(max, 0));
}

/** Two-digit slide numbers for the frame title (`slide 02/20`). */
function pad(value: number): string {
	return String(value).padStart(2, '0');
}

/**
 * `[███░░░…]` — one cell per slide, filled through the current one. The cells
 * are decoration; the progressbar role carries the position for assistive
 * tech, and the counter beside it says the same thing in text.
 */
function DeckMeter({ index, total }: { index: number; total: number }) {
	return (
		<div
			className="deck-meter term-meter"
			role="progressbar"
			aria-label="Slide progress"
			aria-valuemin={1}
			aria-valuemax={total}
			aria-valuenow={index + 1}
			aria-valuetext={`${index + 1} / ${total}`}
		>
			<span aria-hidden="true">
				{'█'.repeat(index + 1)}
				<span className="off">{'░'.repeat(Math.max(total - index - 1, 0))}</span>
			</span>
		</div>
	);
}

export default function Deck({ slides, title = 'Presentation' }: Props) {
	const [index, setIndex] = useState(0);
	const [step, setStep] = useState(0);
	const cwd = cwdFor(usePathname() ?? '/');

	// Presenting (D8): production's full-viewport overlay above every piece of
	// site chrome. ON by default, so a fresh load or a deep link opens straight
	// into it — and the static prerender renders it too, so the framed view
	// never flashes first. Escape or `[ exit ]` turns it off for the shell
	// view; `[ present ]` turns it back on.
	const [presenting, setPresenting] = useState(true);
	const rootRef = useRef<HTMLDivElement>(null);

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

			// Only keys aimed at the deck: focus inside it, or on an element
			// that encloses it. The enclosing case covers nothing focused (the
			// event targets body or html) and the shell's `main#main-content`,
			// which takes focus after "Skip to content". A key on the shell's
			// chrome — a status-line link, the title bar, the footer, the
			// palette — targets a sibling branch, not an ancestor, so it keeps
			// its own default and leaves the slide alone.
			const root = rootRef.current;
			const unfocused = target === document.body || target === document.documentElement;
			const aimed = !!root && !!target && (root.contains(target) || target.contains(root));
			if (!unfocused && !aimed) return;

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
				case 'Escape':
					// Only while presenting: leaves the overlay for the shell view.
					if (presenting) {
						event.preventDefault();
						setPresenting(false);
					}
					break;
			}
		}

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});

	if (printMode) {
		// PDF fallback: every slide, final step, no motion, one per page.
		return (
			<div className="print-deck" tabIndex={-1}>
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
		<div
			ref={rootRef}
			className={presenting ? 'deck is-presenting' : 'deck'}
			role="application"
			aria-label={title}
		>
			{/* The URL query as a shell command; browsing only. */}
			{!presenting && (
				<TermPrompt
					className="deck-ps1"
					cwd={cwd}
					command="deck play"
					flags={`--page ${index + 1} --step ${step + 1}`}
				/>
			)}

			{/* The slide frame (browsing only — presenting is frameless, like
			    production). The shell's <main id="main-content"> is the
			    skip-link target, so the stage keeps only its tabIndex landing.
			    The body stays the stage's first element child; the frame title
			    follows it in the DOM and is drawn into the border by CSS. */}
			<div className={presenting ? 'deck-stage' : 'deck-stage term-frame'} tabIndex={-1}>
				<Body key={current.id} step={step} animate={true} />
				{!presenting && (
					<p className="term-frame__title deck-frame-title" aria-hidden="true">
						slide {pad(index + 1)}/{pad(slides.length)} · {current.label}
						{stepCount > 1 && (
							<span className="dim">
								{' '}
								· step {step + 1}/{stepCount}
							</span>
						)}
					</p>
				)}
			</div>

			{/* Progress rail. Deliberately quiet: a presenter aid, not decoration. */}
			<nav
				className={presenting ? 'deck-rail' : 'deck-rail term-frame'}
				aria-label="Slide navigation"
			>
				<DeckMeter index={index} total={slides.length} />
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
						<button
							type="button"
							className="deck-present"
							onClick={() => setPresenting(!presenting)}
						>
							{presenting ? 'exit' : 'present'}
						</button>
					</div>
				</div>
			</nav>
		</div>
	);
}
