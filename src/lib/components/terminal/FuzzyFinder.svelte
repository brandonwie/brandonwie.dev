<!--
  FuzzyFinder.svelte - Command Palette Modal
  ==========================================

  WHAT: A modal command palette over heterogeneous items — navigation, actions,
        and posts — with fuzzy matching, grouped into GO TO / ACTIONS / POSTS.
  WHY:  One Cmd/Ctrl+K surface for jumping anywhere and running quick actions.
  HOW:  Fuse.js over PaletteItem[]; each item self-executes via item.run().

  KEYBOARD:
  - ↑/↓: navigate (across section boundaries)  - Enter: select  - Escape: close
-->
<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { createPaletteFuse, fuzzySearch, highlightMatches, type FuzzyResult } from '$lib/fuzzy';
	import type { PaletteItem, PaletteGroup } from '$lib/palette/items';
	import type Fuse from 'fuse.js';

	interface Props {
		items: PaletteItem[]; // full item set (nav + actions + posts) for the route
		onSelect: (item: PaletteItem) => void; // called when the user selects an item
		onClose: () => void; // called when the user closes the palette
	}

	let { items, onSelect, onClose }: Props = $props();

	// UX-3: cap the default (empty-query) POSTS section instead of dumping all posts.
	const DEFAULT_POST_LIMIT = 8;

	// Section ordering for grouped display. Stable-sort by this so Fuse rank is
	// preserved within each group.
	const GROUP_ORDER: Record<PaletteGroup, number> = { nav: 0, action: 1, post: 2 };

	let inputRef: HTMLInputElement;
	let query = $state('');
	let results: FuzzyResult[] = $state([]);
	let selectedIndex = $state(0);
	let fuse: Fuse<PaletteItem>;

	let resultsContainerRef: HTMLDivElement;

	// A11Y-2: focus-trap refs. `dialogRef` scopes the trap; `previouslyFocused`
	// is restored when the palette closes.
	let dialogRef: HTMLDivElement;
	let previouslyFocused: HTMLElement | null = null;

	// Default list shown before the user types: nav + actions in full, then the
	// most-recent posts capped at DEFAULT_POST_LIMIT (UX-3). `items` is already
	// ordered nav → action → post by buildPaletteItems.
	function defaultResults(): FuzzyResult[] {
		const navAction = items
			.filter((item) => item.group !== 'post')
			.map((item) => ({ item, score: 0 }));
		const recentPosts = items
			.filter((item) => item.group === 'post')
			.slice()
			.sort((a, b) => new Date(b.meta?.date ?? 0).getTime() - new Date(a.meta?.date ?? 0).getTime())
			.slice(0, DEFAULT_POST_LIMIT)
			.map((item) => ({ item, score: 0 }));
		return [...navAction, ...recentPosts];
	}

	// Group Fuse results into sections (nav → action → post) while keeping rank
	// order within each group. Array.prototype.sort is stable.
	function grouped(list: FuzzyResult[]): FuzzyResult[] {
		return [...list].sort((a, b) => GROUP_ORDER[a.item.group] - GROUP_ORDER[b.item.group]);
	}

	// AUTO-SCROLL TO SELECTED ROW
	// Section headers interleave the result rows in the DOM, so the old
	// `container.children[selectedIndex]` no longer maps to result items. Tag
	// each row with data-result-index and query it directly.
	$effect(() => {
		if (resultsContainerRef && results.length > 0) {
			const selectedElement = resultsContainerRef.querySelector<HTMLElement>(
				`[data-result-index="${selectedIndex}"]`,
			);
			selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	});

	onMount(async () => {
		// A11Y-2: remember focus so it can be restored on close.
		previouslyFocused = document.activeElement as HTMLElement | null;
		fuse = createPaletteFuse(items);
		results = defaultResults();
		await tick();
		inputRef?.focus();
	});

	// A11Y-2: async onMount can't host cleanup (its return is a Promise) — use onDestroy.
	onDestroy(() => previouslyFocused?.focus?.());

	function handleInput() {
		results = query.trim() ? grouped(fuzzySearch(fuse, query)) : defaultResults();
		selectedIndex = 0;
	}

	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(0, selectedIndex - 1);
				break;
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(results.length - 1, selectedIndex + 1);
				break;
			case 'Enter':
				event.preventDefault();
				if (results[selectedIndex]) {
					onSelect(results[selectedIndex].item);
				}
				break;
			case 'Escape':
				event.preventDefault();
				onClose();
				break;
		}
	}

	// Highlight matched characters in the item label (Fuse `label` key).
	function getHighlightedLabel(result: FuzzyResult): { text: string; highlighted: boolean }[] {
		const labelMatch = result.matches?.find((match) => match.key === 'label');
		if (labelMatch && labelMatch.indices) {
			return highlightMatches(result.item.label, labelMatch.indices);
		}
		return [{ text: result.item.label, highlighted: false }];
	}

	function groupLabel(group: PaletteGroup): string {
		switch (group) {
			case 'nav':
				return m.palette_group_nav();
			case 'action':
				return m.palette_group_action();
			case 'post':
				return m.palette_group_post();
		}
	}

	// GLOBAL ESCAPE + TAB TRAP (A11Y-2)
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose();
			return;
		}
		if (event.key === 'Tab') {
			trapFocus(event);
		}
	}

	function trapFocus(event: KeyboardEvent) {
		const focusables = dialogRef?.querySelectorAll<HTMLElement>(
			'a[href], button, input, [tabindex]:not([tabindex="-1"])',
		);
		if (!focusables || focusables.length === 0) return;

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeyDown} />

<div
	bind:this={dialogRef}
	class="fuzzy-overlay fixed inset-0 z-50 flex items-start justify-center pt-24"
	onclick={(e) => e.target === e.currentTarget && onClose()}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	aria-modal="true"
	aria-label="Command palette"
	tabindex="-1"
>
	<div
		class="w-full max-w-2xl rounded-lg border border-terminal-border bg-terminal-bg-secondary shadow-2xl"
	>
		<!-- SEARCH INPUT HEADER -->
		<div class="flex items-center gap-3 border-b border-terminal-border p-4">
			<span class="text-terminal-accent-orange">❯</span>
			<input
				bind:this={inputRef}
				bind:value={query}
				oninput={handleInput}
				onkeydown={handleKeyDown}
				type="text"
				placeholder={m.palette_placeholder()}
				class="flex-1 border-none bg-transparent text-terminal-text-primary placeholder-terminal-text-dim outline-hidden"
				spellcheck="false"
			/>
			<kbd class="rounded-sm bg-terminal-bg-primary px-2 py-1 text-xs text-terminal-text-muted"
				>esc</kbd
			>
		</div>

		<!-- RESULTS LIST (max-h-96 + scroll). Rows carry data-result-index; section
		     headers are interleaved but non-selectable. -->
		<div bind:this={resultsContainerRef} class="max-h-96 overflow-y-auto">
			{#if results.length === 0}
				<div class="p-4 text-center text-terminal-text-muted">{m.palette_no_results()}</div>
			{:else}
				{#each results as result, i (result.item.id)}
					{@const showHeader = i === 0 || results[i - 1].item.group !== result.item.group}
					{#if showHeader}
						<div
							class="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-terminal-text-dim"
						>
							{groupLabel(result.item.group)}
						</div>
					{/if}
					<div
						data-result-index={i}
						class="cursor-pointer border-b border-terminal-border/50 py-3 last:border-b-0 {i ===
						selectedIndex
							? 'border-l-2 border-l-terminal-accent-orange bg-terminal-accent-orange/10 pl-3.5 pr-4'
							: 'px-4'}"
						onclick={() => onSelect(result.item)}
						onkeydown={(e) => e.key === 'Enter' && onSelect(result.item)}
						role="option"
						aria-selected={i === selectedIndex}
						tabindex={0}
					>
						{#if result.item.group === 'post'}
							<!-- POST ROW (rich: title, description, category/tags/date) -->
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0 flex-1">
									<div class="truncate font-medium text-terminal-text-primary">
										{#each getHighlightedLabel(result) as segment, si (si)}
											{#if segment.highlighted}
												<span class="fuzzy-match">{segment.text}</span>
											{:else}{segment.text}{/if}
										{/each}
									</div>
									{#if result.item.description}
										<div class="mt-1 truncate text-sm text-terminal-text-muted">
											{result.item.description}
										</div>
									{/if}
									<div class="mt-2 flex flex-wrap gap-2">
										{#if result.item.meta?.category}
											<span
												class="rounded-sm bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-accent-yellow"
											>
												{result.item.meta.category}
											</span>
										{/if}
										{#each (result.item.meta?.tags ?? []).slice(0, 3) as tag (tag)}
											<span
												class="rounded-sm bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-muted"
											>
												{tag}
											</span>
										{/each}
									</div>
								</div>
								{#if result.item.meta?.date}
									<div class="text-xs text-terminal-text-dim">{result.item.meta.date}</div>
								{/if}
							</div>
						{:else}
							<!-- NAV / ACTION ROW (icon + label + dim hint) -->
							<div class="flex items-center gap-3">
								<span class="w-4 shrink-0 text-center text-terminal-accent-orange">
									{result.item.icon ?? '›'}
								</span>
								<div class="min-w-0 flex-1">
									<div class="truncate font-medium text-terminal-text-primary">
										{#each getHighlightedLabel(result) as segment, si (si)}
											{#if segment.highlighted}
												<span class="fuzzy-match">{segment.text}</span>
											{:else}{segment.text}{/if}
										{/each}
									</div>
									{#if result.item.description}
										<div class="truncate text-xs text-terminal-text-dim">
											{result.item.description}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<!-- FOOTER - keyboard hints + result count -->
		<div
			class="flex items-center justify-between border-t border-terminal-border px-4 py-2 text-xs text-terminal-text-muted"
		>
			<div class="flex gap-4">
				<span><kbd class="rounded-sm bg-terminal-bg-primary px-1">↑↓</kbd> navigate</span>
				<span><kbd class="rounded-sm bg-terminal-bg-primary px-1">↵</kbd> select</span>
			</div>
			<div>
				{results.length} result{results.length === 1 ? '' : 's'}
			</div>
		</div>
	</div>
</div>
