<!--
  S15 — Close (0:30) · never cut

  Returns to the S1 arc, now with mono on the end, then answers the three scope
  items from Sarah's first message IN HER ORDER:

    1. 신규 프로젝트 mono full stack
    2. 스토리라인 제품 내 AI narrative (prompt engineering)
    3. 향후 devops까지 확장 (optional)

  Her order is kept deliberately, including "optional" on devops. Reordering it
  to lead with the most impressive layer would be answering a different
  question than the one she asked.

  END ON THE PRODUCT, NOT ON YOURSELF — storyboard S15. The last line on the
  deck is about what ships and in what order, not about the candidate.

  THE CALLBACK IS THE ARC. The same four capability labels the audience saw on
  S1 come back verbatim; only the fifth node is new. Rewording them here would
  break the callback and cost the payoff.

  mono's own capability cell is deliberately EMPTY at step 0 — the three rows
  underneath are what fill it, and they arrive on the advance.

  PUBLISH-SAFE: company names and a public product name. The scope items came
  from a recruiting message, so they are paraphrased to the role, not quoted in
  Korean, and nothing about internal task lists appears.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	// Labels 1-4 are verbatim from ArcSlide. Do not reword them here.
	const stops = [
		{ company: 'MODULABS', years: '2021 – 2023', gained: 'Frontend web', next: false },
		{ company: 'Moviation', years: '2023', gained: 'Frontend mobile · web', next: false },
		{ company: 'Playtag', years: '2023 – 2025', gained: 'Full-stack', next: false },
		{ company: 'MOBA', years: '2025 – now', gained: 'Lead backend · Infra', next: false },
		{ company: 'mono', years: 'next', gained: '', next: true },
	];

	const scope = [
		{
			n: '1',
			item: 'mono, full-stack',
			backing: 'Playtag full-stack, then owning a backend at MOBA',
		},
		{
			n: '2',
			item: 'StoryLine, AI narrative',
			backing: 'The agent workflow I run on my own system every day',
		},
		{
			n: '3',
			item: 'devops, later',
			backing: 'Terraform and AWS already, whenever it earns the time',
		},
	];

	let root = $state<HTMLElement>();
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (!root) return;

		gsap.set(root.querySelector('.rail-line'), { scaleX: 0, transformOrigin: 'left center' });
		gsap.set(root.querySelectorAll('.stop'), { autoAlpha: 0, y: 8 });
		gsap.set(root.querySelectorAll('.scope-row'), { autoAlpha: 0, y: 6 });
		gsap.set(root.querySelector('.last'), { autoAlpha: 0, y: 6 });

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

		const d = !animate || reducedMotion() ? 0 : 1;
		const want = target >= 1;

		const timeline = gsap.timeline();

		timeline.to(root.querySelector('.rail-line'), { scaleX: 1, duration: 0.6 * d, ease: EASE });

		// The fifth node arrives last in the stagger, which is the callback.
		timeline.to(
			root.querySelectorAll('.stop'),
			{ autoAlpha: 1, y: 0, duration: DURATION * d, stagger: 0.08 * d, ease: EASE },
			d ? '-=0.25' : 0,
		);

		timeline.to(
			root.querySelectorAll('.scope-row'),
			{
				autoAlpha: want ? 1 : 0,
				y: want ? 0 : 6,
				duration: DURATION * d,
				stagger: 0.09 * d,
				ease: EASE,
			},
			d ? '-=0.1' : 0,
		);

		timeline.to(
			root.querySelector('.last'),
			{ autoAlpha: want ? 1 : 0, y: want ? 0 : 6, duration: DURATION * d, ease: EASE },
			d ? '-=0.2' : 0,
		);
	}
</script>

<section class="slide" bind:this={root}>
	<h1>Four layers, three things the role asks for</h1>

	<div class="rail">
		<div class="rail-line" aria-hidden="true"></div>

		<ol class="stops">
			{#each stops as stop (stop.company)}
				<li class="stop" class:next={stop.next}>
					<span class="dot" aria-hidden="true"></span>
					<span class="company">{stop.company}</span>
					<span class="years">{stop.years}</span>
					<span class="gained">{stop.gained}</span>
				</li>
			{/each}
		</ol>
	</div>

	<ol class="scope">
		{#each scope as row (row.n)}
			<li class="scope-row">
				<span class="n">{row.n}</span>
				<span class="item">{row.item}</span>
				<span class="backing">{row.backing}</span>
			</li>
		{/each}
	</ol>

	<p class="last">In that order.</p>
</section>

<style>
	.slide {
		width: 100%;
		max-width: 82rem;
		display: flex;
		flex-direction: column;
		gap: clamp(1.5rem, 4vh, 2.5rem);
	}

	h1 {
		font-size: var(--deck-title);
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0;
	}

	.rail {
		position: relative;
		padding-top: 1.5rem;
	}

	.rail-line {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: currentColor;
		opacity: 0.35;
	}

	.dot {
		position: absolute;
		top: calc(-1.5rem - 3px);
		left: 0;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}

	/* mono has not happened yet, so its node is outlined rather than filled. */
	.stop.next .dot {
		background: transparent;
		border: 1px solid currentColor;
	}

	.stops {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 1rem;
	}

	.stop {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.company {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.years {
		font-size: var(--deck-meta);
		opacity: 0.55;
		font-variant-numeric: tabular-nums;
	}

	/* Empty on the mono node, but the rule still reserves its height so the five
	   columns share one baseline. */
	.gained {
		margin-top: 0.5rem;
		min-height: 1.5em;
		font-size: var(--deck-body);
		border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		padding-top: 0.5rem;
	}

	.scope {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.scope-row {
		display: grid;
		grid-template-columns: 1.5rem minmax(0, 14rem) minmax(0, 1fr);
		align-items: baseline;
		gap: 1rem;
		visibility: hidden;
		opacity: 0;
	}

	.n {
		font-size: var(--deck-meta);
		opacity: 0.45;
		font-variant-numeric: tabular-nums;
	}

	.item {
		font-size: var(--deck-body);
		font-weight: 600;
	}

	.backing {
		font-size: var(--deck-body);
		opacity: 0.7;
	}

	.last {
		margin: 0;
		font-size: var(--deck-subtitle);
		opacity: 0.6;
		min-height: 1.6em;
		visibility: hidden;
	}

	@media (max-width: 900px) {
		.rail {
			padding-top: 0;
		}

		.rail-line,
		.dot {
			display: none;
		}

		.stops {
			grid-template-columns: repeat(3, 1fr);
			gap: 1.25rem;
		}

		.scope-row {
			grid-template-columns: 1.25rem 1fr;
		}

		.backing {
			grid-column: 2;
		}
	}
</style>
