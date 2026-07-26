<!--
  S5 — Playtag, the backend seat (0:45)

  The second half of the Playtag section, and the pivot point of the whole arc:
  this is where frontend became full-stack, because the backend seat opened and
  Brandon was the one already writing JavaScript.

  THE ANIMATION CARRIES THE TURN, NOT A TASK. An earlier version made the hero
  beat a connection-pool tuning; that is a task, and burying the pivot under it
  wasted the one slide where the arc actually bends. The pool work is a note now.

  The filled seat spans both rows — deliberately the same visual idea as the
  MODULABS gateway, so the audience reads it without being taught it twice.

  Note the slide shows the FACT (seat empty, then filled, no gap). The readiness
  behind it — being prepared and waiting for the chance — is Brandon's to say
  out loud; as a printed claim about himself it would be weak.

  The connection-pool work was cut entirely (2026-07-26). It was a task, not a
  turn, and it carried the deck's only soft number. It stays in facts.md for
  Q&A; do not re-add it here.

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
		// "Participated", not "contributed": Brandon gave opinions on the schema
		// but did not own the design. Below CV wording on purpose — going under
		// what the CV claims is always safe, going over never is.
		'Participated in the schema redesign for grade and class transitions, with full history preserved',
		// "Took part in", not "supported": Brandon did hands-on work in the
		// migration rather than assisting from the side. Still not "led" — see
		// facts.md C3.
		'Took part in the migration to Kotlin and Spring Boot; the NestJS service kept serving production',
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

			// The filled seat grows into the space the vacancy left, so the change
			// reads as one motion closing a gap rather than two boxes swapping.
			const seat = root.querySelector('.filled');
			if (seat && !still) {
				gsap.fromTo(
					seat,
					{ autoAlpha: 0, scaleY: 0.7 },
					{
						autoAlpha: 1,
						scaleY: 1,
						duration: DURATION,
						ease: EASE,
						transformOrigin: 'top center',
					},
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
				After — I took it the moment it opened, and kept the frontend
			{:else}
				Before — I was on the frontend, and the one who mainly wrote JavaScript
			{/if}
		</p>
	</header>

	<!--
		The span is the whole slide: one engineer covering both rows where there
		used to be a gap. Deliberately the same visual idea as the MODULABS
		gateway, so the audience reads it without being taught it twice.
	-->
	<div class="seats">
		<span class="role" style="grid-row: 1">Frontend</span>
		<span class="role" style="grid-row: 2">Backend</span>

		<!-- The label carries the change as much as the geometry does: the same
		     person, renamed by what he now covers. -->
		{#if parallel}
			<div class="seat filled">
				<span class="seat-title">Full-stack Brandon</span>
				<span class="seat-note">core maintainer of the NestJS service</span>
			</div>
		{:else}
			<div class="seat" style="grid-row: 1">
				<span class="seat-title">Frontend Brandon</span>
			</div>
			<div class="seat vacant" style="grid-row: 2">
				<span class="seat-title">Unfilled</span>
				<span class="seat-note">a TypeScript service with no one to run it</span>
			</div>
		{/if}
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

	/* Fixed row heights so the seat boxes are identical in both states and the
	   slide cannot grow when the vacancy is filled. */
	.seats {
		display: grid;
		grid-template-columns: auto minmax(0, 28rem);
		grid-template-rows: repeat(2, clamp(4rem, 8vh, 5.5rem));
		justify-content: start;
		align-items: stretch;
		column-gap: clamp(0.75rem, 2.5vw, 2rem);
		row-gap: 0.6rem;
	}

	.role {
		grid-column: 1;
		display: flex;
		align-items: center;
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.seat {
		grid-column: 2;
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		padding: clamp(0.6rem, 1.5vw, 1rem) clamp(0.75rem, 2vw, 1.25rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
	}

	/* The vacancy reads as absence: dashed, dimmed, no substance. */
	.vacant {
		border-style: dashed;
		background: none;
		opacity: 0.5;
	}

	.filled {
		grid-row: 1 / 3;
		background: color-mix(in srgb, currentColor 9%, transparent);
	}

	.seat-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.seat-note {
		font-size: var(--deck-meta);
		opacity: 0.55;
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
		.seats {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto;
			row-gap: 0.4rem;
		}

		/* Role labels sit above their seat rather than beside it; the span that
		   carries the idea on a wide screen has no room to work here. */
		.role,
		.seat,
		.filled {
			grid-column: 1;
			grid-row: auto;
		}
	}
</style>
