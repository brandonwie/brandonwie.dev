<!--
  S6 — Sync: account separation (0:45) · cut-3

  The first of the sync-engine beats. Before, a user account and a calendar
  account were the same object: connect one, and that was the only one you
  ever got. After, the two identities are separate, so a user can connect
  several calendar accounts and sync several calendars from each.

  THE ANIMATION IS ONE MOVE: the calendar account leaves the user account. Flip
  carries the same node out of the box it was nested in, which is the same
  visual sentence the MODULABS gateway and the Playtag seat already taught —
  containment means coupling.

  Two accounts with two calendars each, NOT a number and NOT "unlimited".
  facts.md records this as "multi-account, multi-calendar sync"; the storyboard
  says "unlimited", which is the looser of the two, so the tighter one wins. Two
  of each is enough to show the shape without asserting a ceiling.

  PUBLISH-SAFE: a product capability any user of the app can observe, with no
  internal architecture. Keep it that way — the repo this lives in is public.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { loadGsap, EASE, DURATION, reducedMotion } from '$lib/components/deck/gsap';

	let { step = 0, animate = true }: { step?: number; animate?: boolean } = $props();

	const notes = [
		'One user can connect multiple calendar accounts',
		'Each connected account can sync multiple calendars',
	];

	let root = $state<HTMLElement>();
	let separated = $state(false);
	let ready = $state(false);
	let applied = -1;

	onMount(async () => {
		const { gsap } = await loadGsap();
		if (root) {
			gsap.set(root.querySelectorAll('.note'), { autoAlpha: 0, y: 6 });
			gsap.set(root.querySelectorAll('.chip, .second'), { autoAlpha: 0 });
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
		const { gsap, Flip } = await loadGsap();
		if (!root) return;

		const still = !animate || reducedMotion();
		const d = still ? 0 : 1;
		const want = target >= 1;

		if (want !== separated) {
			// Capture before Svelte moves the node. The {#if} destroys and recreates
			// it, so data-flip-id is what matches the old position to the new element.
			const state = still ? null : Flip.getState(root.querySelectorAll('[data-flip-id]'));

			separated = want;
			await tick();

			if (state) Flip.from(state, { duration: DURATION, ease: EASE, absolute: true });
		}

		await tick();

		// The second account and the calendars arrive after the move lands, so the
		// slide reads as one thing leaving and then the room it made being used —
		// not as four elements appearing at once.
		gsap.to(root.querySelectorAll('.second'), {
			autoAlpha: want ? 1 : 0,
			duration: DURATION * d,
			ease: EASE,
			delay: want ? DURATION * 0.8 * d : 0,
		});

		gsap.to(root.querySelectorAll('.chip'), {
			autoAlpha: want ? 1 : 0,
			duration: DURATION * 0.8 * d,
			stagger: 0.06 * d,
			ease: EASE,
			delay: want ? DURATION * 1.05 * d : 0,
		});

		gsap.to(root.querySelectorAll('.note'), {
			autoAlpha: want ? 1 : 0,
			y: want ? 0 : 6,
			duration: DURATION * d,
			stagger: 0.07 * d,
			ease: EASE,
			delay: want ? DURATION * 1.3 * d : 0,
		});
	}
</script>

<section class="slide" bind:this={root}>
	<header>
		<p class="company">MOBA</p>
		<!-- Short enough to hold one line at the deck's title size. The longer
		     "Separating who you are from what you sync" wrapped to two, and this is
		     the only slide in the deck that would have done so. -->
		<h1>Splitting the calendar from the user</h1>
		<p class="state">
			{#if separated}
				After &mdash; one user, several calendar accounts, several calendars each
			{:else}
				Before &mdash; the calendar account was the user account
			{/if}
		</p>
	</header>

	<!-- Fixed columns and a reserved height. The right column is empty at step 1
	     on purpose: the space the accounts will occupy is already allocated, so
	     nothing on the left moves when they arrive. -->
	<div class="board">
		<div class="user-box">
			<span class="box-title">User account</span>

			{#if !separated}
				<div class="account nested" data-flip-id="calendar-account">
					<span class="box-title">Calendar account</span>
					<span class="box-note">one, and only ever one</span>
				</div>
			{:else}
				<!-- The box would otherwise sit empty at its reserved height and read
				     as unfinished rather than as deliberately emptied. -->
				<span class="box-note second">identity only &mdash; nothing calendar-shaped left in it</span
				>
			{/if}
		</div>

		<div class="accounts">
			{#if separated}
				<div class="account" data-flip-id="calendar-account">
					<span class="box-title">Calendar account</span>
					<div class="chips">
						<span class="chip">Calendar</span>
						<span class="chip">Calendar</span>
					</div>
				</div>
				<div class="account second">
					<span class="box-title">Calendar account</span>
					<div class="chips">
						<span class="chip">Calendar</span>
						<span class="chip">Calendar</span>
					</div>
				</div>
			{/if}
		</div>
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

	.board {
		display: grid;
		grid-template-columns: minmax(0, 21rem) minmax(0, 24rem);
		justify-content: start;
		align-items: start;
		column-gap: clamp(1.5rem, 5vw, 4rem);
		/* Reserved for the tallest state — two account boxes — so the slide cannot
		   grow when the second one appears. */
		min-height: clamp(12rem, 27vh, 15.5rem);
	}

	.user-box {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, currentColor 4%, transparent);
		padding: clamp(0.75rem, 1.8vw, 1.1rem);
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		/* Fixed, or the box shrinks the moment the nested account leaves it and the
		   one element that did not change becomes the one that moves. */
		height: clamp(8.5rem, 19vh, 11rem);
	}

	.accounts {
		display: flex;
		flex-direction: column;
		gap: clamp(0.6rem, 1.5vh, 0.9rem);
	}

	.account {
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, currentColor 9%, transparent);
		padding: clamp(0.6rem, 1.5vw, 0.9rem) clamp(0.7rem, 1.8vw, 1.1rem);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Nested means coupled — the same visual sentence as the MODULABS gateway and
	   the Playtag seat. The audience has read it twice before this slide. */
	.nested {
		background: color-mix(in srgb, currentColor 9%, transparent);
	}

	.box-title {
		font-size: var(--deck-heading);
		font-weight: 600;
	}

	.box-note {
		font-size: var(--deck-meta);
		opacity: 0.55;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.chip {
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
		font-size: var(--deck-meta);
		opacity: 0;
		visibility: hidden;
	}

	.second {
		visibility: hidden;
		opacity: 0;
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
		.board {
			grid-template-columns: minmax(0, 1fr);
			row-gap: clamp(0.6rem, 1.5vh, 0.9rem);
			min-height: 0;
		}

		.user-box {
			height: auto;
		}
	}
</style>
