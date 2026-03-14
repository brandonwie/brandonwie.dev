<!--
  Terminal.svelte - Main Terminal Container Component
  ===================================================

  WHAT: The core terminal interface that provides a CLI experience.
  WHY:  This blog uses a terminal theme - users interact via commands.
  HOW:  Manages state (filesystem, output, history) and orchestrates child components.

  COMPONENT ARCHITECTURE:
  ┌─────────────────────────────────────────┐
  │  Terminal (this component)              │
  │  ├── Output.svelte (displays lines)     │
  │  ├── CommandLine.svelte (user input)    │
  │  └── FuzzyFinder.svelte (search modal)  │
  └─────────────────────────────────────────┘

  STATE MANAGEMENT:
  - Uses Svelte stores for shared state (cwd, outputBuffer, history)
  - Stores allow state to be accessed by commands without prop drilling

  REFERENCE: https://svelte.dev/docs/svelte/stores
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import CommandLine from './CommandLine.svelte';
	import Output from './Output.svelte';
	import FuzzyFinder from './FuzzyFinder.svelte';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';

	// SVELTE STORES - Shared State
	// ----------------------------
	// Stores are imported and accessed with `$` prefix for auto-subscription.
	// `$cwd` reads the store value and auto-updates when it changes.
	// `cwd.set(value)` updates the store value.
	import {
		cwd,
		outputBuffer,
		addOutput,
		addToHistory,
		fuzzyFinderOpen,
		clearOutput,
	} from '$lib/stores/terminal';
	import { posts } from '$lib/stores/posts';

	// Command execution system
	import { executeCommand, type CommandContext } from '$lib/commands';
	import { buildFileSystem, type FSNode } from '$lib/filesystem';

	// COMMAND REGISTRATION (Side Effect Imports)
	// ------------------------------------------
	// These imports don't return anything - they register commands as a side effect.
	// WHY: Each command file calls `registerCommand()` when imported.
	// PATTERN: Self-registering modules - import order doesn't matter.
	import '$lib/commands/ls';
	import '$lib/commands/cd';
	import '$lib/commands/cat';
	import '$lib/commands/grep';
	import '$lib/commands/help';
	import '$lib/commands/whoami';
	import '$lib/commands/clear';
	import '$lib/commands/pwd';
	import '$lib/commands/history';
	import '$lib/commands/open';
	import '$lib/commands/echo';

	// PROPS INTERFACE
	// ---------------
	// TypeScript interface for component props.
	// WHY: Type safety and documentation of expected props.
	// The `?` makes `onNavigateToPost` optional.
	interface Props {
		onNavigateToPost?: (slug: string) => void;
	}

	// $props() - SVELTE 5 PROPS DECLARATION
	// -------------------------------------
	// Destructure props with defaults.
	// Optional callback for when user wants to navigate to a post.
	let { onNavigateToPost }: Props = $props();

	// COMPONENT STATE
	// ---------------
	// `let variable: Type` for non-reactive references (DOM elements).
	// `let variable = $state(initial)` for reactive state (Svelte 5 rune).
	let terminalRef: HTMLDivElement;
	let commandLineRef: { focus: () => void };

	// $state() - SVELTE 5 REACTIVE STATE
	// ----------------------------------
	// `$state()` creates reactive state that triggers re-renders when changed.
	// REPLACES: Svelte 4's `let x = value` reactive declarations.
	// WHY: More explicit - only $state() variables are reactive.
	let fs: FSNode = $state(buildFileSystem([]));

	// $effect() - SVELTE 5 REACTIVE SIDE EFFECTS
	// ------------------------------------------
	// `$effect()` runs when its dependencies change (like React useEffect).
	// DEPENDENCIES: Automatically tracked - any `$state` or store read inside.
	// RUNS: After component renders, when any dependency changes.
	//
	// WHY here: Rebuild filesystem when posts change.
	// Dependencies: `$posts` (auto-tracked by reading inside $effect)
	//
	// REFERENCE: https://svelte.dev/docs/svelte/$effect
	$effect(() => {
		fs = buildFileSystem($posts);
	});

	// onMount - LIFECYCLE HOOK
	// ------------------------
	// Runs once when component is first mounted to DOM.
	// WHY: Show welcome message only on initial load, not on every re-render.
	// CLEANUP: Return a function to run on unmount (not used here).
	onMount(() => {
		clearOutput();
		showWelcome();
	});

	// Welcome message displayed on terminal start
	function showWelcome() {
		// addOutput accepts single OutputLine or array of OutputLines
		addOutput([
			{ type: 'text', content: '' },
			{ type: 'success', content: '  Welcome to brandonwie.dev' },
			{ type: 'text', content: '' },
			{ type: 'text', content: "  Type 'help' for available commands" },
			{ type: 'text', content: "  Type 'whoami' to learn about me" },
			{ type: 'text', content: '  Press Ctrl+P (or Cmd+P) for fuzzy search' },
			{ type: 'text', content: '' },
		]);
	}

	// COMMAND EXECUTION
	// -----------------
	// Called when user submits a command in CommandLine.
	// 1. Echo the command to output (shows what user typed)
	// 2. Build context object with all dependencies commands need
	// 3. Execute command and get result
	// 4. Display output and update state
	function handleCommand(command: string) {
		// Echo command to output (like a real terminal)
		addOutput({
			type: 'text',
			content: `${formatPrompt($cwd)} ${command}`,
		});

		// COMMAND CONTEXT PATTERN
		// -----------------------
		// WHY: Commands need access to various app state and functions.
		// PATTERN: Dependency injection - pass everything commands need.
		// BENEFIT: Commands are pure functions, easy to test.
		const context: CommandContext = {
			cwd: $cwd, // Current working directory
			setCwd: (path: string) => cwd.set(path), // Function to change directory
			fs, // Virtual filesystem
			posts: $posts, // Blog posts data
			navigateToPost: (slug: string) => {
				// Navigation callback
				if (onNavigateToPost) {
					onNavigateToPost(slug);
				}
			},
			openFuzzyFinder: () => fuzzyFinderOpen.set(true), // Open search modal
		};

		const result = executeCommand(command, context);

		// Add command output to buffer
		if (result.output.length > 0) {
			addOutput(result.output);
		}

		// Update cwd if command changed it (e.g., `cd` command)
		if (result.newCwd) {
			cwd.set(result.newCwd);
		}

		// Add to history for up/down arrow navigation
		addToHistory(command, result.output);

		// Auto-scroll to show new output
		scrollToBottom();
	}

	// Format the terminal prompt string
	function formatPrompt(currentCwd: string): string {
		return `visitor@brandonwie.dev:${currentCwd}$`;
	}

	// Scroll terminal to bottom after new output
	// setTimeout(0) ensures DOM has updated before scrolling
	function scrollToBottom() {
		if (terminalRef) {
			setTimeout(() => {
				terminalRef.scrollTop = terminalRef.scrollHeight;
			}, 0);
		}
	}

	// GLOBAL KEYBOARD SHORTCUTS
	// -------------------------
	// Ctrl+P/K: Open fuzzy finder (like VS Code)
	// Ctrl+L: Clear terminal (like bash)
	function handleKeyDown(event: KeyboardEvent) {
		// Ctrl+P or Ctrl+K (or Cmd on Mac) to open fuzzy finder
		if ((event.ctrlKey || event.metaKey) && (event.key === 'p' || event.key === 'k')) {
			event.preventDefault(); // Prevent browser's default (print dialog)
			fuzzyFinderOpen.set(true);
		}

		// Ctrl+L to clear (standard terminal shortcut)
		if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
			event.preventDefault();
			clearOutput();
			showWelcome();
		}
	}

	// Handle post selection from FuzzyFinder
	function handleFuzzySelect(slug: string) {
		fuzzyFinderOpen.set(false); // Close the modal
		if (onNavigateToPost) {
			onNavigateToPost(slug); // Navigate to selected post
		}
	}
</script>

<!--
  <svelte:window> - Global Event Binding
  --------------------------------------
  Attach keyboard handler to window for global shortcuts.
  Works anywhere on page, not just when terminal is focused.
-->
<svelte:window onkeydown={handleKeyDown} />

<div class="flex h-screen flex-col bg-terminal-bg-primary">
	<!--
	  TERMINAL HEADER
	  ---------------
	  Classic macOS-style window decoration with traffic light buttons.
	  Pure decoration - buttons don't do anything.
	-->
	<div
		class="flex items-center justify-between gap-2 border-b border-terminal-border bg-terminal-bg-secondary px-4 py-2"
	>
		<div class="flex items-center gap-2 min-w-0">
			<div class="flex gap-1.5 shrink-0">
				<!-- Traffic light buttons (close, minimize, maximize) -->
				<div class="h-3 w-3 rounded-full bg-terminal-accent-red"></div>
				<div class="h-3 w-3 rounded-full bg-terminal-accent-yellow"></div>
				<div class="h-3 w-3 rounded-full bg-terminal-accent-green"></div>
			</div>
			<span class="ml-2 text-sm text-terminal-text-muted truncate">visitor@brandonwie.dev</span>
		</div>
		<div class="flex items-center gap-2">
			<ViewToggle />
			<LanguageToggle />
		</div>
	</div>

	<!--
	  TERMINAL BODY
	  -------------
	  bind:this - DOM ELEMENT BINDING
	  WHY: Need reference to scroll programmatically.
	  `bind:this={terminalRef}` assigns the DOM element to the variable.

	  ACCESSIBILITY COMMENTS:
	  - svelte-ignore disables specific a11y warnings
	  - WHY ignored: clicking body to focus input is intentional UX
	  - role="log" indicates this is a log/output region
	-->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- Terminal Body - clicking/pressing a key focuses the command input for better UX -->
	<div
		bind:this={terminalRef}
		class="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
		onclick={() => commandLineRef?.focus()}
		onkeydown={() => commandLineRef?.focus()}
		tabindex="-1"
		role="log"
	>
		<!--
		  STORE AUTO-SUBSCRIPTION
		  -----------------------
		  `$outputBuffer` reads the store value with auto-subscription.
		  Component re-renders when outputBuffer changes.
		  No manual subscribe/unsubscribe needed.
		-->
		<Output lines={$outputBuffer} />
	</div>

	<!-- COMMAND INPUT -->
	<div class="border-t border-terminal-border bg-terminal-bg-secondary p-4">
		<!--
		  bind:this WITH COMPONENT METHODS
		  --------------------------------
		  bind:this on a component gives access to exported methods.
		  CommandLine exports `focus()`, so we can call `commandLineRef.focus()`.

		  COMPONENT PROPS:
		  - cwd: Current directory for prompt display
		  - onSubmit: Callback when user presses Enter
		-->
		<CommandLine bind:this={commandLineRef} cwd={$cwd} onSubmit={handleCommand} />
	</div>

	<!--
	  CONDITIONAL RENDERING - FUZZY FINDER MODAL
	  ------------------------------------------
	  {#if $fuzzyFinderOpen} only mounts FuzzyFinder when store is true.
	  WHY: Modal doesn't exist in DOM until opened - better performance.
	  When fuzzyFinderOpen becomes false, component unmounts (cleanup runs).
	-->
	{#if $fuzzyFinderOpen}
		<FuzzyFinder
			posts={$posts}
			onSelect={handleFuzzySelect}
			onClose={() => fuzzyFinderOpen.set(false)}
		/>
	{/if}
</div>
