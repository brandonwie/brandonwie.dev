<!--
  S5 — Playtag, the backend seat (0:45)

  The second half of the Playtag section, and the pivot point of the whole arc:
  this is where frontend became full-stack, not by plan but because the seat was
  empty and nobody else wrote JavaScript.

  Same three-stage shape as the admin slide so the section reads as one chapter.

  CAUTION — the concurrency figure is Brandon's recollection, not on the CV or
  in any verified source. He recalled "20 to 40" and chose to state "around 20"
  precisely because he is unsure: understating costs nothing if the real number
  was higher, while overstating in front of people who can check does. Do not
  raise it without evidence. See facts.md.

  Do NOT claim ownership of the Spring repository or service layers (facts.md
  C3). Brandon took part in that migration; he did not lead it. "Led" appears
  exactly once on this slide, on the GitLab to GitHub migration, and that is
  what makes the other verbs read as deliberate rather than modest.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const notes = [
		'The only JavaScript engineer on the team when the backend seat opened; became core maintainer of the NestJS service',
		// "Participated", not "contributed": Brandon gave opinions on the schema
		// but did not own the design. Below CV wording on purpose — going under
		// what the CV claims is always safe, going over never is.
		'Participated in the schema redesign for grade and class transitions, with full history preserved',
		// "Took part in", not "supported": Brandon did hands-on work in the
		// migration rather than assisting from the side. Still not "led" — see
		// facts.md C3.
		'Took part in the migration to Kotlin and Spring Boot; the NestJS service kept serving production',
		'Led the migration from GitLab to GitHub',
		'Infrastructure management, EFK logging, GitHub CI/CD',
	];

	let root = $state<HTMLElement>();
	let parallel = $state(false);
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
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

		if (want !== parallel) {
			parallel = want;
			await tick();

			const swapped = root.querySelector('.stage-swap');
			if (swapped && !still) {
				gsap.fromTo(
					swapped,
					{ autoAlpha: 0, scale: 0.94 },
					{ autoAlpha: 1, scale: 1, duration: DURATION, ease: EASE },
				);
			}

			// The lanes are the point of this slide: one becomes many.
			const lanes = root.querySelectorAll('.lane');
			if (lanes.length && !still) {
				gsap.fromTo(
					lanes,
					{ autoAlpha: 0, x: -8 },
					{ autoAlpha: 1, x: 0, duration: DURATION, stagger: 0.05, ease: EASE },
				);
			}
		}

		await tick();

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: target >= 1 ? 1 : 0,
			y: target >= 1 ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: target >= 1 ? DURATION * 0.6 * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">Playtag</p>
		<h1>Taking the empty backend seat</h1>
		<p class="state">
			{#if parallel}
				After — a tuned connection pool, companies registering in parallel
			{:else}
				Before — the research pipeline registered one company at a time
			{/if}
		</p>
	</header>

	<div class="pipeline">
		<div class="stage"><span class="stage-title">Research pipeline</span></div>

		<span class="arrow" aria-hidden="true">&rarr;</span>

		{#if parallel}
			<div class="stage stage-swap is-parallel">
				<span class="stage-title">Parallel requests</span>
				<span class="stage-note">pool size tuned; around 20 at a time</span>
				<div class="lanes" aria-hidden="true">
					{#each Array(6) as _, i (i)}
						<span class="lane"></span>
					{/each}
				</div>
			</div>
		{:else}
			<div class="stage stage-swap">
				<span class="stage-title">Linear processing</span>
				<span class="stage-note">one company at a time</span>
				<div class="lanes" aria-hidden="true">
					<span class="lane is-single"></span>
				</div>
			</div>
		{/if}

		<span class="arrow" aria-hidden="true">&rarr;</span>

		<div class="stage"><span class="stage-title">Companies registered</span></div>
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

	.pipeline {
		display: grid;
		grid-template-columns: auto auto auto auto auto;
		justify-content: start;
		align-items: stretch;
		column-gap: clamp(0.6rem, 1.8vw, 1.5rem);
	}

	.stage {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		padding: clamp(0.6rem, 1.5vw, 1rem) clamp(0.75rem, 2vw, 1.25rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
		min-width: clamp(9rem, 16vw, 13rem);
	}

	/* Fixed width and reserved height: the label change must not resize the box,
	   or it shoves the stage after it sideways and grows a centred slide. */
	.stage-swap {
		width: clamp(14rem, 26vw, 25rem);
		min-height: clamp(6.5rem, 13vh, 8rem);
	}

	.is-parallel {
		background: color-mix(in srgb, currentColor 9%, transparent);
	}

	.stage-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.stage-note {
		font-size: var(--deck-meta);
		opacity: 0.55;
	}

	/* One bar becomes six. The count is illustrative, not a measurement — the
	   number that matters is in the note, where it can be qualified. */
	.lanes {
		display: flex;
		gap: 3px;
		margin-top: 0.4rem;
		height: 6px;
	}

	.lane {
		flex: 1;
		border-radius: 2px;
		background: currentColor;
		opacity: 0.45;
	}

	.is-single {
		flex: 0 0 22%;
	}

	.arrow {
		align-self: center;
		font-size: var(--deck-body);
		opacity: 0.45;
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
		.pipeline {
			grid-template-columns: 1fr;
			row-gap: 0.6rem;
		}

		.stage-swap {
			width: auto;
		}

		.arrow {
			display: none;
		}
	}
</style>
