<script lang="ts">
	/**
	 * TerminalHero — the signature terminal "window" panel from the design.
	 *
	 * A reusable chrome primitive: a title bar with traffic-light dots and a body
	 * slot. Shared by the home hero and (later) about / contact / 404. Optionally
	 * renders a shell `prompt` line above the body content.
	 *
	 * Styles are component-scoped so the mockup's bare `.term`/`.term-bar` selectors
	 * cannot leak.
	 */
	import type { Snippet } from 'svelte';

	let {
		title = 'brandon@moba: ~',
		prompt = undefined,
		children,
	}: { title?: string; prompt?: string; children: Snippet } = $props();
</script>

<div class="term">
	<div class="term__bar">
		<span class="term__light term__light--r" aria-hidden="true"></span>
		<span class="term__light term__light--y" aria-hidden="true"></span>
		<span class="term__light term__light--g" aria-hidden="true"></span>
		<span class="term__title">{title}</span>
	</div>
	<div class="term__body">
		{#if prompt}
			<div class="term__prompt">
				<span class="term__u">brandon</span>@<span class="term__p">moba</span>:~$ {prompt}
			</div>
		{/if}
		{@render children()}
	</div>
</div>

<style>
	.term {
		overflow: hidden;
		border: 1px solid var(--line2);
		border-radius: 12px;
		background: linear-gradient(180deg, var(--bg2), var(--panel));
		box-shadow:
			0 40px 120px -40px rgba(0, 0, 0, 0.7),
			0 0 0 1px rgba(255, 255, 255, 0.02) inset;
	}
	.term__bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 13px 16px;
		border-bottom: 1px solid var(--line);
		background: rgba(0, 0, 0, 0.2);
	}
	.term__light {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}
	.term__light--r {
		background: var(--love);
	}
	.term__light--y {
		background: var(--gold);
	}
	.term__light--g {
		background: var(--foam);
	}
	.term__title {
		margin-left: 12px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
	}
	.term__body {
		padding: 34px 36px 38px;
	}
	.term__prompt {
		margin-bottom: 6px;
		font-family: var(--font-mono);
		font-size: 14px;
		color: var(--muted);
	}
	.term__u {
		color: var(--foam);
	}
	.term__p {
		color: var(--iris);
	}
	@media (max-width: 640px) {
		.term__body {
			padding: 24px 20px 28px;
		}
	}
</style>
