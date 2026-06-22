<script lang="ts">
	/**
	 * TypedText — types a string character-by-character with a blinking cursor.
	 *
	 * Ports the mockup's hero typing effect. Runs client-side only (onMount); SSR
	 * renders an empty span, so the page is never blank of meaning that matters for
	 * SEO (the text is decorative flavor). Honors prefers-reduced-motion by showing
	 * the full string immediately with no animation.
	 */
	import { onMount } from 'svelte';

	let { text, speed = 45 }: { text: string; speed?: number } = $props();

	let shown = $state('');

	onMount(() => {
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
			shown = text;
			return;
		}
		let i = 0;
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			shown = text.slice(0, i);
			i += 1;
			if (i <= text.length) timer = setTimeout(tick, speed);
		};
		tick();
		return () => clearTimeout(timer);
	});
</script>

<span class="typed">{shown}<span class="typed__cursor" aria-hidden="true"></span></span>

<style>
	.typed {
		font-family: var(--font-mono);
		font-size: 14px;
		color: var(--gold);
	}
	.typed__cursor {
		display: inline-block;
		width: 9px;
		height: 17px;
		margin-left: 2px;
		vertical-align: -3px;
		background: var(--foam);
		animation: typed-blink 1s steps(1) infinite;
	}
	@keyframes typed-blink {
		50% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.typed__cursor {
			animation: none;
		}
	}
</style>
