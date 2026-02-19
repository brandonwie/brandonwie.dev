<!--
  CommandLine.svelte - Terminal Input Component
  =============================================

  WHAT: Handles user input with custom cursor, history, and tab completion.
  WHY:  Real terminals have block cursors, command history, and completion.
  HOW:  Hidden input + visible cursor overlay technique.

  ARCHITECTURE:
  - Hidden <input> captures actual keystrokes (for mobile/accessibility)
  - Visible <div> displays text with custom block cursor
  - This technique ensures native keyboard support while allowing custom styling

  CHALLENGE: Browser inputs have blinking line cursors, not block cursors.
  SOLUTION: Make input transparent, render text + cursor separately.
-->
<script lang="ts">
	// STORE IMPORTS
	// -------------
	// `currentInput` - Store holding current command text
	// `historyUp/Down` - Functions to navigate command history
	// `fuzzyFinderOpen` - Need to know when modal is open (disable focus stealing)
	import { currentInput, historyUp, historyDown, fuzzyFinderOpen } from '$lib/stores/terminal';
	import { getCommandCompletions } from '$lib/commands';
	import { onMount } from 'svelte';

	// PROPS INTERFACE
	// ---------------
	interface Props {
		cwd: string;                         // Current directory for prompt
		onSubmit: (command: string) => void; // Callback when Enter pressed
	}

	let { cwd, onSubmit }: Props = $props();

	// $derived() - COMPUTED/DERIVED STATE
	// -----------------------------------
	// `$derived()` creates a value that auto-updates when dependencies change.
	// REPLACES: Svelte 4's `$: derivedValue = computation`
	// WHY: More explicit - clearly marks derived values.
	// DIFFERENCE from $state: Can't be directly modified, only computed.
	//
	// REFERENCE: https://svelte.dev/docs/svelte/$derived
	const fullPrompt = $derived(`visitor@brandonwie.dev:${cwd}$`);
	const shortPrompt = $derived(`${cwd}$`);

	// Component state
	let inputRef: HTMLInputElement;
	let completions: string[] = $state([]);
	let showCompletions = $state(false);
	let selectedCompletion = $state(0);
	let cursorPosition = $state(0);

	// EXPORT FUNCTION - COMPONENT API
	// --------------------------------
	// `export function` makes method callable from parent via bind:this.
	// PATTERN: Exposing imperative methods when needed.
	// WHEN TO USE: Focus, scroll, reset - things hard to do declaratively.
	//
	// REFERENCE: https://svelte.dev/docs/svelte/component-fundamentals#Component-exports
	export function focus() {
		inputRef?.focus();
	}

	// Focus input on mount
	onMount(() => {
		inputRef?.focus();
	});

	// Track cursor position for block cursor rendering
	function updateCursorPosition() {
		cursorPosition = inputRef?.selectionStart ?? $currentInput.length;
	}

	// $effect() - REFOCUS AFTER FUZZY FINDER CLOSES
	// ----------------------------------------------
	// PATTERN: Tracking previous state to detect changes.
	// WHY: Need to refocus CommandLine when FuzzyFinder closes.
	// HOW: Compare current vs previous value of fuzzyFinderOpen.
	//
	// NOTE: `wasFuzzyOpen` is $state because we need to persist across renders.
	let wasFuzzyOpen = $state(false);
	$effect(() => {
		const isOpen = $fuzzyFinderOpen;
		if (wasFuzzyOpen && !isOpen) {
			// Fuzzy finder just closed (was open, now closed)
			// Small delay ensures FuzzyFinder has unmounted
			setTimeout(() => {
				inputRef?.focus();
			}, 50);
		}
		wasFuzzyOpen = isOpen;
	});

	// KEYBOARD EVENT HANDLER
	// ----------------------
	// Handles special keys: Enter, arrows, Tab, Escape, Ctrl+C
	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Enter':
				event.preventDefault();
				if (showCompletions && completions.length > 0) {
					// If completion dropdown is open, apply selected completion
					const parts = $currentInput.split(' ');
					parts[parts.length - 1] = completions[selectedCompletion];
					currentInput.set(parts.join(' '));
					showCompletions = false;
				} else if ($currentInput.trim()) {
					// Submit command if not empty
					onSubmit($currentInput);
					currentInput.set('');
				}
				break;

			case 'ArrowUp':
				event.preventDefault();
				if (showCompletions) {
					// Navigate completion list
					selectedCompletion = Math.max(0, selectedCompletion - 1);
				} else {
					// Navigate command history (older)
					historyUp();
				}
				break;

			case 'ArrowDown':
				event.preventDefault();
				if (showCompletions) {
					// Navigate completion list
					selectedCompletion = Math.min(completions.length - 1, selectedCompletion + 1);
				} else {
					// Navigate command history (newer)
					historyDown();
				}
				break;

			case 'Tab':
				event.preventDefault();  // Prevent focus change
				handleTab();
				break;

			case 'Escape':
				showCompletions = false;
				break;

			case 'c':
				// Ctrl+C clears current input (like bash)
				if (event.ctrlKey) {
					event.preventDefault();
					currentInput.set('');
					showCompletions = false;
				}
				break;
		}
	}

	// TAB COMPLETION
	// --------------
	// WHY: UX - complete command names like real terminals.
	// BEHAVIOR:
	// - Single match: Auto-complete with space
	// - Multiple matches: Show dropdown
	function handleTab() {
		const input = $currentInput;
		const parts = input.split(' ');
		const lastPart = parts[parts.length - 1];

		// Only complete commands (first word), not arguments
		if (parts.length === 1) {
			const matches = getCommandCompletions(lastPart);
			if (matches.length === 1) {
				// Single match - auto-complete
				currentInput.set(matches[0] + ' ');
				showCompletions = false;
			} else if (matches.length > 1) {
				// Multiple matches - show dropdown
				completions = matches;
				showCompletions = true;
				selectedCompletion = 0;
			}
		}
		// TODO: Add path completion for command arguments
	}

	// Reset completions when input changes
	function handleInput() {
		showCompletions = false;
	}

	// FOCUS MANAGEMENT
	// ----------------
	// WHY: Terminal should always be ready for input.
	// BEHAVIOR: Refocus after blur, unless FuzzyFinder is open.
	// setTimeout prevents focus race conditions.
	function handleBlur() {
		setTimeout(() => {
			if (!$fuzzyFinderOpen) {
				inputRef?.focus();
			}
		}, 10);
	}
</script>

<!--
  CLICK HANDLER ON WRAPPER
  ------------------------
  WHY: Clicking anywhere in the command area should focus input.
  This improves UX - users don't have to click exactly on the input.

  svelte-ignore: We intentionally use click without keydown here.
  The actual input handles keyboard events.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="relative min-w-0" onclick={() => inputRef?.focus()} role="textbox" tabindex="-1">
	<div class="flex items-center gap-x-2">
		<!--
		  RESPONSIVE PROMPT
		  -----------------
		  Short prompt on mobile, full prompt on desktop.
		  - md:hidden = visible below 768px
		  - hidden md:inline = visible at 768px+
		  Tailwind's responsive classes make this easy.
		-->
		<span class="shrink-0 text-terminal-accent-green md:hidden">{shortPrompt}</span>
		<span class="hidden shrink-0 text-terminal-accent-green md:inline">{fullPrompt}</span>
		<div class="relative min-w-0 flex-1">
			<!--
			  HIDDEN INPUT TECHNIQUE
			  ----------------------
			  PROBLEM: Browser inputs have line cursors, we want block cursor.
			  SOLUTION:
			  1. Make input transparent (color: transparent)
			  2. Position it absolutely over the visible text
			  3. Render visible text + cursor separately

			  WHY this works:
			  - Input captures all keyboard events natively
			  - Mobile keyboards work correctly
			  - Screen readers work correctly
			  - We control the visual presentation

			  MOBILE CONSIDERATIONS:
			  - font-size: 16px prevents iOS zoom on focus
			  - caret-transparent hides the native caret
			  - -webkit-text-fill-color: transparent for Safari
			-->
			<!-- svelte-ignore a11y_autofocus -->
			<!-- Hidden input for actual typing - autofocus is intentional for terminal UX -->
			<input
				bind:this={inputRef}
				bind:value={$currentInput}
				onkeydown={handleKeyDown}
				oninput={() => { handleInput(); updateCursorPosition(); }}
				onblur={handleBlur}
				onclick={updateCursorPosition}
				onkeyup={updateCursorPosition}
				onselect={updateCursorPosition}
				type="text"
				class="absolute inset-0 z-10 h-full w-full border-none bg-transparent caret-transparent outline-none"
				style="color: transparent; -webkit-text-fill-color: transparent; font-size: 16px;"
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
				autofocus
			/>
			<!--
			  VISIBLE TEXT WITH BLOCK CURSOR
			  ------------------------------
			  STRUCTURE: [text before cursor][cursor block][text after cursor]

			  BLOCK CURSOR:
			  - Shows current character (or space if at end)
			  - .cursor-block class adds background highlight (defined in app.css)

			  pointer-events-none: Clicks pass through to hidden input.
			  break-all: Allows text to wrap within container.
			  whitespace-pre-wrap: Preserves spaces, allows wrapping.
			-->
			<div class="pointer-events-none relative z-20 break-all text-terminal-text-primary"><span class="whitespace-pre-wrap">{$currentInput.slice(0, cursorPosition)}</span><span class="cursor-block">{$currentInput[cursorPosition] || ' '}</span><span class="whitespace-pre-wrap">{$currentInput.slice(cursorPosition + 1)}</span></div>
		</div>
	</div>

	<!--
	  TAB COMPLETION DROPDOWN
	  -----------------------
	  POSITIONING:
	  - absolute: Positions relative to nearest positioned ancestor
	  - bottom-full: Places above the input (opens upward)
	  - mb-1: Small gap between dropdown and input

	  ACCESSIBILITY:
	  - role="listbox": Indicates this is a selection list
	  - role="option": Each item is a selectable option
	  - aria-selected: Indicates current selection
	-->
	{#if showCompletions && completions.length > 0}
		<div class="absolute bottom-full left-0 mb-1 rounded border border-terminal-border bg-terminal-bg-secondary p-1" role="listbox">
			{#each completions as completion, i}
				<button
					type="button"
					role="option"
					aria-selected={i === selectedCompletion}
					class="block w-full cursor-pointer rounded px-2 py-0.5 text-left {i === selectedCompletion
						? 'bg-terminal-bg-hover text-terminal-accent-orange'
						: 'text-terminal-text-primary'}"
					onclick={() => {
						// Apply completion and close dropdown
						const parts = $currentInput.split(' ');
						parts[parts.length - 1] = completion;
						currentInput.set(parts.join(' ') + ' ');
						showCompletions = false;
						inputRef?.focus();
					}}
				>
					{completion}
				</button>
			{/each}
		</div>
	{/if}
</div>
