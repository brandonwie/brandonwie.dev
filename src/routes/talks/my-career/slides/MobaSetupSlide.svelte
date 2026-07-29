<!--
  S5 — MOBA, the setup (0:20)

  The shortest slide in the deck, and the only one whose job is purely to set
  scale. Everything after it — four sync slides, infrastructure, the data
  pipeline — is unreadable without knowing what the system grew into.

  THE FRAME IS CLOSED BETA → PUBLIC, not just "numbers went up". Brandon was
  handed the system in closed beta; it went public underneath him. That is a
  different and better claim than growth alone, because it names what changed
  about the system's obligations, not only its size.

  ROLE WORDING IS THE CV'S, VERBATIM: "lead backend engineering" and "built and
  own the core Calendar Sync Engine". An earlier draft said "sole backend
  owner"; that had no verified row, and "sole" is an escalation the panel cannot
  check. See facts.md § Role and scale (S5).

  EACH MULTIPLE SITS ON ITS OWN ROW. Users went 120 → 6.5k, which is ≈54x.
  Events went 200k → 7M, which is 35x. A single multiple floating over both rows
  would silently claim one metric's ratio for the other; per-row means every
  figure on the slide is recomputable from the two numbers printed beside it.
  See facts.md C2.

  BOTH FIGURES CORRECTED 2026-07-29 (Brandon, mid-walk). Users read 6,000+ and
  events started at 500k; the real numbers are 6.5k+ and 200k. That moves the
  event multiple from 14x to 35x, and the user multiple from the CV's 50x to 54x
  — the recomputability rule above is what forces the second change, since 6.5k
  over 120 does not come to 50 and this audience does arithmetic. The CV's ~50x
  was true against 6,000; the slide says "today", which is what lets the two
  differ without reading as a discrepancy.

  The bars are not decoration. Two numbers side by side are arithmetic; a sliver
  becoming a full track is the ratio, read instantly.

  PUBLISH-SAFE: user and event counts only, no MOBA-internal architecture. Keep
  it that way — the repo this lives in is public.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	function events(v: number): string {
		if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
		return `${Math.round(v / 1000)}k`;
	}

	// Switches to `k` at a thousand so the counter's units match where it lands.
	// Rendering the run as 1,340 and the rest as 6.5k would change notation at the
	// exact moment the eye stops moving, which reads as a glitch rather than as
	// the number settling.
	function users(v: number): string {
		if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
		return `${Math.round(v)}`;
	}

	// `fromLabel` / `toLabel` are the exact resting wording; `fmt` only renders
	// the in-between frames while the counter is moving. That keeps the two
	// states under the ledger's control and lets the motion be approximate.
	const METRICS = [
		{
			key: 'users',
			label: 'Users',
			from: 120,
			to: 6500,
			fromLabel: '~120',
			toLabel: '6.5k+',
			multiple: '≈54x',
			fmt: users,
		},
		{
			key: 'events',
			label: 'Events',
			from: 200_000,
			to: 7_000_000,
			fromLabel: '200k',
			toLabel: '7M+',
			multiple: '≈35x',
			fmt: events,
		},
	];

	const notes = ['Lead backend engineering', 'Built and own the core Calendar Sync Engine'];

	let root = $state<HTMLElement>();
	let grown = $state(false);
	let settled = $state(true);
	let counts = $state(METRICS.map((m) => m.from));
	let ready = $state(false);
	let applied = -1;

	const display = $derived(
		METRICS.map((m, i) => (settled ? (grown ? m.toLabel : m.fromLabel) : m.fmt(counts[i]))),
	);

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
			gsap.set(root.querySelectorAll('.multiple'), { autoAlpha: 0 });
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
		if (!root) return;

		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = target >= 1;

		grown = want;
		await tick();

		// Slower than the deck default: this is the one animation whose duration
		// is carrying meaning. A climb that finishes as fast as a box swap does
		// not read as a climb.
		const growth = DURATION * 1.8;
		const fills = root.querySelectorAll('.fill');

		METRICS.forEach((m, i) => {
			const to = want ? m.to : m.from;
			const width = want ? '100%' : `${(m.from / m.to) * 100}%`;
			const fill = fills[i];

			if (still) {
				counts[i] = to;
				if (fill) gsap.set(fill, { width });
				return;
			}

			const proxy = { v: counts[i] };
			gsap.to(proxy, {
				v: to,
				duration: growth,
				ease: EASE,
				onUpdate: () => (counts[i] = proxy.v),
			});
			if (fill) gsap.to(fill, { width, duration: growth, ease: EASE });
		});

		if (still) {
			settled = true;
		} else {
			settled = false;
			gsap.delayedCall(growth, () => {
				METRICS.forEach((m, i) => (counts[i] = want ? m.to : m.from));
				settled = true;
			});
		}

		// The multiple lands with the bar, not before it — it is the answer to the
		// motion, so it cannot arrive while the bar is still climbing.
		gsap.to(root.querySelectorAll('.multiple'), {
			autoAlpha: want ? 1 : 0,
			duration: DURATION * d,
			ease: EASE,
			delay: want ? growth * 0.85 * d : 0,
		});

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: want ? 1 : 0,
			y: want ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: want ? growth * 0.7 * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA &middot; 2025 &ndash; now</p>
		<!--
			NOT "Where the backend had to keep up" — a topic sentence, and passive on
			the one slide that establishes scope. The header above says the frame is
			closed beta to public: what changed was the system's obligations, not only
			its size. That is the claim, so it is the headline.
		-->
		<h1>It went public underneath me</h1>
		<p class="state">
			{#if grown}
				Public &mdash; the same engine today
			{:else}
				Closed beta &mdash; when the system was handed to me
			{/if}
		</p>
	</header>

	<!-- One grid for both metrics, so the numbers and the bars line up in
	     columns. Every column is fixed width, so nothing moves when the figures
	     change length. -->
	<div class="metrics">
		{#each METRICS as metric, i (metric.key)}
			<span class="metric-label">{metric.label}</span>
			<span class="count">{display[i]}</span>
			<div class="track">
				<div class="fill" style="width: {(metric.from / metric.to) * 100}%"></div>
			</div>
			<span class="multiple">{metric.multiple}</span>
		{/each}
	</div>

	<ul class="notes">
		{#each notes as note (note)}
			<li class="note">{note}</li>
		{/each}
	</ul>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.35rem, 3.5vh, 2.25rem);
	}

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

	.state {
		margin: 0.4rem 0 0;
		font-size: var(--deck-subtitle);
		opacity: 0.6;
	}

	.metrics {
		display: grid;
		grid-template-columns: auto 7ch minmax(0, 1fr) auto;
		align-items: center;
		column-gap: clamp(0.9rem, 2.5vw, 1.75rem);
		row-gap: clamp(0.9rem, 2.4vh, 1.5rem);
	}

	.metric-label {
		font-size: var(--deck-meta);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	.count {
		font-size: var(--deck-heading);
		font-weight: 600;
		letter-spacing: -0.01em;
		/* Tabular figures plus a fixed column, or the track start shifts sideways
		   for the whole length of the count-up. */
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.track {
		height: clamp(0.7rem, 1.6vh, 1rem);
		border-radius: 999px;
		background: color-mix(in srgb, currentColor 10%, transparent);
		overflow: hidden;
	}

	/* Starting widths are the real ratios — 2% for users, 7.1% for events — so
	   the two bars begin at visibly different places and grow by different
	   amounts. Equalising them would flatten the one honest thing the bars say. */
	.fill {
		height: 100%;
		border-radius: 999px;
		background: color-mix(in srgb, currentColor 55%, transparent);
	}

	/* `visibility: hidden` rather than `display: none`, so the column keeps its
	   width at step 1 and the tracks do not shorten when the multiples appear. */
	.multiple {
		font-size: var(--deck-meta);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		opacity: 0;
		visibility: hidden;
	}

	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
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
		.metrics {
			grid-template-columns: auto 7ch minmax(0, 1fr);
		}

		/* The bar drops to its own full-width row; at this size a third column
		   leaves it too short to read as a ratio. */
		.track {
			grid-column: 1 / -1;
		}
	}
</style>
