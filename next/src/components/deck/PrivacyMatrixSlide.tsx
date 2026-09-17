'use client';

/**
 * S14 — Privacy governance (0:45) · never cut.
 * The React port of `src/routes/talks/my-career/slides/PrivacyMatrixSlide.svelte`.
 *
 * The tie-in beat, and per facts.md the most transferable idea in the deck.
 *
 * THE FOOTNOTE WAS WRONG, CORRECTED 2026-07-29 after Brandon asked whether it is
 * really "one rule". It is — and the slide was understating it while overstating
 * the enforcement. What is true: the rule is a MARKDOWN TABLE in
 * `.agents/rules/information-layer.md` § Privacy matrix;
 * `scripts/lib/privacy-matrix.js` parses that markdown at runtime, and twelve
 * consumers import the loader with none carrying its own list — the document IS
 * the executable policy. What was false: the footnote said a check fails the
 * commit on drift. No such check exists; `.husky/pre-commit` regenerates and
 * re-stages instead of failing (its own comment records why they moved off
 * `--check` mode). The honest version is the stronger one: it cannot drift,
 * because committing a change to the table rewrites the enforcement list.
 *
 * THE PATH IS NOW ON THE SLIDE. `ADR-005` was removed as an OPAQUE KEY, but a
 * path is SELF-DESCRIBING — read it and you already know a rules directory
 * exists and that one rule governs the information layer. It sits in the LEAD,
 * not on the gate where it belongs semantically: the gate column is
 * `auto`-width and a 33-character nowrap string there would roughly double it.
 * Monospaced deliberately — a citation differs from the removed glob rows.
 *
 * NEVER ASSERT WHAT THE AUDIENCE'S OWN PRODUCT DOES (Brandon, 2026-07-29). The
 * slide used to name the company and state what its product handled — an
 * inference narrated back to its builders as established fact. What replaces it
 * claims nothing about anyone's product: any product that adds AI ends up with
 * several systems reading the same user data. That is also why the slide is
 * reusable: the argument is about the shape of the problem.
 *
 * LEGIBILITY (same note). The headline says "rule" and "system", not "table"
 * and "index" — some of this room is not technical, and the subtitle exists to
 * narrate the diagram.
 *
 * ONE ADVANCE, TWO TOKENS. The storyboard asked for a denied path bouncing off
 * the gate; a permitted path alongside is what makes the denial mean something.
 *
 * THEY NO LONGER TRAVEL (Brandon, 2026-07-29). The denied token used to run at
 * the gate and reverse — a still frame of a mid-journey pill is
 * indistinguishable from debris, so it had to be hidden under `?print` and
 * reduced motion, making the PDF a weaker argument. Both now fade in on their
 * own side of the gate and stay: position carries what the travel carried —
 * left of the gate means the content never reached a consumer.
 *
 * THE OVERLAY STAYS. `.track` is inset over the flow row and pointer-events:
 * none, so the pills sit above the layout without occupying it.
 *
 * THE CLAIM IS THE SHAPE, NOT THE ROW COUNT. Five rows show both verdicts, not
 * completeness. Do not read the count out loud.
 *
 * NO CODE ON THE SLIDE. The matrix rows were the literal path globs in `<code>`,
 * which asked the room to parse syntax for a point that is not about syntax.
 * Rows now name the content kinds.
 *
 * THE CONSUMER LIST names what each one RISKS, not what it is — two earlier
 * passes (internal project names, then terms of art) failed Brandon's "can he
 * finish the sentence" test. Crosschecked 2026-07-29: the list was also wrong —
 * "the local search index" and "the embedding store" are the same consumer
 * (3b-retrieve.js is FTS5 + sqlite-vec merged by RRF). Search and the checks
 * are local; the repo map is the ONLY consumer where content leaves the
 * machine, and only non-code at that. The third line was checked and is TRUE —
 * `graphify-privacy-diff.js` is a real drift auditor; it is a manual audit
 * while the footnote describes regeneration, and they must not be "fixed" into
 * agreement.
 *
 * PUBLISH-SAFE: 3B's own governance rule and loader, nothing else. The audience
 * product inference was deleted 2026-07-29 — there is no version of guessing at
 * someone's product on a slide worth the sentence it buys.
 *
 * PORT NOTE: persistent DOM, no React state — the target only steers GSAP
 * visibility. Each applied step kills the prior tracked timeline and rebuilds
 * the source sequence; Svelte's `await tick()` is dropped because nothing the
 * timeline touches is conditional.
 *
 * STRICTMODE. Every set and the timeline run inside a `gsap.context()` scoped
 * to the slide root, so the mount cleanup reverts them and the second mount
 * starts clean.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

// Chosen to show both verdicts, not to be exhaustive. These were the literal
// path globs until 2026-07-29 — `personal/**`, `**/*.me.md` and so on — which
// put monospaced code on a slide and made the audience parse syntax to reach
// a point that is not about syntax. The rule is keyed on paths in the repo;
// what the room needs to see is which KINDS of content each verdict covers.
const rows = [
	{ kind: 'Personal notes', verdict: 'private' },
	{ kind: 'Session journals', verdict: 'private' },
	{ kind: 'Anything I hand-wrote', verdict: 'private' },
	{ kind: 'Distilled knowledge', verdict: 'public' },
	{ kind: 'Decision records', verdict: 'public' },
];

// Named by what they RISK, not by what they are. Three now, each one a
// sentence Brandon can finish — see the header note for the failed passes and
// the duplicate-consumer correction. The real matrix has more readers; the
// claim is the shape, not the count.
const consumers = [
	'Search over my own notes — never leaves the machine',
	'The repo map — sends file contents to a model API',
	'The checks that catch it when one of them drifts off the rule',
];

export default function PrivacyMatrixSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	const running = useRef<Array<{ kill: () => void }>>([]);

	const [ready, setReady] = useState(false);

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
				loaded.gsap.set(element.querySelectorAll('.row'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelector('.gate'), { autoAlpha: 0, scaleY: 0.7 });
				loaded.gsap.set(element.querySelectorAll('.consumer'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelectorAll('.token'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelector('.tie'), { autoAlpha: 0, y: 6 });
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			killRunning();
			context.current?.revert();
			context.current = null;
			// Not the bundle: the loader memo is module-scoped and shared.
			applied.current = -1;
		};
	}, [killRunning]);

	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		const d = !animate || reducedMotion() ? 0 : 1;
		const want = step >= 1;

		killRunning();

		inContext(() => {
			const pass = element.querySelector('.token.pass');
			const deny = element.querySelector('.token.deny');
			const timeline = track(loaded.gsap.timeline());

			// Step 0: the table, the loader, the consumers. Static.
			timeline.to(element.querySelectorAll('.row'), {
				autoAlpha: 1,
				y: 0,
				duration: DURATION * d,
				stagger: 0.05 * d,
				ease: EASE,
			});

			timeline.to(
				element.querySelector('.gate'),
				{ autoAlpha: 1, scaleY: 1, duration: DURATION * d, ease: EASE },
				d ? '-=0.2' : 0,
			);

			timeline.to(
				element.querySelectorAll('.consumer'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.05 * d, ease: EASE },
				d ? '-=0.25' : 0,
			);

			if (!want) {
				timeline.to([pass, deny], { autoAlpha: 0, duration: DURATION * d, ease: EASE });
				timeline.to(element.querySelector('.tie'), {
					autoAlpha: 0,
					y: 6,
					duration: DURATION * d,
					ease: EASE,
				});
				return;
			}

			// Both fade in where they belong and stay there. No travel — position
			// carries what the travel carried: one pill left of the gate, one
			// right of it, and a static pill needs no `?print` exemption.
			timeline.to(
				[deny, pass],
				{ autoAlpha: 1, duration: DURATION * d, stagger: 0.1 * d, ease: EASE },
				d ? '-=0.1' : 0,
			);

			timeline.to(
				element.querySelector('.tie'),
				{ autoAlpha: 1, y: 0, duration: DURATION * d, ease: EASE },
				d ? '-=0.15' : 0,
			);
		});
	}, [animate, inContext, killRunning, ready, step, track]);

	return (
		<section className="slide privacy-matrix" ref={root}>
			<header>
				<p className="company">3B &mdash; privacy governance</p>
				<h1>One rule decides what every system may read</h1>
				{/*
					Was 32 words with an appositive hanging off a path and a relative clause
					hanging off the appositive — a written paragraph on the slide with the
					deck's worst words-per-second load. Its last sentence ("every tool checks
					there first") was also said again in the footnote below the diagram.
				*/}
				<p className="lead">
					One row per kind of content, in{' '}
					<span className="rule-path">.agents/rules/information-layer.md</span>. The code reads that
					table at runtime.
				</p>
			</header>

			<div className="flow">
				<ul className="matrix">
					{rows.map((row) => (
						<li className="row" key={row.kind}>
							<span className="kind">{row.kind}</span>
							<span className={`verdict${row.verdict === 'private' ? ' private' : ''}`}>
								{row.verdict}
							</span>
						</li>
					))}
				</ul>

				<div className="gate">
					<span className="gate-bar" aria-hidden="true" />
					<span className="gate-label">one shared rule</span>
				</div>

				<ul className="consumers">
					{consumers.map((consumer) => (
						<li className="consumer" key={consumer}>
							{consumer}
						</li>
					))}
				</ul>

				{/* Overlay only. Absolutely positioned and pointer-events: none, so the
				    tokens cannot shift anything underneath them. */}
				<div className="track" aria-hidden="true">
					<span className="token deny">
						Personal notes
						<span className="badge">never crosses</span>
					</span>
					<span className="token pass">
						Distilled knowledge
						<span className="badge">passes</span>
					</span>
				</div>
			</div>

			<p className="footnote">
				None of them keeps its own copy &mdash; change the table and the enforcement list changes
				with it.
			</p>

			<p className="tie">
				Any product that adds AI ends up with several systems reading the same user data. Writing
				the policy is easy. Enforcing it is the part you build.
			</p>
		</section>
	);
}
