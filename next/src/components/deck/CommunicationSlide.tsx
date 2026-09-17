'use client';

/**
 * S15b — How I work (0:35) · cut-1.
 * The React port of `src/routes/talks/my-career/slides/CommunicationSlide.svelte`.
 *
 * Sits between the close and the credentials, at Brandon's instruction
 * (2026-07-29). The suffix means "inserted after S15" — unlike S4a/S4b it is
 * NOT a split of that beat. Nothing was renumbered deliberately: S16 and S17
 * are referenced by number in storyboard.md, script.md and todos.md.
 *
 * THE HARDEST SLIDE IN THE DECK TO MAKE HONEST. A slide that asserts personal
 * qualities is the weakest genre there is, and this deck's whole discipline is
 * that nothing goes on a slide without a verified row. So each quality points
 * at a moment the room has already watched, and the moments carry it:
 *
 *   - Critical thinking — page 3. The gateway module was proposed and built,
 *     not complained about. init.me.md § MODULABS.
 *   - Strong opinions, weakly held — page 15. He built a search engine,
 *     measured it, found it delivered nothing, and deleted it.
 *   - Intellectual humility — page 15's second guard: a regression test that
 *     blocks HIS OWN change when results get worse. Humility built into a gate
 *     that can veto him is falsifiable; stated as a feeling it is not.
 *
 * The anchors are his own work failing or being constrained in all three
 * cases — deliberate. An anchor where he was proved right would make these
 * claims about competence; an anchor where he was checked makes them about
 * character.
 *
 * The closing line is the whole device and it must not be cut: without it the
 * three rows read as self-description.
 *
 * THE NAMES ARE LOAD-BEARING (Brandon, 2026-07-29). The first version dropped
 * them as insider vocabulary — wrong call. They are the words he identifies
 * with. The jargon problem is solved by the gloss line, not by deletion.
 * "Critical thinking" is NEW as of that correction — Brandon named it out loud,
 * which makes him the source; recorded in facts.md as a 2026-07-29 addition.
 *
 * BIAS FOR ACTION IS DELIBERATELY NOT HERE. A fourth abstract noun turns a set
 * of claims into a list of virtues; it moved to script.md as a spoken line.
 *
 * DO NOT put the scouting story here (facts.md: strong as a spoken aside, weak
 * as a slide claim). DO NOT let this slide drift toward the tenure question —
 * answered off-slide in qa-prep.md.
 *
 * steps: 2 — claims first, receipts second. The order is the argument: the
 * room should get to think "everyone says that" before the anchors arrive.
 *
 * PUBLISH-SAFE: three callbacks to slides already in this deck. No new
 * employer detail.
 *
 * PORT NOTE: persistent DOM, one tracked timeline per applied step; the prior
 * timeline is killed before its replacement so a stale mid-flight tween cannot
 * overwrite a reversal. `await tick()` dropped — nothing is conditional.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

interface Props {
	step?: number;
	animate?: boolean;
}

// Three tiers per row, and each does a job the other two cannot.
//
//   name   — the concept Brandon actually identifies with. These are the words
//            he uses about himself, so they lead.
//   gloss  — the same idea in ordinary language, because two of the three
//            names are insider vocabulary and half the room will not have met
//            them. The gloss is what stops the row being a badge.
//   anchor — the moment in this talk that already demonstrated it. Never a
//            restatement of the gloss; if it were, the row would assert twice
//            and prove nothing.
const rules = [
	{
		name: 'Critical thinking',
		gloss:
			'I argue based on evidence. An objection is not finished until it carries an alternative.',
		anchor: 'The gateway module was a proposal, not a complaint.',
	},
	{
		name: 'Strong opinions, weakly held',
		gloss: 'I commit to a position, and I let it go when the evidence turns.',
		anchor: 'The search engine I deleted was my own.',
	},
	{
		name: 'Intellectual humility',
		gloss: 'I assume I will be wrong, so I build the thing that catches it.',
		anchor: 'A test blocks my own change when the results get worse.',
	},
];

export default function CommunicationSlide({ step = 0, animate = true }: Props) {
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
				loaded.gsap.set(element.querySelectorAll('.name'), { autoAlpha: 0, y: 8 });
				loaded.gsap.set(element.querySelectorAll('.gloss'), { autoAlpha: 0, y: 8 });
				loaded.gsap.set(element.querySelectorAll('.anchor'), { autoAlpha: 0 });
				loaded.gsap.set(element.querySelector('.point'), { autoAlpha: 0, y: 6 });
			}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			killRunning();
			context.current?.revert();
			context.current = null;
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
			const timeline = track(loaded.gsap.timeline());

			timeline.to(element.querySelectorAll('.name'), {
				autoAlpha: 1,
				y: 0,
				duration: DURATION * d,
				stagger: 0.1 * d,
				ease: EASE,
			});

			// Glosses trail their names closely — the name and its plain-language
			// version are one unit; separating them would leave three abstract
			// nouns alone on screen.
			timeline.to(
				element.querySelectorAll('.gloss'),
				{
					autoAlpha: 0.85,
					y: 0,
					duration: DURATION * d,
					stagger: 0.1 * d,
					ease: EASE,
				},
				d ? '-=0.42' : 0,
			);

			// The anchors arrive together rather than staggered — as a set they
			// read as the receipts for what is already on screen. autoAlpha
			// resolves to opacity, so the resting dimness has to be the tween
			// target — a CSS `opacity: 0.65` would be overwritten by autoAlpha 1.
			timeline.to(
				element.querySelectorAll('.anchor'),
				{
					autoAlpha: want ? 0.65 : 0,
					duration: DURATION * d,
					stagger: 0.05 * d,
					ease: EASE,
				},
				d ? '-=0.15' : 0,
			);

			// Last, and after a beat — this line turns three assertions into
			// three citations, so it cannot land while the anchors are fading.
			timeline.to(
				element.querySelector('.point'),
				{ autoAlpha: want ? 0.75 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
				d ? '-=0.05' : 0,
			);
		});
	}, [animate, inContext, killRunning, ready, step, track]);

	return (
		<section className="slide communication" ref={root}>
			<header>
				<p className="company">How I work</p>
				<h1>Being right is not the useful part</h1>
			</header>

			<ul className="rules">
				{rules.map((rule) => (
					<li className="rule" key={rule.name}>
						<span className="name">{rule.name}</span>
						<span className="gloss">{rule.gloss}</span>
						<span className="anchor">{rule.anchor}</span>
					</li>
				))}
			</ul>

			<p className="point">Not claims about myself &mdash; three slides you just watched.</p>
		</section>
	);
}
