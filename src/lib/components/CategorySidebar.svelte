<script lang="ts">
	/**
	 * CategorySidebar — category filter for the posts list.
	 *
	 * Terminal redesign: a single horizontal chip row (used on every viewport),
	 * replacing the old desktop-sidebar + mobile-pill split. The filtering API
	 * (categories / activeCategory / onSelect) is unchanged — only the UI changed.
	 * Styles are component-scoped.
	 */
	import { m } from '$lib/paraglide/messages';

	let {
		categories,
		activeCategory,
		onSelect,
	}: {
		categories: Array<{ name: string; count: number }>;
		activeCategory: string | null;
		onSelect: (category: string | null) => void;
	} = $props();

	const totalCount = $derived(categories.reduce((sum, c) => sum + c.count, 0));
</script>

<div class="chips" role="tablist" aria-label={m.category_filter()}>
	<button
		type="button"
		class="chip"
		class:is-active={activeCategory === null}
		role="tab"
		aria-selected={activeCategory === null}
		onclick={() => onSelect(null)}
	>
		{m.all_categories()}<span class="chip__count">{totalCount}</span>
	</button>
	{#each categories as cat (cat.name)}
		<button
			type="button"
			class="chip"
			class:is-active={activeCategory === cat.name}
			role="tab"
			aria-selected={activeCategory === cat.name}
			onclick={() => onSelect(cat.name)}
		>
			{cat.name}<span class="chip__count">{cat.count}</span>
		</button>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border: 1px solid var(--line2);
		border-radius: 30px;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--muted);
		cursor: pointer;
		transition:
			color 0.2s,
			border-color 0.2s,
			background-color 0.2s;
	}
	.chip:hover {
		border-color: var(--foam);
		color: var(--foam);
	}
	.chip.is-active {
		border-color: var(--foam);
		background: var(--foam);
		color: var(--bg);
	}
	.chip__count {
		font-size: 10px;
		opacity: 0.8;
	}
</style>
