<!--
  S10 — Infrastructure (1:00) · cut-2

  Four separate before/after pairs on one slide, because they are one story:
  the infrastructure had no single source of truth, no headroom, no edge, and
  no cost discipline. Splitting them across four slides would spend four times
  the stage time to make the same point once.

  ONE ADVANCE SWAPS ALL FOUR ROWS. The labels and the row geometry hold still;
  only the state boxes change. Four simultaneous swaps read as one systemic
  change, which is exactly what it was — not four unrelated tickets.

  Both numbers (~95% attack surface, ~15% cost) are on the submitted CV and sit
  inside the after-note that says what they measure. A bare "95%" in its own
  column invites the panel to guess the denominator.

  PUBLISH-SAFE: every line here is at the level already printed on the CV —
  named AWS services and directions of change, no account identifiers, no CIDR
  ranges, no rule contents, no topology anyone could act on. Keep it that way;
  this is the most internal slide in the deck and the repo it lives in is
  public.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const ROWS = [
		{
			key: 'state',
			label: 'State',
			before: {
				title: 'Local tfvars and tfstate',
				note: 'drift against the real AWS account; some resources manual or CloudFormation',
			},
			after: {
				title: 'Remote state on S3 and DynamoDB',
				note: 'every resource Terraform-managed, from one source of truth',
			},
		},
		{
			key: 'capacity',
			label: 'Capacity',
			before: {
				title: 'A single ECS task',
				note: 'no autoscaling, and migrations rode along with the app deploy',
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
				title: 'Everything in public subnets',
				note: 'open to the internet',
			},
			after: {
				title: 'Path-based WAF rules and a locked-down allowlist',
				note: 'about 95% less attack surface; moving to private subnets behind a bastion',
			},
		},
		{
			key: 'cost',
			label: 'Cost',
			before: {
				title: 'Paying for what was not used',
				note: 'oversized instances, an empty private subnet, NAT charges',
			},
			after: {
				title: 'Right-sized, with unused resources removed',
				note: 'about 15% lower infra cost; the NAT optimization alone was about $60 a month',
			},
		},
	];

	let root = $state<HTMLElement>();
	let after = $state(false);
	let ready = $state(false);
	let applied = -1;

	onMount(() => {
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
		const want = target >= 1;

		if (want !== after) {
			after = want;
			await tick();

			// Staggered top to bottom so four simultaneous swaps read as a sweep
			// down the list rather than as the whole slide blinking.
			const boxes = root.querySelectorAll('.state-swap');
			if (boxes.length && !still) {
				gsap.fromTo(
					boxes,
					{ autoAlpha: 0, x: -8 },
					{ autoAlpha: 1, x: 0, duration: DURATION, stagger: 0.07, ease: EASE },
				);
			}
		}
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA</p>
		<h1>Rebuilding the infrastructure</h1>
		<p class="state">
			{#if after}
				After &mdash; one source of truth, room to grow, and a closed edge
			{:else}
				Before &mdash; drifting state, one task, and everything facing the internet
			{/if}
		</p>
	</header>

	<!-- Two fixed columns. The labels never move; only the boxes beside them
	     change, so the eye tracks one axis. -->
	<div class="rows">
		{#each ROWS as row (row.key)}
			<span class="row-label">{row.label}</span>

			{#if after}
				<div class="state-box state-swap is-after">
					<span class="box-title">{row.after.title}</span>
					<span class="box-note">{row.after.note}</span>
				</div>
			{:else}
				<div class="state-box state-swap">
					<span class="box-title">{row.before.title}</span>
					<span class="box-note">{row.before.note}</span>
				</div>
			{/if}
		{/each}
	</div>
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

	.rows {
		display: grid;
		grid-template-columns: auto minmax(0, 46rem);
		justify-content: start;
		align-items: stretch;
		column-gap: clamp(1rem, 3vw, 2.5rem);
		row-gap: clamp(0.5rem, 1.3vh, 0.8rem);
		/* Every row is the height of a two-line note, whether or not its current
		   text needs two lines. Sizing rows to their content made row 1 tall
		   before and short after, and row 4 the reverse — so all four rows walked
		   up and down the slide on a single advance. */
		grid-auto-rows: clamp(5.25rem, 11vh, 6.5rem);
	}

	.row-label {
		display: flex;
		align-items: center;
		font-size: var(--deck-meta);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	.state-box {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, currentColor 4%, transparent);
		padding: clamp(0.5rem, 1.2vw, 0.8rem) clamp(0.7rem, 1.6vw, 1rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.15rem;
		height: 100%;
	}

	.is-after {
		background: color-mix(in srgb, currentColor 9%, transparent);
	}

	.box-title {
		font-size: var(--deck-body);
		font-weight: 600;
	}

	.box-note {
		font-size: var(--deck-meta);
		opacity: 0.55;
	}

	@media (max-width: 760px) {
		.rows {
			grid-template-columns: minmax(0, 1fr);
			row-gap: 0.25rem;
		}

		.row-label {
			margin-top: 0.5rem;
		}
	}
</style>
