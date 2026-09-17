'use client';

/**
 * S11 — Data pipeline (0:45) · cut-1.
 * The React port of `src/routes/talks/my-career/slides/DataPipelineSlide.svelte`.
 *
 * The hero beat is FRESHNESS, carried by cadence. Twelve ticks instead of one
 * is the part a picture can show without explanation, but twelve runs
 * fetching two-day-old data would be twelve times the work for nothing. The
 * lag line under the cadence is what turns the tick marks into a claim.
 *
 * Everything else the pipeline work involved — the production move, the
 * monorepo, the Parquet layout, the search-sync — rides in the notes.
 *
 * THE LAG WAS WRONG IN THE LEDGER (Brandon, 2026-07-29). facts.md read
 * "upgraded from daily D-2 pulls to two-hourly D-4→D-2 windows", and the
 * D-4→D-2 is in DAYS. Two-hourly runs each pulling a two-day-old window would
 * leave the data exactly as stale as before — the cadence would have bought
 * nothing. The real after-state is a −4h→−2h window, so the data sits about
 * two hours behind live instead of two days. Before is unchanged and was
 * right: daily runs pulling D−2.
 *
 * The window trails live by two hours rather than reaching for it, which is
 * the reason it is −4h→−2h and not −2h→now: events need time to arrive before
 * the run reads that slice. Consecutive windows tile rather than overlap.
 *
 * TYPESENSE ONLY. facts.md § Do not say is explicit: search-sync against
 * Postgres, and NOTHING about pgvector, embeddings, or RAG under MOBA. RAG
 * depth belongs to Crucio, a separate project. The note here deliberately
 * omits "behind the AI feature" as well — true, but it invites a RAG question
 * this slide has no business answering.
 *
 * The twelve tick marks are fixed in place from the first render; step 1
 * simply hides eleven of them. Laying them out on advance would slide the
 * first tick as the row re-spaced, and the first tick is the one thing that
 * did not change.
 *
 * PUBLISH-SAFE: named managed services and a schedule, both already on the
 * submitted CV. No bucket names, no DAG contents, no schemas. Keep it that
 * way — the repo this lives in is public.
 *
 * PORT NOTE: all twelve `.tick` nodes stay mounted from first paint; only
 * `.extra` autoAlpha and the copy change, so this slide needs no two-phase
 * handoff — `setFrequent` and the tweens can run in one step effect because
 * no tween depends on the re-rendered DOM. The killTweensOf before each step
 * is the same delayed-callback guard the other ports carry: the source
 * issues its note tween unconditionally, so a rapid reversal would otherwise
 * fire the forward delay after the hide.
 *
 * STRICTMODE. Every set and tween is created inside a `gsap.context()` scoped
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

// Twelve runs a day is the two-hourly cadence, drawn literally.
const TICKS = Array.from({ length: 12 }, (_, i) => i);

// Note 2 used to open by restating the freshness line verbatim ("the data is
// about two hours behind live"); only its second half was new, so it now
// leads with the reason. The others lost trailing clauses, not claims.
const notes = [
	'Amplitude to Airflow to S3 as Parquet, partitioned on event time',
	'The two-hour lag is deliberate — late events land inside the window',
	'Three repos merged into one, with shared Python contracts',
	'Typesense search kept in step with Postgres',
];

export default function DataPipelineSlide({ step = 0, animate = true }: Props) {
	const root = useRef<HTMLElement | null>(null);
	const bundle = useRef<Bundle | null>(null);
	const context = useRef<ReturnType<Bundle['gsap']['context']> | null>(null);
	const applied = useRef(-1);

	const [frequent, setFrequent] = useState(false);
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
			context.current = loaded.gsap.context(() => {
				const element = root.current!;
				loaded.gsap.set(element.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
				loaded.gsap.set(element.querySelectorAll('.tick.extra'), { autoAlpha: 0 });
			}, root);

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

	useEffect(() => {
		if (!ready || step === applied.current) return;
		applied.current = step;

		const element = root.current;
		const loaded = bundle.current;
		if (!element || !loaded) return;

		// Read imperatively, exactly as the Svelte original does: this is not
		// reactive there either, so a mid-slide OS change does not retrigger.
		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = step >= 1;

		setFrequent(want);

		inContext(() => {
			loaded.gsap.killTweensOf(element.querySelectorAll('.tick.extra'));
			loaded.gsap.killTweensOf(element.querySelectorAll('.note'));

			// Left to right, so the day fills up rather than the marks all
			// blinking on at once. The first tick is untouched — it was already
			// there.
			loaded.gsap.to(element.querySelectorAll('.tick.extra'), {
				autoAlpha: want ? 1 : 0,
				duration: DURATION * 0.7 * d,
				stagger: 0.045 * d,
				ease: EASE,
			});

			loaded.gsap.to(element.querySelectorAll('.note'), {
				autoAlpha: want ? 1 : 0,
				y: want ? 0 : 6,
				duration: DURATION * d,
				stagger: 0.07 * d,
				ease: EASE,
				delay: want ? DURATION * 1.2 * d : 0,
			});
		});
	}, [animate, inContext, ready, step]);

	return (
		<section className="slide data-pipeline" ref={root}>
			<header>
				<p className="company">MOBA &middot; 2025 &ndash; now</p>
				{/*
					NOT "Moving the pipeline into production" — the state line directly
					below IS the production move, so the headline was saying it twice,
					and the header above says the hero beat is FRESHNESS. Two days to
					two hours is the claim; the production move is how it was achieved.
				*/}
				<h1>Two days behind became two hours</h1>
				<p className="state">
					{frequent
						? 'After — Terraform-managed Airflow on AWS, shipped by GitHub Actions'
						: 'Before — a prototype that ran locally, by hand'}
				</p>
			</header>

			<div className="strip">
				<span className="strip-label">One day</span>

				{/* All twelve ticks are laid out from the first render; step 1 hides
				    eleven. Nothing re-spaces on advance. */}
				<div className="track">
					{TICKS.map((t) => (
						<span className={`tick${t > 0 ? ' extra' : ''}`} key={t} />
					))}
				</div>

				<p className="cadence">{frequent ? 'A run every two hours' : 'One run a day'}</p>

				{/*
					The cadence is the visible change; the lag is the one that matters.
					Twelve ticks instead of one says the pipeline runs more often, which
					on its own could still be twelve runs fetching two-day-old data.
					This line is what makes it a freshness claim.
				*/}
				<p className="freshness">
					{frequent ? (
						<>A &minus;4h to &minus;2h window &mdash; data about two hours behind live</>
					) : (
						<>A D&minus;2 window &mdash; data two days behind live</>
					)}
				</p>
			</div>

			<ul className="notes">
				{notes.map((note) => (
					<li className="note" key={note}>
						{note}
					</li>
				))}
			</ul>
		</section>
	);
}
