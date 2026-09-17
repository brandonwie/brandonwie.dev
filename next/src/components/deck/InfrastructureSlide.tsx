'use client';

/**
 * S10 — Infrastructure (1:00) · cut-2.
 * The React port of `src/routes/talks/my-career/slides/InfrastructureSlide.svelte`.
 *
 * Four separate before/after pairs on one slide, because they are one story:
 * the infrastructure had no single source of truth, no headroom, no edge, and
 * no cost discipline. Splitting them across four slides would spend four
 * times the stage time to make the same point once.
 *
 * ONE ADVANCE SWAPS ALL FOUR ROWS. The labels and the row geometry hold
 * still; only the state boxes change. Four simultaneous swaps read as one
 * systemic change, which is exactly what it was — not four unrelated tickets.
 *
 * Both numbers (~95% attack surface, ~15% cost) are on the submitted CV and
 * sit inside the after-note that says what they measure. A bare "95%" in its
 * own column invites the panel to guess the denominator.
 *
 * PUBLISH-SAFE: every line here is at the level already printed on the CV —
 * named AWS services and directions of change, no account identifiers, no
 * CIDR ranges, no rule contents, no topology anyone could act on. Keep it
 * that way; this is the most internal slide in the deck and the repo it lives
 * in is public.
 *
 * PORT NOTE (phases): same arrangement as the PlaytagAdminSlide port. The
 * `.state-swap` boxes are conditionally rendered, so the step effect only
 * computes `want`/`still` and moves the state; the layout effect that follows
 * the commit sees the fresh `.state-swap` nodes and plays the source's fromTo
 * sweep pre-paint — on BOTH directions, exactly as the source does whenever
 * `want !== after`.
 *
 * STRICTMODE. The fromTo is created inside a `gsap.context()` scoped to the
 * slide root, so the mount cleanup reverts it and the second mount starts
 * clean. The `applied` ref guard makes the double-invoked phase-1 effect
 * re-enter safely.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { DURATION, EASE, loadGsap, reducedMotion } from '@/deck/gsap';

type Bundle = Awaited<ReturnType<typeof loadGsap>>;

/** A layout effect on the client and a passive one during the static export,
 *  which is the standard way to keep React from warning about
 *  `useLayoutEffect` in a render that has no layout to read. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Props {
	step?: number;
	animate?: boolean;
}

const ROWS = [
	{
		key: 'state',
		label: 'State',
		before: {
			title: 'Local tfvars and tfstate',
			note: 'drifted from the account; some resources manual',
		},
		after: {
			title: 'Remote state on S3 and DynamoDB',
			note: 'every resource Terraform-managed',
		},
	},
	{
		key: 'capacity',
		label: 'Capacity',
		before: {
			title: 'A single ECS task',
			note: 'no autoscaling; migrations shipped with the app',
		},
		after: {
			title: 'Autoscaling across one to four tasks',
			note: 'database migration separated from app deployment',
		},
	},
	{
		key: 'exposure',
		label: 'Exposure',
		before: {
			title: 'Everything open to the internet',
			// Was "open to the internet" — the same words as the title above it,
			// and the state line said it a third time. Replaced rather than
			// emptied: these boxes crossfade in place, so a note with no content
			// would leave the before-box shorter than the after-box it swaps
			// with. This version sets up the after-state instead of repeating
			// the title.
			note: 'no filtering in front of it',
		},
		after: {
			title: 'Path-based WAF rules and a locked-down allowlist',
			note: '~95% less attack surface; private subnets next',
		},
	},
	{
		key: 'cost',
		label: 'Cost',
		before: {
			title: 'Paying for idle capacity',
			note: 'oversized instances, an empty private subnet, NAT charges',
		},
		after: {
			title: 'Right-sized, with unused resources removed',
			// Real em dash, not `&mdash;` — these strings interpolate as text,
			// so an HTML entity would render literally.
			note: '~15% lower infra cost — ~$60/mo from NAT alone',
		},
	},
];

export default function InfrastructureSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);
	/** Phase-1 → phase-2 handoff. A ref, not state: writing it must not
	 *  schedule the very render whose commit phase 2 waits for. */
	const handoff = useRef<{ want: boolean; still: boolean } | null>(null);

	const [after, setAfter] = useState(false);
	const [ready, setReady] = useState(false);

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
			// The source's onMount only flips ready — the before-state boxes are
			// visible at first paint and need no resting sets.
			context.current = loaded.gsap.context(() => {}, root);

			setReady(true);
		})();

		return () => {
			cancelled = true;
			context.current?.revert();
			context.current = null;
			// Not the bundle: the loader memo is module-scoped and shared, and
			// clearing this ref would only force a second await on remount.
			applied.current = -1;
		};
	}, []);

	// PHASE 1 — decide. A row swap schedules the render whose commit phase 2
	// waits for; the rows-already-right path does nothing (the source has no
	// reveals to run).
	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const want = step >= 1;

		if (want !== after) {
			handoff.current = { want, still };
			setAfter(want);
		}
	}, [after, animate, ready, step]);

	// PHASE 2 — post-mutation, pre-paint. The conditional below has just
	// swapped all four state boxes; the fromTo sweeps the fresh nodes in, top
	// to bottom, whichever direction the swap went.
	useIsomorphicLayoutEffect(() => {
		const pending = handoff.current;
		if (!pending) return;
		handoff.current = null;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		if (!pending.still) {
			// Staggered top to bottom so four simultaneous swaps read as a sweep
			// down the list rather than as the whole slide blinking.
			const boxes = element.querySelectorAll('.state-swap');
			if (boxes.length) {
				inContext(() => {
					loaded.gsap.fromTo(
						boxes,
						{ autoAlpha: 0, x: -8 },
						{ autoAlpha: 1, x: 0, duration: DURATION, stagger: 0.07, ease: EASE },
					);
				});
			}
		}
	}, [after, inContext]);

	return (
		<section className="slide infrastructure" ref={root}>
			<header>
				<p className="company">MOBA &middot; 2025 &ndash; now</p>
				{/*
					NOT "Rebuilding the infrastructure" — that was the four row labels
					summed up, and it asserted nothing. The argument this slide makes is
					in the header above: four things swapping on ONE advance reads as a
					single systemic gap rather than four unrelated tickets. That
					argument was never on screen.
				*/}
				<h1>Not four tickets &mdash; one systemic gap</h1>
				<p className="state">
					{after
						? 'After — one source of truth, room to grow, and a closed edge'
						: 'Before — drifting state, one task, and everything facing the internet'}
				</p>
			</header>

			{/* Two fixed columns. The labels never move; only the boxes beside them
			    change, so the eye tracks one axis. */}
			<div className="rows">
				{ROWS.map((row) => (
					<InfraRow key={row.key} row={row} after={after} />
				))}
			</div>
		</section>
	);
}

function InfraRow({ row, after }: { row: (typeof ROWS)[number]; after: boolean }) {
	return (
		<>
			<span className="row-label">{row.label}</span>

			{after ? (
				<div className="state-box state-swap is-after">
					<span className="box-title">{row.after.title}</span>
					<span className="box-note">{row.after.note}</span>
				</div>
			) : (
				<div className="state-box state-swap">
					<span className="box-title">{row.before.title}</span>
					<span className="box-note">{row.before.note}</span>
				</div>
			)}
		</>
	);
}
