'use client';

/**
 * S3 — Moviation, 2023 (0:45).
 * The React port of `src/routes/talks/my-career/slides/MoviationSlide.svelte`.
 *
 * One question: what was delivered, and what was built to deliver it faster.
 *
 * THREE ROWS, ONE ADVANCE — same grammar as ModulabsSlide (rebuilt 2026-07-29).
 * The previous version listed the tooling as three `from -> to` text rows, which
 * named the artifacts and left the audience reading rather than seeing. Each row
 * is now a picture that changes: the manual state is on screen at step 0, and one
 * advance replaces it with what was generated.
 *
 * All three rows are the same story. Colors were re-edited by hand wherever they
 * appeared; translations were consumed as raw JSON with no type guarantee; every
 * form component was exported and imported individually. Same failure three
 * times — an artifact a human maintains by hand — and the same fix three times.
 *
 * Rows 1 and 3 collapse many into one, because that is what actually happened:
 * five hand-edited places became one token source, and per-form wiring became one
 * builder. Row 2 does not collapse, because nothing was reduced there — the JSON
 * stayed; what changed was that a typed layer was generated over it. Making that
 * row a collapse too would have been a tidier picture and a false one.
 *
 * The Flutter shell stays visible in both steps. It is the context every one of
 * those pages was built inside, not a beat of its own, and the bridge is the part
 * Brandon owned end to end.
 *
 * NO FLIP, NO DOM SWAP for anything animated. Both states of every row live in
 * the same grid cell from first paint and crossfade in place, which is only legal
 * because every cell is explicitly placed — grid auto-placement refuses to
 * overlap and would push the second state into implicit columns instead. That
 * exact bug broke the equivalent row on ModulabsSlide.
 *
 * PORT NOTE (tick): the Svelte original `await tick()`s inside `render()` after
 * assigning `generated`. The tween targets here are all in the DOM regardless of
 * `generated` (only caption text depends on it), so the port builds the timeline
 * in the same effect that sets the state — no commit needs to land first.
 *
 * STRICTMODE. Every set and the one timeline are created inside a
 * `gsap.context()` scoped to the slide root, so the mount cleanup reverts them
 * and the second mount starts clean. The `applied` ref guard makes the
 * double-invoked step effect re-enter safely.
 *
 * Every claim here has a verified row in facts.md § Moviation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import SlideVideo from '@/components/deck/SlideVideo';
import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

// Deliberately uneven fill percentages: five copies of one value, each edited
// on its own, drift apart. Even fills would show duplication without showing
// why duplication was the problem.
const swatches = [11, 5, 15, 8, 12];

// Four is enough to read as "several forms" without becoming a count the
// audience tries to interpret.
const forms = ['Sign-up', 'Booking', 'Profile', 'Payment'];

// Funding rounds stay off the slides by choice: they are the company's
// achievement, not the engineer's, and citing them reads as borrowed credit.
// The SITA liaison work stands on its own.
const notes = [
	'Roughly 5x faster to build a page',
	'Primary technical liaison on the SITA integration',
];

export default function MoviationSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);

	// Same guard ModulabsSlide carries, for the same reason: three sequenced
	// segments push this timeline past a second, which is long enough that
	// advancing and immediately retreating would leave two runs writing the
	// same properties until the first finished. Rehearsal does that
	// constantly. Only `.kill()` is needed off the handle, so it is typed
	// structurally rather than dragging in a GSAP namespace type.
	const running = useRef<{ kill: () => void } | null>(null);
	const videoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [generated, setGenerated] = useState(false);
	const [ready, setReady] = useState(false);

	// Held while the three rows change, so only one thing on screen moves.
	const [videoPaused, setVideoPaused] = useState(false);

	/** Everything GSAP touches goes through the slide's context, so one revert
	 *  undoes the whole slide on unmount. */
	const inContext = useCallback((body: () => void) => {
		const ctx = context.current;
		if (ctx) ctx.add(body);
		else body();
	}, []);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const loaded = await loadGsap();
			if (cancelled || !root.current) return;

			bundle.current = loaded;
			context.current = loaded.gsap.context(() => {
				const element = root.current!;
				// Step-0 resting state. Every after-state element is already in the
				// DOM; these only hide it, so returning to step 0 restores rather
				// than rebuilds.
				loaded.gsap.set(element.querySelectorAll('.after'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelectorAll('.after-span'), {
					scaleX: 0.32,
					transformOrigin: 'left center',
				});
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			running.current?.kill();
			running.current = null;
			if (videoTimer.current) clearTimeout(videoTimer.current);
			context.current?.revert();
			context.current = null;
			applied.current = -1;
		};
	}, []);

	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// Before anything is built. Killing mid-flight leaves elements at their
		// intermediate values, which is correct: the tweens below read current
		// state, so they carry on from wherever the interrupted run got to.
		running.current?.kill();
		if (videoTimer.current) clearTimeout(videoTimer.current);

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = step >= 1;

		setGenerated(want);

		if (!still) {
			setVideoPaused(true);
			videoTimer.current = setTimeout(() => setVideoPaused(false), 1250);
		}

		inContext(() => {
			// One timeline, three segments, lightly overlapped — sequenced so the
			// eye is led through the rows in the order they are narrated.
			// Simultaneous would be a flash rather than three changes.
			const timeline = loaded.gsap.timeline();
			running.current = timeline;

			['color', 'strings', 'forms'].forEach((row, i) => {
				const at = d ? i * 0.16 : 0;
				const scope = element.querySelector(`.row-${row}`);
				if (!scope) return;

				timeline.to(
					scope.querySelectorAll('.before'),
					{
						autoAlpha: want ? 0 : 1,
						duration: DURATION * d,
						stagger: 0.04 * d,
						ease: EASE,
					},
					at,
				);
				timeline.to(
					scope.querySelectorAll('.after'),
					{ autoAlpha: want ? 1 : 0, duration: DURATION * d, ease: EASE },
					at + (d ? 0.05 : 0),
				);
				// Only the collapsing rows have a span to grow; the strings row
				// swaps in place because nothing was reduced there.
				timeline.to(
					scope.querySelectorAll('.after-span'),
					{ scaleX: want ? 1 : 0.32, duration: DURATION * d, ease: EASE },
					at + (d ? 0.05 : 0),
				);
			});

			timeline.to(
				element.querySelectorAll('.note'),
				{
					autoAlpha: want ? 1 : 0,
					y: want ? 0 : 6,
					duration: DURATION * d,
					stagger: 0.07 * d,
					ease: EASE,
				},
				d ? 0.5 : 0,
			);
		});
	}, [animate, inContext, ready, step]);

	return (
		<section className="slide moviation" ref={root}>
			<header>
				<p className="company">Moviation &middot; 2023</p>
				{/*
					NOT "UAM reservation platform". That was the only headline in the deck
					that named an artifact instead of making a claim, and "UAM" is a term
					nobody outside the industry can decode — it means air taxi. It also
					described the video beside it while two thirds of the slide is about
					replacing hand-maintained files with generated ones, which the headline
					never touched. The product is named in the figcaption, where it belongs.

					"Korea's first" is on the submitted CV and is defensible, but it is
					dropped here by choice: the work stands without the superlative.
				*/}
				<h1>Generate it once, or fix it forever</h1>
			</header>

			{/* Recording and diagram are complementary, not redundant: the video proves
			    it shipped and shows what it does, while the diagram shows the one
			    thing the video cannot — that this UI is a web app running inside a
			    native shell. */}
			<div className="body">
				<figure className="media">
					<SlideVideo
						src="/talks/my-career/moviation"
						label="VONAER reservation flow: searching a departure point, picking it on the map, then choosing an arrival point"
						paused={videoPaused}
					/>
					{/* Carries the product now that the headline states the argument. "air
					    taxi" rather than "UAM" for the same reason the headline dropped it. */}
					<figcaption>VONAER &mdash; booking a seat on an air taxi</figcaption>
				</figure>

				<div className="detail">
					{/* Nesting carries the architecture: the web app literally sits inside
					    the shell, so the diagram is the sentence. Static in both steps. */}
					<div className="shell">
						<span className="shell-label">Flutter shell</span>
						<span className="inner">Next.js web app</span>
						{/* "the native–web bridge" was an appositive glossing the word right
						    before it, and the nesting already shows web-inside-native. */}
						<span className="bridge">JavaScript bridge &mdash; owned end to end</span>
					</div>

					<div className="changes">
						{/* 1 — Color. Many hand-edited places become one generated source. */}
						<div className="change">
							<p className="change-label">Color</p>
							<div className="stage">
								<div className="row row-color">
									{swatches.map((fill, i) => (
										<span
											className="cell before swatch"
											style={{
												gridColumn: i + 1,
												background: `color-mix(in srgb, currentColor ${fill}%, transparent)`,
											}}
											key={i}
										/>
									))}
									<span className="cell after after-span">
										Design tokens, generated in TypeScript
									</span>
								</div>
							</div>
							<p className="change-caption">
								{generated
									? 'One source. Change it once, everywhere.'
									: 'One value, five places, hand-edited.'}
							</p>
						</div>

						{/* 2 — i18n strings. Nothing collapses: a typed layer is generated
						    over JSON that stayed exactly where it was.

						    The label names i18n, not just "Strings". Brandon could not see
						    what the row was about from the picture alone, and he is the one
						    who built it — an audience seeing it for six seconds has no
						    chance. */}
						<div className="change">
							<p className="change-label">i18n strings</p>
							<div className="stage">
								<div className="row row-strings">
									<span className="cell before dashed">Translation JSON, read as-is</span>
									<span className="cell after">Typed accessors, generated over the same JSON</span>
								</div>
							</div>
							<p className="change-caption">
								{generated
									? 'A missing key now fails the build.'
									: 'A wrong key only showed up in the browser.'}
							</p>
						</div>

						{/* 3 — Forms. Per-form wiring becomes one builder. */}
						<div className="change">
							<p className="change-label">Forms</p>
							<div className="stage">
								<div className="row row-forms">
									{forms.map((form, i) => (
										<span
											className="cell before dashed small"
											style={{ gridColumn: i + 1 }}
											key={form}
										>
											{form}
										</span>
									))}
									<span className="cell after after-span">One declarative form builder</span>
								</div>
							</div>
							<p className="change-caption">
								{generated
									? 'A new form is a definition, not a file.'
									: 'Every form wired by hand, one at a time.'}
							</p>
						</div>
					</div>

					<ul className="notes">
						{notes.map((note) => (
							<li className="note" key={note}>
								{note}
							</li>
						))}
					</ul>
				</div>
			</div>
		</section>
	);
}
