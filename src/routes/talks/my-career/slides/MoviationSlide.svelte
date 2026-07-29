<!--
  S3 — Moviation, 2023 (0:45)

  One question: what was delivered, and what was built to deliver it faster.

  THREE ROWS, ONE ADVANCE — same grammar as ModulabsSlide (rebuilt 2026-07-29).
  The previous version listed the tooling as three `from -> to` text rows, which
  named the artifacts and left the audience reading rather than seeing. Each row
  is now a picture that changes: the manual state is on screen at step 0, and one
  advance replaces it with what was generated.

  All three rows are the same story. Colors were re-edited by hand wherever they
  appeared; translations were consumed as raw JSON with no type guarantee; every
  form component was exported and imported individually. Same failure three
  times — an artifact a human maintains by hand — and the same fix three times.

  Rows 1 and 3 collapse many into one, because that is what actually happened:
  five hand-edited places became one token source, and per-form wiring became one
  builder. Row 2 does not collapse, because nothing was reduced there — the JSON
  stayed; what changed was that a typed layer was generated over it. Making that
  row a collapse too would have been a tidier picture and a false one.

  The Flutter shell stays visible in both steps. It is the context every one of
  those pages was built inside, not a beat of its own, and the bridge is the part
  Brandon owned end to end.

  NO FLIP, NO DOM SWAP for anything animated. Both states of every row live in
  the same grid cell from first paint and crossfade in place, which is only legal
  because every cell is explicitly placed — grid auto-placement refuses to
  overlap and would push the second state into implicit columns instead. That
  exact bug broke the equivalent row on ModulabsSlide.

  Every claim here has a verified row in facts.md § Moviation.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';
	import SlideVideo from '$lib/components/deck/SlideVideo.svelte';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

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
		'Roughly 5x faster typical page development',
		'Primary technical liaison for SITA API integrations',
	];

	let root = $state<HTMLElement>();
	let generated = $state(false);
	let ready = $state(false);
	let applied = -1;

	// Held while the three rows change, so only one thing on screen moves.
	let videoPaused = $state(false);

	// Same guard ModulabsSlide carries, for the same reason: three sequenced
	// segments push this timeline past a second, which is long enough that
	// advancing and immediately retreating would leave two runs writing the same
	// properties until the first finished. Rehearsal does that constantly. Only
	// `.kill()` is needed off the handle, so it is typed structurally rather than
	// dragging in a GSAP namespace type.
	let running: { kill: () => void } | undefined;
	let videoTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			// Step-0 resting state. Every after-state element is already in the DOM;
			// these only hide it, so returning to step 0 restores rather than rebuilds.
			gsap.set(root.querySelectorAll('.after'), { autoAlpha: 0 });
			gsap.set(root.querySelectorAll('.after-span'), {
				scaleX: 0.32,
				transformOrigin: 'left center',
			});
		}
		ready = true;
	});

	$effect(() => {
		const target = step;
		if (!ready || target === applied) return;
		applied = target;
		render(target);
	});

	async function render(target: number) {
		const { gsap } = await loadGsap();
		await tick();
		if (!root) return;

		// Before anything is built. Killing mid-flight leaves elements at their
		// intermediate values, which is correct: the tweens below read current
		// state, so they carry on from wherever the interrupted run got to.
		running?.kill();
		clearTimeout(videoTimer);

		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = target >= 1;

		generated = want;

		if (!still) {
			videoPaused = true;
			videoTimer = setTimeout(() => (videoPaused = false), 1250);
		}

		// One timeline, three segments, lightly overlapped — sequenced so the eye
		// is led through the rows in the order they are narrated. Simultaneous
		// would be a flash rather than three changes.
		const timeline = gsap.timeline();
		running = timeline;

		['color', 'strings', 'forms'].forEach((row, i) => {
			const at = d ? i * 0.16 : 0;
			const scope = root!.querySelector(`.row-${row}`);
			if (!scope) return;

			timeline.to(
				scope.querySelectorAll('.before'),
				{ autoAlpha: want ? 0 : 1, duration: DURATION * d, stagger: 0.04 * d, ease: EASE },
				at,
			);
			timeline.to(
				scope.querySelectorAll('.after'),
				{ autoAlpha: want ? 1 : 0, duration: DURATION * d, ease: EASE },
				at + (d ? 0.05 : 0),
			);
			// Only the collapsing rows have a span to grow; the strings row swaps in
			// place because nothing was reduced there.
			timeline.to(
				scope.querySelectorAll('.after-span'),
				{ scaleX: want ? 1 : 0.32, duration: DURATION * d, ease: EASE },
				at + (d ? 0.05 : 0),
			);
		});

		timeline.to(
			root.querySelectorAll('.note'),
			{
				autoAlpha: want ? 1 : 0,
				y: want ? 0 : 6,
				duration: DURATION * d,
				stagger: 0.07 * d,
				ease: EASE,
			},
			d ? 0.5 : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">Moviation &middot; 2023</p>
		<!-- "Korea's first" is on the submitted CV and is defensible, but it is
		     dropped here by choice: the work stands without the superlative. -->
		<h1>UAM reservation platform</h1>
	</header>

	<!--
		Recording and diagram are complementary, not redundant: the video proves it
		shipped and shows what it does, while the diagram shows the one thing the
		video cannot — that this UI is a web app running inside a native shell.
	-->
	<div class="body">
		<figure class="media">
			<SlideVideo
				src="/talks/my-career/moviation"
				label="VONAER reservation flow: searching a departure point, picking it on the map, then choosing an arrival point"
				paused={videoPaused}
			/>
			<figcaption>VONAER &mdash; booking a seat</figcaption>
		</figure>

		<div class="detail">
			<!-- Nesting carries the architecture: the web app literally sits inside
			     the shell, so the diagram is the sentence. Static in both steps. -->
			<div class="shell">
				<span class="shell-label">Flutter shell</span>
				<span class="inner">Next.js web app</span>
				<span class="bridge"
					>JavaScript channel &mdash; the native&ndash;web bridge, owned end to end</span
				>
			</div>

			<div class="changes">
				<!-- 1 — Color. Many hand-edited places become one generated source. -->
				<div class="change">
					<p class="change-label">Color</p>
					<div class="stage">
						<div class="row row-color">
							{#each swatches as fill, i (i)}
								<span
									class="cell before swatch"
									style="grid-column: {i +
										1}; background: color-mix(in srgb, currentColor {fill}%, transparent)"
								></span>
							{/each}
							<span class="cell after after-span">Design tokens, generated as typed TypeScript</span
							>
						</div>
					</div>
					<p class="change-caption">
						{#if generated}
							One source. A color changes once and every page follows.
						{:else}
							The same value kept in five places, re-edited by hand.
						{/if}
					</p>
				</div>

				<!-- 2 — i18n strings. Nothing collapses: a typed layer is generated
				     over JSON that stayed exactly where it was.

				     The label names i18n, not just "Strings". Brandon could not see what
				     the row was about from the picture alone, and he is the one who
				     built it — an audience seeing it for six seconds has no chance. -->
				<div class="change">
					<p class="change-label">i18n strings</p>
					<div class="stage">
						<div class="row row-strings">
							<span class="cell before dashed">Translation JSON, read as-is</span>
							<span class="cell after">Generated typed accessors over the same locale JSON</span>
						</div>
					</div>
					<p class="change-caption">
						{#if generated}
							Typed at compile time. A missing translation key stops being a runtime surprise.
						{:else}
							No types, so a wrong translation key was only found by opening the page.
						{/if}
					</p>
				</div>

				<!-- 3 — Forms. Per-form wiring becomes one builder. -->
				<div class="change">
					<p class="change-label">Forms</p>
					<div class="stage">
						<div class="row row-forms">
							{#each forms as form, i (form)}
								<span class="cell before dashed small" style="grid-column: {i + 1}">{form}</span>
							{/each}
							<span class="cell after after-span">One declarative form builder</span>
						</div>
					</div>
					<p class="change-caption">
						{#if generated}
							Declared, not wired. A new form is a definition, not a file.
						{:else}
							Every form component exported and imported one at a time.
						{/if}
					</p>
				</div>
			</div>

			<ul class="notes">
				{#each notes as note (note)}
					<li class="note">{note}</li>
				{/each}
			</ul>
		</div>
	</div>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1rem, 2.8vh, 1.75rem);
	}

	/* Company eyebrow above the title: the audience always knows which chapter
	   they are in without the title having to carry the company name. */
	.company {
		margin: 0 0 0.4rem;
		font-size: var(--deck-meta);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	h1 {
		font-size: var(--deck-title);
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0;
	}

	/* Recording left, explanation right. The phone is 1:2, so it costs little
	   width and reads instantly as mobile. */
	.body {
		display: grid;
		grid-template-columns: clamp(8rem, 13vw, 11rem) minmax(0, 1fr);
		gap: clamp(1.25rem, 3vw, 2.5rem);
		align-items: start;
	}

	.media {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.media figcaption {
		font-size: var(--deck-meta);
		opacity: 0.5;
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: clamp(0.85rem, 2.2vh, 1.4rem);
		min-width: 0;
	}

	/* Compact on purpose: this is context for the three rows below, not a beat.
	   The earlier version spent five vertical rems on it. */
	.shell {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 8px;
		padding: 0.6rem 0.85rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem 0.7rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
		max-width: 46rem;
	}

	.shell-label {
		font-size: var(--deck-meta);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.55;
	}

	.inner {
		border: 1px dashed color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 5px;
		padding: 0.2rem 0.55rem;
		background: color-mix(in srgb, currentColor 8%, transparent);
		font-size: var(--deck-body);
		font-weight: 600;
	}

	.bridge {
		font-size: var(--deck-meta);
		opacity: 0.65;
	}

	.changes {
		display: flex;
		flex-direction: column;
		gap: clamp(0.75rem, 2vh, 1.25rem);
		min-width: 0;
	}

	.change {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.change-label {
		margin: 0;
		font-size: var(--deck-meta);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.45;
	}

	/* Fixed-height stage per row, so a caption changing length can never move the
	   picture and the three rows stay put across the advance. */
	.stage {
		min-height: 2.4rem;
		display: flex;
		align-items: center;
	}

	.change-caption {
		margin: 0;
		font-size: var(--deck-body);
		opacity: 0.7;
		min-height: 1.5em;
	}

	/* Both states share one grid cell and crossfade in place. This is only legal
	   because every cell is explicitly placed: grid auto-placement refuses to
	   overlap and pushes the second state into implicit columns instead. */
	.row {
		display: grid;
		gap: 0.4rem;
		width: 100%;
		max-width: 40rem;
	}

	.row-color {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}

	.row-strings {
		grid-template-columns: minmax(0, 1fr);
	}

	/* The color and forms rows set this inline per item; this row has a single
	   before-cell and would otherwise be auto-placed, which means grid pushes it
	   into an implicit second column rather than letting it share the cell with
	   the after-state. Same trap that broke the equivalent row on ModulabsSlide. */
	.row-strings > .before {
		grid-column: 1;
	}

	.row-forms {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.cell {
		grid-row: 1;
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 5px;
		padding: 0.4rem 0.6rem;
		font-size: var(--deck-meta);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dashed {
		border-style: dashed;
		background: color-mix(in srgb, currentColor 4%, transparent);
	}

	/* No label: five bars carrying one value between them, drifting apart. Words
	   here would be five copies of the same word. */
	.swatch {
		border-style: dashed;
	}

	.small {
		font-size: var(--deck-meta);
		opacity: 0.75;
	}

	/* Hidden in CSS as well as by the onMount set: onMount runs after the first
	   paint, so without this the after-state flashes on entry. */
	.after {
		grid-column: 1 / -1;
		background: color-mix(in srgb, currentColor 9%, transparent);
		font-weight: 600;
		font-size: var(--deck-body);
		opacity: 0;
	}

	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: var(--deck-body);
		opacity: 0.85;
	}

	.note {
		padding-left: 1rem;
		position: relative;
		visibility: hidden;
		opacity: 0;
	}

	.note::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.62em;
		width: 0.4rem;
		height: 1px;
		background: currentColor;
		opacity: 0.5;
	}

	@media (max-width: 760px) {
		.body {
			grid-template-columns: 1fr;
		}

		/* The recording drops below the explanation on a phone — the words matter
		   more than the proof when there is only one column to spend. */
		.media {
			order: 2;
			max-width: 11rem;
		}

		/* Five bars and four form names stop being readable well before the deck's
		   minimum width. Keep one of each: the before-state is carried by the
		   caption at that size, and the crossfade stays honest. */
		.row-color,
		.row-forms {
			grid-template-columns: minmax(0, 1fr);
		}

		.row-color > .before:not(:first-child),
		.row-forms > .before:not(:first-child) {
			display: none;
		}
	}
</style>
