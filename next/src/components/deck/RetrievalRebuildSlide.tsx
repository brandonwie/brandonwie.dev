'use client';

/**
 * S13 — 3B: kill, diagnose, rebuild (0:45) · never cut.
 * The React port of `src/routes/talks/my-career/slides/RetrievalRebuildSlide.svelte`.
 *
 * The engineering-maturity beat, and per facts.md the strongest one in the
 * deck. It works because the admission comes first: the interesting fact is
 * that it was measured and deleted, not that it was rebuilt.
 *
 * DELIBERATELY UNDER-DECORATED. The storyboard is explicit — text driven,
 * three states, do not over-decorate. Nothing here moves except opacity.
 *
 * DO NOT SAY "RAG" ABOUT THE STACK. Only QMD is retrieval-for-generation;
 * context-mode, code-review-graph, graphify and serena are not. facts.md § Do
 * not say + rag-layer.md Part 4. The slide says "retrieval", never "RAG
 * stack".
 *
 * NUMBERS RE-MEASURED 2026-07-28, on the day before the talk, per the
 * standing rule in facts.md that no eval number reaches this slide
 * unverified:
 *   - eval gate    6/7 PASS, p50 96ms, p95 207ms  (gate threshold is 6/7)
 *   - forced-read  897/1351 = 66.4%               ("two-thirds", stated round)
 * Both re-run from a fresh index build. If this slide is shown after
 * 2026-07-28, re-run `pnpm run retrieve:eval:quick` and
 * `node scripts/3b-retrieve.js stats` before trusting either.
 *
 * NO CORPUS SIZE ON THIS SLIDE. facts.md and rag-layer.md both recorded
 * 10,930 docs; the index rebuilt on 2026-07-28 holds 6,582. Both ledgers were
 * corrected in the same pass. The count stays off the slide anyway — it is
 * not load-bearing for this beat, and a figure that moved by a third inside
 * three days is exactly the kind of number not to say out loud in a room that
 * may ask how it was measured.
 *
 * NO INTERNAL IDENTIFIERS, AND NO ENGINEER SHORTHAND. Corrected 2026-07-29 on
 * Brandon's instruction. The two decisions used to be cited as "ADR-005" and
 * "ADR-041", which name nothing to anyone outside this repo — the audience
 * cannot look them up and the number carries none of the meaning. What those
 * references were actually doing was signalling "this was written down, not
 * improvised", so the slide now says that in words: deleted it AND wrote down
 * why, then rebuilt against that write-up. Same signal, no decoder ring.
 *
 * The supporting lines were shell and retrieval jargon for the same reason —
 * "exits non-zero", "telemetry", "recall aid merged via RRF", "harness-model
 * pairs". All rewritten as plain sentences. The claims are unchanged; only
 * the register is. If a line cannot be said out loud to a non-specialist
 * without translating it, it does not belong on a slide.
 *
 * SECOND PLAIN-LANGUAGE PASS, 2026-07-29 (Brandon: hard to follow if you are
 * not technical). The diagnosis, set at subtitle size and therefore the
 * second-largest text here, read "write infrastructure with no forced read
 * path" — the purest engineer shorthand in the deck. It now says the same
 * thing in words anyone can repeat: everything was filed away, and nothing
 * was ever required to read it. "Retrieval" left the eyebrow for the same
 * reason; it now matches the plain phrasing S14 already uses for this system.
 *
 * THE HEADLINE IS THE ARGUMENT, NOT THE ARC (Brandon, 2026-07-29: "does not
 * seem aligned with the page context"). Two drafts failed here and both
 * failed the same way. "I measured it, deleted it, and rebuilt it" hung three
 * verbs on a pronoun with no antecedent. Its replacement, "I built my own
 * search engine, then deleted it", named the thing but restated two of the
 * three column headings sitting directly beneath it — and then stopped at
 * the admission, while the bottom two-thirds of the slide is about what the
 * rebuild does differently. A headline that repeats the row below it and
 * omits the row's point is not a headline.
 *
 * Every other slide in this deck splits the two: the eyebrow carries the
 * subject and the h1 carries the claim ("3B — my own system, in version
 * control" / "Working with agents as a loop, not a prompt"). This one now
 * does the same. The eyebrow names the system; the h1 states the lesson the
 * whole page is evidence for; the beats own the arc; the diagnosis owns the
 * cause; the guards own the fix. Nothing says the same thing twice.
 *
 * "I stopped trusting my memory" is also the half the old headline could not
 * reach. The diagnosis is that nothing was REQUIRED to read; guard one makes
 * it required; guard three ends "not remembered" and closes the loop with a
 * number. In a room hiring for judgement, being remembered for building the
 * constraint beats being remembered for having deleted something.
 *
 * The vector half is no longer named on the slide. A technical listener hears
 * the right term from the presenter (script.md keeps it); a non-technical one
 * reads "the search that matches on meaning" and loses nothing. Naming it and
 * then glossing it would have cost a clause and bought nothing on screen.
 *
 * EACH GUARD CARRIES ONE CONCRETE EXAMPLE (Brandon, same pass). The rules
 * alone were noddable-but-unpicturable: "a quality test blocks the merge" is
 * agreeable and imageless. Each example is the instance that makes the rule
 * checkable, and the third one deliberately answers the question the claim
 * provokes — every search is logged with the reason it fired, which is HOW
 * the two-thirds split is known. Expect that question if the room is
 * technical.
 *
 * CUT TO ROUGHLY HALF, 2026-07-29 (Brandon: too many words). ~200 words to
 * ~105. Everything that survived is a fragment rather than a sentence,
 * because the slide gets 45 seconds and the audience is listening rather than
 * reading. The cuts were appositives and hedges, not claims: Built lost a
 * three-item list restating what "my own notes" already means; the guards
 * lost their sentence scaffolding; the evidence paragraph lost the clause
 * explaining what the meaning-based search catches, which is a Q&A answer
 * rather than a slide line. Every verified claim is still on the slide.
 * script.md keeps the long forms for a room that asks.
 *
 * PUBLISH-SAFE: entirely Brandon's own repo, and both decision records are
 * already public in it. Nothing employer-related on this slide.
 *
 * PORT NOTE: persistent DOM, one timeline per applied step — same
 * kill-then-build arrangement as AiNativeLoopSlide. Svelte's `await tick()`
 * is dropped (nothing the timeline touches is conditional).
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

const beats = [
	{
		state: 'Built',
		line: 'A search engine over my own notes.',
		late: false,
	},
	{
		state: 'Deleted',
		line: 'Measured what it was worth. Nothing. Deleted it — and wrote down why.',
		late: false,
	},
	{
		state: 'Rebuilt',
		line: 'From that write-up. The reasons became the build list.',
		late: true,
	},
];

// Each guard is a rule plus one concrete instance of it. The rules alone were
// the abstract part of this slide — "a quality test blocks the merge" is a
// sentence you can nod along to without picturing anything. Both halves are
// deliberately fragments, not sentences: this slide gets 45 seconds, and the
// audience is listening, not reading. The third example answers the question
// the claim provokes — how would you even know that.
const guards = [
	{
		rule: 'Seven workflows must search my notes before they answer',
		example: 'Opening a project searches what I wrote last time first.',
	},
	{
		rule: 'A change that makes search worse cannot ship',
		example: 'Fixed questions, answers I already know — miss one, the change stops.',
	},
	{
		rule: 'Two-thirds of searches are forced now, not remembered',
		example: 'Every search logs why it fired. That is how I know.',
	},
];

export default function RetrievalRebuildSlide({ step = 0, animate = true }: Props) {
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
				loaded.gsap.set(element.querySelectorAll('.beat'), { autoAlpha: 0, y: 8 });
				loaded.gsap.set(element.querySelectorAll('.beat.late'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelector('.diagnosis'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelectorAll('.guard'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelector('.evidence'), { autoAlpha: 0, y: 6 });
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

			// Built and Deleted are the step-0 pair. The admission lands before
			// the recovery does; that ordering is the whole point of the beat.
			timeline.to(element.querySelectorAll('.beat:not(.late)'), {
				autoAlpha: 1,
				y: 0,
				duration: DURATION * d,
				stagger: 0.12 * d,
				ease: EASE,
			});

			timeline.to(
				element.querySelector('.diagnosis'),
				{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
				d ? '-=0.1' : 0,
			);

			timeline.to(
				element.querySelector('.beat.late'),
				{ autoAlpha: want ? 1 : 0, y: want ? 0 : 8, duration: DURATION * d, ease: EASE },
				d ? '-=0.25' : 0,
			);

			timeline.to(
				element.querySelectorAll('.guard'),
				{
					autoAlpha: want ? 1 : 0,
					y: want ? 0 : 6,
					duration: DURATION * d,
					stagger: 0.07 * d,
					ease: EASE,
				},
				d ? '-=0.2' : 0,
			);

			timeline.to(
				element.querySelector('.evidence'),
				{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
				d ? '-=0.2' : 0,
			);
		});
	}, [animate, inContext, killRunning, ready, step, track]);

	return (
		<section className="slide retrieval-rebuild" ref={root}>
			<header>
				<p className="company">3B &mdash; searching my own notes</p>
				<h1>I stopped trusting my memory</h1>
			</header>

			<ol className="beats">
				{beats.map((beat) => (
					<li className={`beat${beat.late ? ' late' : ''}`} key={beat.state}>
						<span className="state">{beat.state}</span>
						<span className="line">{beat.line}</span>
					</li>
				))}
			</ol>

			<p className="diagnosis">
				The write-up named the cause:{' '}
				<strong>everything was filed away, and nothing was ever required to read it.</strong>
			</p>

			<ul className="guards">
				{guards.map((guard) => (
					<li className="guard" key={guard.rule}>
						<span className="rule">{guard.rule}</span>
						<span className="example">{guard.example}</span>
					</li>
				))}
			</ul>

			<p className="evidence">
				Plain word-matching does the ranking, on purpose &mdash; a 2026 benchmark had it beat the
				meaning-based search in all ten setups tried.
			</p>
		</section>
	);
}
