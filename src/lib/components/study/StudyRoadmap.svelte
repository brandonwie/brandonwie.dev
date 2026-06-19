<script lang="ts">
	import type { DsaModule } from '$lib/data/study';

	let { modules, ariaLabel }: { modules: DsaModule[]; ariaLabel?: string } = $props();

	const step = (index: number) => String(index + 1).padStart(2, '0');
</script>

<ol class="roadmap" aria-label={ariaLabel}>
	{#each modules as module, index (index)}
		<li id={`module-${index + 1}`} class="node">
			<span class="badge font-mono" aria-hidden="true">{step(index)}</span>
			<p class="font-mono text-xs uppercase tracking-wider text-accent">{module.kicker}</p>
			<h3 class="mt-2 text-base font-semibold text-ink">{module.title}</h3>
			<p class="mt-2 text-sm leading-7 text-muted">{module.summary}</p>
		</li>
	{/each}
</ol>

<style>
	.roadmap {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.node {
		position: relative;
		padding-left: 2.5rem;
		padding-bottom: 1.75rem;
	}

	.node:last-child {
		padding-bottom: 0;
	}

	.badge {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--accent);
		border-radius: 9999px;
		background-color: var(--bg);
		color: var(--accent);
		font-size: 0.7rem;
	}

	/* Connector between consecutive nodes (vertical on mobile). */
	.node:not(:last-child)::before {
		content: '';
		position: absolute;
		left: calc(0.875rem - 0.5px);
		top: 1.75rem;
		bottom: 0;
		width: 1px;
		background-color: var(--line);
	}

	@media (min-width: 1024px) {
		.roadmap {
			flex-direction: row;
			align-items: flex-start;
		}

		.node {
			flex: 1 1 0;
			padding-left: 0;
			padding-top: 2.5rem;
			padding-right: 1.25rem;
			padding-bottom: 0;
		}

		.node:last-child {
			padding-right: 0;
		}

		/* Connector turns horizontal on desktop. */
		.node:not(:last-child)::before {
			left: 1.75rem;
			right: 0;
			top: calc(0.875rem - 0.5px);
			bottom: auto;
			width: auto;
			height: 1px;
		}
	}
</style>
