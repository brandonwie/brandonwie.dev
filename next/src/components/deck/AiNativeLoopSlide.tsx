'use client';

/**
 * S12 — 3B, the AI-native loop (1:00) · never cut.
 * The React port of `src/routes/talks/my-career/slides/AiNativeLoopSlide.svelte`.
 *
 * The slide that answers a prompt-engineering scope line in a role
 * description, so it has to read as a system rather than as enthusiasm for a
 * tool. Kept audience-neutral on purpose: it argues that agent work needs
 * gates, which is true wherever it is shown. Role-specific scope stays in the
 * private task folder, never in this repo.
 *
 * THE POINT IS THE GATES, NOT THE AUTOMATION. Six stages run as a loop; three
 * of them stay human. That is the claim worth making in a room that has to
 * trust the output — anyone can show a pipeline of agents, and a pipeline of
 * agents with nobody in it is the thing engineers are actually worried about.
 * Step 1 lands the gates.
 *
 * NO PULSE. The storyboard wanted the loop to "pulse at the current stage",
 * which needs the presenter to drive a cursor through six positions — that is
 * six states, and DeckSlide.steps is 1 | 2 by type. Dropped deliberately, not
 * forgotten. The return bracket carries the loop reading on its own.
 *
 * CSS, NOT SVG, for the return path — same reason ArcSlide gives for its
 * rail: an SVG viewBox cannot track a CSS grid's gaps across breakpoints
 * without either drifting off the cards or distorting the stroke under
 * preserveAspectRatio="none".
 *
 * Claude since June 2025 with Opus 4 — facts.md C5. NOT April 2025;
 * interview-facts.md and the LinkedIn About are both stale on this.
 *
 * PUBLISH-SAFE: 3B is Brandon's own repo and every stage name here is a repo
 * convention, not employer detail. Deliberately no example spec on the slide
 * — both good demo candidates are MOBA-internal (facts.md § 3B).
 *
 * PORT NOTE: persistent DOM, one timeline per applied step — the source
 * builds a fresh `gsap.timeline()` each render, so the port kills the prior
 * tracked timeline before creating its replacement; a stale mid-flight
 * timeline surviving a reversal would overwrite the restored state. Svelte's
 * `await tick()` has no work to do here (nothing the timeline touches is
 * conditional), so it is dropped with the other ports.
 *
 * STRICTMODE. Every set and the timeline are created inside a
 * `gsap.context()` scoped to the slide root, so the mount cleanup reverts
 * them and the second mount starts clean.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

const stages = [
	{ name: 'Spec', detail: 'A human writes it. Agents never touch it.', human: true },
	{
		name: 'task-starter',
		detail: 'Investigate, scope with the human, issue, branch, plan.',
		human: true,
	},
	{
		name: 'Topology',
		detail: 'Master and reviewer, architect and workers, or a singleton.',
		human: false,
	},
	{ name: 'Review loop', detail: 'Automated review iterates on the PR.', human: false },
	{ name: 'Merge', detail: 'A human reads the diff and merges it.', human: true },
	{
		name: '/wrap',
		detail: 'Lessons become notes, published behind a privacy gate.',
		human: false,
	},
];

export default function AiNativeLoopSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	const running = useRef<Array<{ kill: () => void }>>([]);

	const [ready, setReady] = useState(false);

	/** Everything GSAP touches goes through the slide's context, so one revert
	 *  undoes the whole slide on unmount. */
	const inContext = useCallback((body: () => void) => {
		const ctx = context.current;
		if (ctx) ctx.add(body);
		else body();
	}, []);

	const track = useCallback(<T extends { kill: () => void }>(handle: T): T => {
		running.current.push(handle);
		return handle;
	}, []);

	const killRunning = useCallback(() => {
		for (const handle of running.current) handle.kill();
		running.current = [];
	}, []);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const loaded = await loadGsap();
			if (cancelled || !root.current) return;

			bundle.current = loaded;
			context.current = loaded.gsap.context(() => {
				const element = root.current!;
				loaded.gsap.set(element.querySelector('.rail-line'), {
					scaleX: 0,
					transformOrigin: 'left center',
				});
				loaded.gsap.set(element.querySelectorAll('.stage'), { autoAlpha: 0, y: 8 });
				loaded.gsap.set(element.querySelector('.ret-down'), {
					scaleY: 0,
					transformOrigin: 'top center',
				});
				loaded.gsap.set(element.querySelector('.ret-across'), {
					scaleX: 0,
					transformOrigin: 'right center',
				});
				loaded.gsap.set(element.querySelector('.ret-up'), {
					scaleY: 0,
					transformOrigin: 'bottom center',
				});
				loaded.gsap.set(element.querySelector('.ret-head'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelectorAll('.ret-label, .vendors'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelectorAll('.gate'), { autoAlpha: 0, y: 4 });
				loaded.gsap.set(element.querySelector('.gate-note'), { autoAlpha: 0, y: 6 });
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			killRunning();
			context.current?.revert();
			context.current = null;
			// Not the bundle: the loader memo is module-scoped and shared, and
			// clearing this ref would only force a second await on remount.
			applied.current = -1;
		};
	}, [killRunning]);

	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const d = !animate || reducedMotion() ? 0 : 1;
		const want = step >= 1;

		killRunning();

		inContext(() => {
			const timeline = track(loaded.gsap.timeline());

			// Step 0 draws the loop once. Re-entering step 0 from step 1 must
			// not redraw it, so these all animate to their finished state either
			// way.
			timeline.to(element.querySelector('.rail-line'), {
				scaleX: 1,
				duration: 0.6 * d,
				ease: EASE,
			});

			timeline.to(
				element.querySelectorAll('.stage'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.07 * d, ease: EASE },
				d ? '-=0.3' : 0,
			);

			// The return path, drawn in the direction it flows: down off the
			// last stage, back across, up into the first. This is the whole
			// reason the slide is a loop and not a list.
			timeline.to(
				element.querySelector('.ret-down'),
				{ scaleY: 1, duration: 0.18 * d, ease: EASE },
				d ? '-=0.1' : 0,
			);
			timeline.to(element.querySelector('.ret-across'), {
				scaleX: 1,
				duration: 0.45 * d,
				ease: EASE,
			});
			timeline.to(element.querySelector('.ret-up'), {
				scaleY: 1,
				duration: 0.18 * d,
				ease: EASE,
			});
			timeline.to(element.querySelector('.ret-head'), {
				autoAlpha: 1,
				duration: 0.2 * d,
				ease: EASE,
			});
			// The loop caption and the vendor-span line arrive together, both in
			// step 0. Deliberately NOT a fan diagram: a fan shows today's
			// topology and cannot show a sequence, and the brief's ask is
			// temporal ("history of it like how I improved system overtime").
			// The arc is narrated; this line only states the span. Text also
			// needs no markup, no CSS, and no breakpoint rule in a slide whose
			// grid already collapses 6 -> 3 columns at 900px.
			timeline.to(
				element.querySelectorAll('.ret-label, .vendors'),
				{ autoAlpha: 1, duration: DURATION * d, stagger: 0.06 * d, ease: EASE },
				d ? '-=0.3' : 0,
			);

			// Step 1: the three gates that stay human.
			timeline.to(
				element.querySelectorAll('.gate'),
				{
					autoAlpha: want ? 1 : 0,
					y: want ? 0 : 4,
					duration: DURATION * d,
					stagger: 0.08 * d,
					ease: EASE,
				},
				d ? '-=0.15' : 0,
			);

			timeline.to(
				element.querySelector('.gate-note'),
				{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
				d ? '-=0.25' : 0,
			);
		});
	}, [animate, inContext, killRunning, ready, step, track]);

	return (
		<section className="slide ai-native-loop" ref={root}>
			<header>
				<p className="company">3B &mdash; my own system, in version control</p>
				<h1>Working with agents as a loop, not a prompt</h1>
			</header>

			<div className="chain">
				<div className="rail-line" aria-hidden="true" />

				<ol className="stages">
					{stages.map((stage) => (
						<li className="stage" key={stage.name}>
							<span className="dot" aria-hidden="true" />
							<span className="name">{stage.name}</span>
							<span className="detail">{stage.detail}</span>
							{/* Rendered for every stage so the row heights are fixed from
							    the first paint; only the gated three ever become visible. */}
							<span className={`gate${stage.human ? ' gated' : ''}`} aria-hidden={!stage.human}>
								{stage.human ? 'human' : ''}
							</span>
						</li>
					))}
				</ol>

				{/* Return path: last stage back to first. Three CSS segments plus a
				    head, drawn in flow order. */}
				<div className="return" aria-hidden="true">
					<span className="ret-down" />
					<span className="ret-across" />
					<span className="ret-up" />
					<span className="ret-head" />
				</div>
			</div>

			<p className="ret-label">
				<code>/wrap</code> writes the context the next spec starts from.
			</p>

			{/* "One propagation layer renders" was machine language for a human
			    idea. */}
			<p className="vendors">One source of truth, four agents: claude / codex / agy / grok.</p>

			<p className="gate-note">
				Three gates stay human: what to build, what it means, and what ships.
			</p>
		</section>
	);
}
