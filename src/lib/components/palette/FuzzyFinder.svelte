<!--
  FuzzyFinder.svelte - Command Palette Modal
  ==========================================

  WHAT: A modal command palette over heterogeneous items — navigation, actions,
        and posts — with fuzzy matching, grouped into GO TO / ACTIONS / POSTS.
  WHY:  One Cmd/Ctrl+K surface for jumping anywhere and running quick actions.
  HOW:  Fuse.js over PaletteItem[]; each item self-executes via item.run().

  STYLING: terminal redesign `.cmdk` look — scoped styles (no global leak). Only
  the markup + styles changed in the redesign; the script/logic/a11y are intact.

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
	const RESULTS_LIST_ID = 'cmdk-results';

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
	const activeOptionId = $derived(results.length > 0 ? optionId(selectedIndex) : undefined);

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

	function optionId(index: number): string {
		return `cmdk-option-${index}`;
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
	class="cmdk-overlay"
	onclick={(e) => e.target === e.currentTarget && onClose()}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	aria-modal="true"
	aria-label={m.palette_aria_label()}
	tabindex="-1"
>
	<div class="cmdk-panel">
		<!-- SEARCH INPUT HEADER -->
		<div class="cmdk-ibar">
			<span class="cmdk-prompt" aria-hidden="true">$</span>
			<input
				bind:this={inputRef}
				bind:value={query}
				oninput={handleInput}
				onkeydown={handleKeyDown}
				type="text"
				placeholder={m.palette_placeholder()}
				class="cmdk-input"
				spellcheck="false"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={results.length > 0}
				aria-haspopup="listbox"
				aria-controls={RESULTS_LIST_ID}
				aria-activedescendant={activeOptionId}
			/>
			<kbd class="cmdk-esc">esc</kbd>
		</div>

		<!-- RESULTS LIST (max-h + scroll). Rows carry data-result-index; section
		     headers are interleaved but non-selectable. -->
		<div
			bind:this={resultsContainerRef}
			id={RESULTS_LIST_ID}
			class="cmdk-results"
			role="listbox"
			aria-label={m.search_results_status()}
		>
			{#if results.length === 0}
				<div class="cmdk-empty">{m.palette_no_results()}</div>
			{:else}
				{#each results as result, i (result.item.id)}
					{@const showHeader = i === 0 || results[i - 1].item.group !== result.item.group}
					{#if showHeader}
						<div class="cmdk-grp">{groupLabel(result.item.group)}</div>
					{/if}
					<div
						id={optionId(i)}
						data-result-index={i}
						class="cmdk-item"
						class:is-selected={i === selectedIndex}
						onclick={() => onSelect(result.item)}
						onkeydown={(e) => e.key === 'Enter' && onSelect(result.item)}
						role="option"
						aria-selected={i === selectedIndex}
						tabindex={0}
					>
						{#if result.item.group === 'post'}
							<!-- POST ROW (rich: title, description, category/tags/date) -->
							<div class="cmdk-post">
								<div class="cmdk-post__main">
									<div class="cmdk-tt cmdk-truncate">
										{#each getHighlightedLabel(result) as segment, si (si)}
											{#if segment.highlighted}<span class="fuzzy-match">{segment.text}</span
												>{:else}{segment.text}{/if}
										{/each}
									</div>
									{#if result.item.description}
										<div class="cmdk-post__desc cmdk-truncate">{result.item.description}</div>
									{/if}
									<div class="cmdk-post__meta">
										{#if result.item.meta?.category}
											<span class="cmdk-cat">{result.item.meta.category}</span>
										{/if}
										{#each (result.item.meta?.tags ?? []).slice(0, 3) as tag (tag)}
											<span class="cmdk-tag">{tag}</span>
										{/each}
									</div>
								</div>
								{#if result.item.meta?.date}
									<div class="cmdk-ds">{result.item.meta.date}</div>
								{/if}
							</div>
						{:else}
							<!-- NAV / ACTION ROW (icon box + label + dim hint) -->
							<span class="cmdk-ic" aria-hidden="true">{result.item.icon ?? '›'}</span>
							<div class="cmdk-row__main">
								<div class="cmdk-tt cmdk-truncate">
									{#each getHighlightedLabel(result) as segment, si (si)}
										{#if segment.highlighted}<span class="fuzzy-match">{segment.text}</span
											>{:else}{segment.text}{/if}
									{/each}
								</div>
								{#if result.item.description}
									<div class="cmdk-ds cmdk-truncate">{result.item.description}</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<!-- FOOTER - keyboard hints + result count -->
		<div class="cmdk-foot">
			<div class="cmdk-foot__hints">
				<span><kbd>↑↓</kbd>{m.palette_hint_navigate()}</span>
				<span><kbd>↵</kbd>{m.palette_hint_select()}</span>
				<span><kbd>esc</kbd>{m.palette_hint_close()}</span>
			</div>
			<div>
				{#if results.length === 1}
					{m.palette_result_count({ count: results.length })}
				{:else}
					{m.palette_results_count({ count: results.length })}
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.cmdk-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 14vh 20px 20px;
		background: color-mix(in srgb, #08070c 66%, transparent);
		backdrop-filter: blur(4px);
		animation: cmdk-fade 0.18s ease;
	}
	@keyframes cmdk-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.cmdk-panel {
		width: min(620px, 100%);
		overflow: hidden;
		border: 1px solid var(--line2);
		border-radius: 14px;
		background: linear-gradient(180deg, var(--bg2), #15131f);
		box-shadow: 0 50px 120px -30px rgba(0, 0, 0, 0.8);
		animation: cmdk-pop 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes cmdk-pop {
		from {
			transform: translateY(-10px) scale(0.98);
		}
		to {
			transform: none;
		}
	}
	.cmdk-ibar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 18px;
		border-bottom: 1px solid var(--line);
	}
	.cmdk-prompt {
		font-family: var(--font-mono);
		font-size: 14px;
		color: var(--foam);
	}
	.cmdk-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 15px;
	}
	.cmdk-input::placeholder {
		color: var(--muted);
	}
	.cmdk-esc {
		padding: 2px 7px;
		border: 1px solid var(--line2);
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--muted);
	}
	.cmdk-results {
		max-height: 48vh;
		overflow-y: auto;
		padding: 8px;
	}
	.cmdk-grp {
		padding: 12px 12px 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.cmdk-item {
		display: flex;
		gap: 13px;
		padding: 11px 12px;
		border-radius: 8px;
		cursor: pointer;
		transition: background-color 0.12s;
	}
	.cmdk-item.is-selected,
	.cmdk-item:hover {
		background: var(--overlay);
	}
	.cmdk-ic {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 26px;
		height: 26px;
		border: 1px solid var(--line2);
		border-radius: 6px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--foam);
	}
	.cmdk-item.is-selected .cmdk-ic {
		border-color: var(--foam);
	}
	.cmdk-row__main {
		min-width: 0;
		flex: 1;
	}
	.cmdk-post {
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.cmdk-post__main {
		min-width: 0;
		flex: 1;
	}
	.cmdk-tt {
		font-family: var(--font-sans);
		font-size: 15px;
		font-weight: 500;
		color: var(--ink);
	}
	.cmdk-post__desc {
		margin-top: 4px;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
	}
	.cmdk-post__meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.cmdk-cat {
		padding: 3px 7px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font-size: 10px;
		color: var(--gold);
	}
	.cmdk-tag {
		padding: 3px 7px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font-size: 10px;
		color: var(--muted);
	}
	.cmdk-ds {
		margin-top: 2px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}
	.cmdk-truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cmdk-empty {
		padding: 30px 14px;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
	}
	.cmdk-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		padding: 11px 16px;
		border-top: 1px solid var(--line);
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
	}
	.cmdk-foot__hints {
		display: flex;
		gap: 18px;
	}
	.cmdk-foot kbd {
		margin-right: 5px;
		padding: 1px 6px;
		border: 1px solid var(--line2);
		border-radius: 4px;
		background: var(--overlay);
		font-family: var(--font-mono);
	}
	@media (prefers-reduced-motion: reduce) {
		.cmdk-overlay,
		.cmdk-panel {
			animation: none;
		}
	}
</style>
