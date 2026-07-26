<!--
  SlideVideo — a muted, looping product recording.

  WHY VIDEO, NOT GIF: a GIF cannot be paused, so it competes with the slide's
  own step animation and with the speaker. These are the real products, which
  is worth showing, but only one thing on screen should move at a time. Video
  also costs a fraction of the bytes — the two source GIFs were 3.5MB together;
  as MP4 plus WebM they are around 400KB.

  Pass `paused` while a step animation runs, then release it.
-->
<script lang="ts">
	import { reducedMotion } from './gsap';

	let {
		src,
		label,
		paused = false,
	}: {
		/** Basename without extension; `.webm` and `.mp4` are both served. */
		src: string;
		/** Describes the recording for anyone who cannot see it. */
		label: string;
		paused?: boolean;
	} = $props();

	let el = $state<HTMLVideoElement>();

	$effect(() => {
		if (!el) return;

		// Reduced motion holds the first frame rather than hiding the evidence.
		if (paused || reducedMotion()) {
			el.pause();
		} else {
			// A rejected play() is not an error worth surfacing — some browsers
			// refuse autoplay until the page has been interacted with, and the
			// next advance will retry.
			void el.play().catch(() => {});
		}
	});
</script>

<video
	bind:this={el}
	class="slide-video"
	muted
	loop
	playsinline
	autoplay
	preload="metadata"
	aria-label={label}
>
	<source src="{src}.webm" type="video/webm" />
	<source src="{src}.mp4" type="video/mp4" />
</video>

<style>
	.slide-video {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 8px;
		border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
		background: color-mix(in srgb, currentColor 4%, transparent);
	}
</style>
