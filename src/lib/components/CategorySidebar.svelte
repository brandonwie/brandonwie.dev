<script lang="ts">
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

<!-- Desktop sidebar (lg+) -->
<nav class="hidden lg:block w-48 shrink-0" aria-label={m.category_filter()}>
	<h2 class="text-xs font-semibold uppercase tracking-wider text-terminal-text-dim mb-3">
		{m.category_filter()}
	</h2>
	<ul class="space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => onSelect(null)}
				class="w-full text-left px-2 py-1.5 rounded text-sm transition-colors {activeCategory ===
				null
					? 'text-terminal-accent-orange bg-terminal-bg-hover'
					: 'text-terminal-text-muted hover:text-terminal-text-primary hover:bg-terminal-bg-hover'}"
			>
				{m.all_categories()}
				<span class="text-terminal-text-dim text-xs ml-1">({totalCount})</span>
			</button>
		</li>
		{#each categories as cat (cat.name)}
			<li>
				<button
					type="button"
					onclick={() => onSelect(cat.name)}
					class="w-full text-left px-2 py-1.5 rounded text-sm transition-colors {activeCategory ===
					cat.name
						? 'text-terminal-accent-orange bg-terminal-bg-hover'
						: 'text-terminal-text-muted hover:text-terminal-text-primary hover:bg-terminal-bg-hover'}"
				>
					{cat.name}
					<span class="text-terminal-text-dim text-xs ml-1">({cat.count})</span>
				</button>
			</li>
		{/each}
	</ul>
</nav>

<!-- Mobile filter bar (<lg) -->
<div
	class="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none -mx-2 px-2"
	role="tablist"
	aria-label={m.category_filter()}
>
	<button
		type="button"
		onclick={() => onSelect(null)}
		role="tab"
		aria-selected={activeCategory === null}
		class="shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors {activeCategory ===
		null
			? 'border-terminal-accent-orange text-terminal-accent-orange bg-terminal-accent-orange/10'
			: 'border-terminal-border text-terminal-text-muted hover:border-terminal-text-dim'}"
	>
		{m.all_categories()}
	</button>
	{#each categories as cat (cat.name)}
		<button
			type="button"
			onclick={() => onSelect(cat.name)}
			role="tab"
			aria-selected={activeCategory === cat.name}
			class="shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors {activeCategory ===
			cat.name
				? 'border-terminal-accent-orange text-terminal-accent-orange bg-terminal-accent-orange/10'
				: 'border-terminal-border text-terminal-text-muted hover:border-terminal-text-dim'}"
		>
			{cat.name}
			<span class="text-terminal-text-dim">({cat.count})</span>
		</button>
	{/each}
</div>
