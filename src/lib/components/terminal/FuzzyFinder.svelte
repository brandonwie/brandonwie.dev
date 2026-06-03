<!--
  FuzzyFinder.svelte - Search Modal Component
  ===========================================

  WHAT: A modal search dialog for finding posts with fuzzy matching.
  WHY:  Quick navigation - users can search posts without typing full names.
  HOW:  Uses Fuse.js for fuzzy search, renders as an overlay modal.

  FUZZY SEARCH:
  - "redis" matches "Redis Caching Patterns"
  - "k8s pod" matches "Kubernetes Pod Lifecycle"
  - Typo-tolerant: "redsi" still finds "redis"

  UX INSPIRATION: VS Code's Ctrl+P file finder, Spotlight search

  KEYBOARD SHORTCUTS:
  - ↑/↓: Navigate results
  - Enter: Select result
  - Escape: Close modal
  - Click outside: Close modal
-->
<script lang="ts">
	// SVELTE IMPORTS
	// --------------
	// `tick` - Returns promise that resolves after Svelte has applied pending state changes.
	// WHY: Need to wait for DOM update before focusing input.
	// REFERENCE: https://svelte.dev/docs/svelte/lifecycle-hooks#tick
	import { onMount, onDestroy, tick } from 'svelte';
	import type { PostMetadata } from '$lib/stores/posts';

	// FUSE.JS INTEGRATION
	// -------------------
	// Fuse.js is a lightweight fuzzy-search library.
	// - `createPostsFuse`: Factory to create Fuse instance with posts
	// - `fuzzySearch`: Wrapper to search and return results
	// - `highlightMatches`: Utility to highlight matched portions
	// - `FuzzyResult`: Type for search results with match info
	import { createPostsFuse, fuzzySearch, highlightMatches, type FuzzyResult } from '$lib/fuzzy';
	import type Fuse from 'fuse.js';

	// PROPS INTERFACE
	// ---------------
	interface Props {
		posts: PostMetadata[]; // Posts to search through
		onSelect: (slug: string) => void; // Called when user selects a post
		onClose: () => void; // Called when user closes modal
	}

	let { posts, onSelect, onClose }: Props = $props();

	// COMPONENT STATE
	// ---------------
	let inputRef: HTMLInputElement;
	let query = $state(''); // Search query
	let results: FuzzyResult[] = $state([]); // Search results
	let selectedIndex = $state(0); // Currently selected result
	let fuse: Fuse<PostMetadata>; // Fuse.js instance (not reactive)

	// RESULTS CONTAINER REF
	// ---------------------
	// WHAT: Reference to the scrollable results list container (<div> with overflow-y-auto).
	// WHY:  Need direct DOM access to scroll selected items into view during keyboard navigation.
	// HOW:  Bound via `bind:this={resultsContainerRef}` in template.
	//       Container's children are the result items, accessed by index: children[selectedIndex].
	let resultsContainerRef: HTMLDivElement;

	// A11Y-2: focus-trap refs. `dialogRef` scopes the trap to the modal;
	// `previouslyFocused` is restored when the palette closes.
	let dialogRef: HTMLDivElement;
	let previouslyFocused: HTMLElement | null = null;

	// AUTO-SCROLL TO SELECTED ITEM ($effect)
	// --------------------------------------
	// WHAT: Reactive effect that scrolls the selected result item into view.
	// WHY:  When user navigates with ↑/↓ keys beyond visible area, the selected item
	//       would be hidden. This ensures the selection is always visible (like VS Code's Ctrl+P).
	// HOW:  $effect() runs whenever its dependencies change (selectedIndex, results.length).
	//
	// SVELTE 5 $effect RUNE:
	// - Automatically tracks reactive state read inside the function
	// - Re-runs when any tracked state changes
	// - Here it tracks: `resultsContainerRef`, `results.length`, `selectedIndex`
	// - REFERENCE: https://svelte.dev/docs/svelte/$effect
	//
	// scrollIntoView OPTIONS:
	// - `block: 'nearest'`: Only scrolls if element is outside visible area.
	//   - If already visible → no scroll (prevents jarring jumps)
	//   - If above viewport → scrolls up to show at top
	//   - If below viewport → scrolls down to show at bottom
	// - `behavior: 'smooth'`: Animates the scroll for better UX.
	// - REFERENCE: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
	$effect(() => {
		if (resultsContainerRef && results.length > 0) {
			// Access the selected item via container's children NodeList
			// children[selectedIndex] corresponds to the result item at that index
			const selectedElement = resultsContainerRef.children[selectedIndex] as HTMLElement;
			if (selectedElement) {
				selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		}
	});

	// INITIALIZATION ON MOUNT
	// -----------------------
	// `async` in onMount allows using await inside.
	// WHY async here: Need to await `tick()` before focusing.
	onMount(async () => {
		// A11Y-2: remember what had focus so we can restore it when the palette closes.
		previouslyFocused = document.activeElement as HTMLElement | null;

		// Create Fuse.js instance with posts data
		fuse = createPostsFuse(posts);

		// Initial results - show recent posts when no search query
		// PATTERN: Default to showing useful content (recent posts) vs empty state
		results = posts
			.slice() // Copy array to avoid mutating original
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
			.map((post) => ({ item: post, score: 0 }));

		// TICK - WAIT FOR DOM UPDATE
		// --------------------------
		// `tick()` returns a promise that resolves after DOM updates.
		// WHY: Input element doesn't exist until Svelte renders it.
		// Without tick, inputRef might be undefined.
		await tick();
		inputRef?.focus();
	});

	// A11Y-2: return focus to the element focused before the palette opened.
	// onMount is async here, so its return value can't be used as cleanup — use onDestroy.
	onDestroy(() => previouslyFocused?.focus?.());

	// SEARCH HANDLER
	// --------------
	// Called on every input change to update results.
	function handleInput() {
		if (query.trim()) {
			// Perform fuzzy search
			results = fuzzySearch(fuse, query);
		} else {
			// No query - show recent posts
			results = posts
				.slice()
				.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
				.map((post) => ({ item: post, score: 0 }));
		}
		// Reset selection to first item
		selectedIndex = 0;
	}

	// KEYBOARD NAVIGATION
	// -------------------
	// Arrow keys to navigate, Enter to select, Escape to close.
	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault(); // Prevent cursor moving in input
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

	// HIGHLIGHT MATCHING TEXT
	// -----------------------
	// Returns array of text segments with highlighted flag.
	// Used to highlight matched portions in search results.
	function getHighlightedTitle(result: FuzzyResult): { text: string; highlighted: boolean }[] {
		const titleMatch = result.matches?.find((m) => m.key === 'title');
		if (titleMatch && titleMatch.indices) {
			return highlightMatches(result.item.title, titleMatch.indices);
		}
		return [{ text: result.item.title, highlighted: false }];
	}

	// GLOBAL ESCAPE HANDLER
	// ---------------------
	// WHY: Ensure ESC always closes modal, even if focus is elsewhere.
	// stopPropagation prevents parent handlers from also receiving the event.
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose();
			return;
		}
		// A11Y-2: keep Tab focus inside the dialog while it is open.
		if (event.key === 'Tab') {
			trapFocus(event);
		}
	}

	// Cycle focus between the first and last focusable elements in the dialog.
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

<!--
  <svelte:window> - Global Escape Handler
  ---------------------------------------
  Captures Escape key at window level for reliable modal closing.
  This ensures ESC works even if focus moves unexpectedly.
-->
<svelte:window onkeydown={handleGlobalKeyDown} />

<!--
  MODAL OVERLAY
  -------------
  POSITIONING:
  - fixed inset-0: Covers entire viewport
  - z-50: High z-index to appear above everything
  - pt-24: Push dialog down from top

  BACKDROP CLICK TO CLOSE:
  `onclick={(e) => e.target === e.currentTarget && onClose()}`
  - Only close if clicking the overlay itself
  - NOT if clicking the dialog (bubbled event)
  - `e.target === e.currentTarget` checks if click was directly on this element

  ACCESSIBILITY:
  - role="dialog": Screen readers announce as dialog
  - aria-modal="true": Indicates modal behavior
  - aria-label: Describes the dialog purpose
  - tabindex="-1": Allows programmatic focus
-->
<div
	bind:this={dialogRef}
	class="fuzzy-overlay fixed inset-0 z-50 flex items-start justify-center pt-24"
	onclick={(e) => e.target === e.currentTarget && onClose()}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	aria-modal="true"
	aria-label="Search posts"
	tabindex="-1"
>
	<!-- DIALOG CONTAINER -->
	<div
		class="w-full max-w-2xl rounded-lg border border-terminal-border bg-terminal-bg-secondary shadow-2xl"
	>
		<!--
		  SEARCH INPUT HEADER
		  -------------------
		  Contains prompt icon, input field, and keyboard hint.
		-->
		<div class="flex items-center gap-3 border-b border-terminal-border p-4">
			<!-- Prompt icon (terminal aesthetic) -->
			<span class="text-terminal-accent-orange">❯</span>
			<!--
			  TWO-WAY BINDING: bind:value
			  ---------------------------
			  `bind:value={query}` creates two-way binding:
			  - Input changes → query updates
			  - query changes → input updates

			  REFERENCE: https://svelte.dev/docs/svelte/bind#input-bind:value
			-->
			<input
				bind:this={inputRef}
				bind:value={query}
				oninput={handleInput}
				onkeydown={handleKeyDown}
				type="text"
				placeholder="Search posts..."
				class="flex-1 border-none bg-transparent text-terminal-text-primary placeholder-terminal-text-dim outline-hidden"
				spellcheck="false"
			/>
			<!-- Keyboard hint -->
			<kbd class="rounded-sm bg-terminal-bg-primary px-2 py-1 text-xs text-terminal-text-muted"
				>esc</kbd
			>
		</div>

		<!--
		  RESULTS LIST CONTAINER
		  ----------------------
		  WHAT: Scrollable container for search results.
		  WHY:  Limits visible results to prevent modal from growing too tall.
		  HOW:  CSS constraints + overflow creates scrollable region.

		  STYLING:
		  - max-h-96: Maximum height of 24rem (384px) - shows ~5-6 results
		  - overflow-y-auto: Shows vertical scrollbar only when content exceeds max-h

		  DOM REFERENCE (bind:this):
		  - `bind:this={resultsContainerRef}` stores DOM element reference
		  - Used by $effect to access children for auto-scrolling
		  - Children are the result item divs, indexed 0 to results.length-1
		  - REFERENCE: https://svelte.dev/docs/svelte/bind#bind:this
		-->
		<div bind:this={resultsContainerRef} class="max-h-96 overflow-y-auto">
			{#if results.length === 0}
				<div class="p-4 text-center text-terminal-text-muted">No posts found</div>
			{:else}
				<!--
				  KEYED EACH - Using slug as key
				  ------------------------------
				  WHY slug instead of index?
				  - Posts have stable identity (slug is unique)
				  - Results can be reordered (by search relevance)
				  - Using slug ensures DOM elements are reused correctly
				-->
				{#each results as result, i (result.item.slug)}
					<!--
					  RESULT ITEM
					  -----------
					  CONDITIONAL CLASSES:
					  Selected items get:
					  - Orange left border (visual indicator)
					  - Orange tinted background
					  - Adjusted padding to account for border

					  TEMPLATE EXPRESSION IN CLASS:
					  `class="... {condition ? 'class-a' : 'class-b'}"`
					  Svelte allows JS expressions in class attribute.
					-->
					<div
						class="cursor-pointer border-b border-terminal-border/50 py-3 last:border-b-0 {i ===
						selectedIndex
							? 'border-l-2 border-l-terminal-accent-orange bg-terminal-accent-orange/10 pl-3.5 pr-4'
							: 'px-4'}"
						onclick={() => onSelect(result.item.slug)}
						onkeydown={(e) => e.key === 'Enter' && onSelect(result.item.slug)}
						role="option"
						aria-selected={i === selectedIndex}
						tabindex={0}
					>
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<!--
								  HIGHLIGHTED TITLE
								  -----------------
								  Renders title with matched portions highlighted.
								  Each segment is either highlighted or plain text.
								-->
								<div class="truncate font-medium text-terminal-text-primary">
									{#each getHighlightedTitle(result) as segment}
										{#if segment.highlighted}
											<!-- fuzzy-match class defined in app.css for highlight styling -->
											<span class="fuzzy-match">{segment.text}</span>
										{:else}
											{segment.text}
										{/if}
									{/each}
								</div>
								<!-- Description -->
								<div class="mt-1 truncate text-sm text-terminal-text-muted">
									{result.item.description}
								</div>
								<!-- Tags and category -->
								<div class="mt-2 flex flex-wrap gap-2">
									<span
										class="rounded-sm bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-accent-yellow"
									>
										{result.item.category}
									</span>
									<!--
									  INLINE ARRAY OPERATION: .slice(0, 3)
									  ------------------------------------
									  Only show first 3 tags to prevent overflow.
									  This runs every render, but is cheap (array.slice).
									-->
									{#each result.item.tags.slice(0, 3) as tag}
										<span
											class="rounded-sm bg-terminal-bg-primary px-2 py-0.5 text-xs text-terminal-text-muted"
										>
											{tag}
										</span>
									{/each}
								</div>
							</div>
							<!-- Date -->
							<div class="text-xs text-terminal-text-dim">
								{result.item.date}
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!--
		  FOOTER - Keyboard hints and result count
		  ----------------------------------------
		  Helps users discover keyboard shortcuts.
		  Result count updates reactively as results change.
		-->
		<div
			class="flex items-center justify-between border-t border-terminal-border px-4 py-2 text-xs text-terminal-text-muted"
		>
			<div class="flex gap-4">
				<span><kbd class="rounded-sm bg-terminal-bg-primary px-1">↑↓</kbd> navigate</span>
				<span><kbd class="rounded-sm bg-terminal-bg-primary px-1">↵</kbd> select</span>
			</div>
			<!--
			  PLURALIZATION
			  -------------
			  `results.length === 1 ? '' : 's'`
			  Simple approach: add 's' for plural.
			  For complex i18n, use a library like svelte-i18n.
			-->
			<div>
				{results.length} result{results.length === 1 ? '' : 's'}
			</div>
		</div>
	</div>
</div>
