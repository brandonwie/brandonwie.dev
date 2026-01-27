<script lang="ts">
	import { currentInput, historyUp, historyDown, fuzzyFinderOpen } from '$lib/stores/terminal';
	import { getCommandCompletions } from '$lib/commands';
	import { onMount } from 'svelte';

	interface Props {
		cwd: string;
		onSubmit: (command: string) => void;
	}

	let { cwd, onSubmit }: Props = $props();

	// Full prompt for desktop, short for mobile
	const fullPrompt = $derived(`visitor@brandonwie.dev:${cwd}$`);
	const shortPrompt = $derived(`${cwd}$`);

	let inputRef: HTMLInputElement;
	let completions: string[] = $state([]);
	let showCompletions = $state(false);
	let selectedCompletion = $state(0);
	let cursorPosition = $state(0);

	// Expose focus method for parent components
	export function focus() {
		inputRef?.focus();
	}

	onMount(() => {
		// Focus input on mount
		inputRef?.focus();
	});

	function updateCursorPosition() {
		cursorPosition = inputRef?.selectionStart ?? $currentInput.length;
	}

	// Refocus when fuzzy finder closes
	let wasFuzzyOpen = $state(false);
	$effect(() => {
		const isOpen = $fuzzyFinderOpen;
		if (wasFuzzyOpen && !isOpen) {
			// Fuzzy finder just closed, refocus terminal input
			setTimeout(() => {
				inputRef?.focus();
			}, 50);
		}
		wasFuzzyOpen = isOpen;
	});

	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Enter':
				event.preventDefault();
				if (showCompletions && completions.length > 0) {
					// Apply completion
					const parts = $currentInput.split(' ');
					parts[parts.length - 1] = completions[selectedCompletion];
					currentInput.set(parts.join(' '));
					showCompletions = false;
				} else if ($currentInput.trim()) {
					onSubmit($currentInput);
					currentInput.set('');
				}
				break;

			case 'ArrowUp':
				event.preventDefault();
				if (showCompletions) {
					selectedCompletion = Math.max(0, selectedCompletion - 1);
				} else {
					historyUp();
				}
				break;

			case 'ArrowDown':
				event.preventDefault();
				if (showCompletions) {
					selectedCompletion = Math.min(completions.length - 1, selectedCompletion + 1);
				} else {
					historyDown();
				}
				break;

			case 'Tab':
				event.preventDefault();
				handleTab();
				break;

			case 'Escape':
				showCompletions = false;
				break;

			case 'c':
				if (event.ctrlKey) {
					event.preventDefault();
					currentInput.set('');
					showCompletions = false;
				}
				break;
		}
	}

	function handleTab() {
		const input = $currentInput;
		const parts = input.split(' ');
		const lastPart = parts[parts.length - 1];

		// If at start, complete commands
		if (parts.length === 1) {
			const matches = getCommandCompletions(lastPart);
			if (matches.length === 1) {
				currentInput.set(matches[0] + ' ');
				showCompletions = false;
			} else if (matches.length > 1) {
				completions = matches;
				showCompletions = true;
				selectedCompletion = 0;
			}
		}
		// TODO: Add path completion for arguments
	}

	function handleInput() {
		// Reset completions on input change
		showCompletions = false;
	}

	// Keep input focused (unless fuzzy finder is open)
	function handleBlur() {
		setTimeout(() => {
			if (!$fuzzyFinderOpen) {
				inputRef?.focus();
			}
		}, 10);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="relative min-w-0" onclick={() => inputRef?.focus()} role="textbox" tabindex="-1">
	<div class="flex items-center gap-x-2">
		<!-- Short prompt on mobile, full prompt on desktop -->
		<span class="shrink-0 text-terminal-accent-green md:hidden">{shortPrompt}</span>
		<span class="hidden shrink-0 text-terminal-accent-green md:inline">{fullPrompt}</span>
		<div class="relative min-w-0 flex-1">
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
			<!-- Visible text with block cursor -->
			<div class="pointer-events-none break-all text-terminal-text-primary"><span class="whitespace-pre-wrap">{$currentInput.slice(0, cursorPosition)}</span><span class="cursor-block">{$currentInput[cursorPosition] || ' '}</span><span class="whitespace-pre-wrap">{$currentInput.slice(cursorPosition + 1)}</span></div>
		</div>
	</div>

	<!-- Completions dropdown -->
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
