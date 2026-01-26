<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { PostMetadata } from '$lib/stores/posts';
	import { createPostsFuse, fuzzySearch, highlightMatches, type FuzzyResult } from '$lib/fuzzy';
	import type Fuse from 'fuse.js';

	interface Props {
		posts: PostMetadata[];
		onSelect: (slug: string) => void;
		onClose: () => void;
	}

	let { posts, onSelect, onClose }: Props = $props();

	let inputRef: HTMLInputElement;
	let query = $state('');
	let results: FuzzyResult[] = $state([]);
	let selectedIndex = $state(0);
	let fuse: Fuse<PostMetadata>;

	onMount(async () => {
		fuse = createPostsFuse(posts);

		// Initial results - show all posts sorted by date
		results = posts
			.slice()
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
			.slice(0, 10)
			.map((post) => ({ item: post, score: 0 }));

		// Wait for DOM to be ready, then focus
		await tick();
		inputRef?.focus();
	});

	function handleInput() {
		if (query.trim()) {
			results = fuzzySearch(fuse, query).slice(0, 10);
		} else {
			// Show recent posts when no query
			results = posts
				.slice()
				.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
				.slice(0, 10)
				.map((post) => ({ item: post, score: 0 }));
		}
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
					onSelect(results[selectedIndex].item.slug);
				}
				break;

			case 'Escape':
				event.preventDefault();
				onClose();
				break;
		}
	}

	function getHighlightedTitle(result: FuzzyResult): { text: string; highlighted: boolean }[] {
		const titleMatch = result.matches?.find((m) => m.key === 'title');
		if (titleMatch && titleMatch.indices) {
			return highlightMatches(result.item.title, titleMatch.indices);
		}
		return [{ text: result.item.title, highlighted: false }];
	}

	// Global escape handler to ensure ESC always works
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeyDown} />

<div
	class="fuzzy-overlay fixed inset-0 z-50 flex items-start justify-center pt-24"
	onclick={(e) => e.target === e.currentTarget && onClose()}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	aria-modal="true"
	aria-label="Search posts"
	tabindex="-1"
>
	<div class="w-full max-w-2xl rounded-lg border border-terminal-border bg-terminal-bg-secondary shadow-2xl">
		<!-- Search Input -->
		<div class="flex items-center gap-3 border-b border-terminal-border p-4">
			<span class="text-terminal-accent-orange">❯</span>
			<input
				bind:this={inputRef}
				bind:value={query}
				oninput={handleInput}
				onkeydown={handleKeyDown}
				type="text"
				placeholder="Search posts..."
				class="flex-1 border-none bg-transparent text-terminal-text-primary placeholder-terminal-text-dim outline-none"
				spellcheck="false"
			/>
			<kbd class="rounded bg-terminal-bg-primary px-2 py-1 text-xs text-terminal-text-muted">esc</kbd>
		</div>

		<!-- Results -->
		<div class="max-h-96 overflow-y-auto">
			{#if results.length === 0}
				<div class="p-4 text-center text-terminal-text-muted">
					No posts found
				</div>
			{:else}
				{#each results as result, i (result.item.slug)}
					<div
						class="cursor-pointer border-b border-terminal-border/50 px-4 py-3 last:border-b-0 {i === selectedIndex
							? 'bg-terminal-bg-hover'
							: ''}"
						onclick={() => onSelect(result.item.slug)}
						onkeydown={(e) => e.key === 'Enter' && onSelect(result.item.slug)}
						role="option"
						aria-selected={i === selectedIndex}
						tabindex={0}
					>
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium text-terminal-text-primary">
									{#each getHighlightedTitle(result) as segment}
										{#if segment.highlighted}
											<span class="fuzzy-match">{segment.text}</span>
										{:else}
											{segment.text}
										{/if}
									{/each}
								</div>
								<div class="mt-1 truncate text-sm text-terminal-text-muted">
									{result.item.description}
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									<span class="rounded bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-accent-yellow">
										{result.item.category}
									</span>
									{#each result.item.tags.slice(0, 3) as tag}
										<span class="rounded bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-muted">
											{tag}
										</span>
									{/each}
								</div>
							</div>
							<div class="text-xs text-terminal-text-dim">
								{result.item.date}
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-between border-t border-terminal-border px-4 py-2 text-xs text-terminal-text-muted">
			<div class="flex gap-4">
				<span><kbd class="rounded bg-terminal-bg-primary px-1">↑↓</kbd> navigate</span>
				<span><kbd class="rounded bg-terminal-bg-primary px-1">↵</kbd> select</span>
			</div>
			<div>
				{results.length} result{results.length === 1 ? '' : 's'}
			</div>
		</div>
	</div>
</div>
