<script lang="ts">
	import { onMount } from 'svelte';
	import CommandLine from './CommandLine.svelte';
	import Output from './Output.svelte';
	import FuzzyFinder from './FuzzyFinder.svelte';
	import {
		cwd,
		outputBuffer,
		addOutput,
		addToHistory,
		fuzzyFinderOpen,
		clearOutput
	} from '$lib/stores/terminal';
	import { posts } from '$lib/stores/posts';
	import { executeCommand, type CommandContext } from '$lib/commands';
	import { buildFileSystem, type FSNode } from '$lib/filesystem';

	// Import all commands to register them
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

	interface Props {
		onNavigateToPost?: (slug: string) => void;
	}

	let { onNavigateToPost }: Props = $props();

	let terminalRef: HTMLDivElement;
	let fs: FSNode = $state(buildFileSystem([]));

	// Rebuild filesystem when posts change
	$effect(() => {
		fs = buildFileSystem($posts);
	});

	// Show welcome message on mount
	onMount(() => {
		showWelcome();
	});

	function showWelcome() {
		addOutput([
			{ type: 'text', content: '' },
			{ type: 'success', content: '  Welcome to brandonwie.dev' },
			{ type: 'text', content: '' },
			{ type: 'text', content: "  Type 'help' for available commands" },
			{ type: 'text', content: "  Type 'whoami' to learn about me" },
			{ type: 'text', content: '  Press Ctrl+P for fuzzy search' },
			{ type: 'text', content: '' }
		]);
	}

	function handleCommand(command: string) {
		// Add command prompt to output
		addOutput({
			type: 'text',
			content: `${formatPrompt($cwd)} ${command}`
		});

		const context: CommandContext = {
			cwd: $cwd,
			setCwd: (path: string) => cwd.set(path),
			fs,
			posts: $posts,
			navigateToPost: (slug: string) => {
				if (onNavigateToPost) {
					onNavigateToPost(slug);
				}
			},
			openFuzzyFinder: () => fuzzyFinderOpen.set(true)
		};

		const result = executeCommand(command, context);

		// Add output
		if (result.output.length > 0) {
			addOutput(result.output);
		}

		// Update cwd if changed
		if (result.newCwd) {
			cwd.set(result.newCwd);
		}

		// Add to history
		addToHistory(command, result.output);

		// Scroll to bottom
		scrollToBottom();
	}

	function formatPrompt(currentCwd: string): string {
		return `visitor@brandonwie.dev:${currentCwd}$`;
	}

	function scrollToBottom() {
		if (terminalRef) {
			setTimeout(() => {
				terminalRef.scrollTop = terminalRef.scrollHeight;
			}, 0);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Ctrl+P or Ctrl+K to open fuzzy finder
		if ((event.ctrlKey || event.metaKey) && (event.key === 'p' || event.key === 'k')) {
			event.preventDefault();
			fuzzyFinderOpen.set(true);
		}

		// Ctrl+L to clear
		if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
			event.preventDefault();
			clearOutput();
			showWelcome();
		}
	}

	function handleFuzzySelect(slug: string) {
		fuzzyFinderOpen.set(false);
		if (onNavigateToPost) {
			onNavigateToPost(slug);
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex h-screen flex-col bg-terminal-bg-primary">
	<!-- Terminal Header -->
	<div class="flex items-center gap-2 border-b border-terminal-border bg-terminal-bg-secondary px-4 py-2">
		<div class="flex gap-1.5">
			<div class="h-3 w-3 rounded-full bg-terminal-accent-red"></div>
			<div class="h-3 w-3 rounded-full bg-terminal-accent-yellow"></div>
			<div class="h-3 w-3 rounded-full bg-terminal-accent-green"></div>
		</div>
		<span class="ml-2 text-sm text-terminal-text-muted">visitor@brandonwie.dev</span>
	</div>

	<!-- Terminal Body -->
	<div
		bind:this={terminalRef}
		class="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
	>
		<Output lines={$outputBuffer} />
	</div>

	<!-- Command Input -->
	<div class="border-t border-terminal-border bg-terminal-bg-secondary p-4">
		<CommandLine
			prompt={formatPrompt($cwd)}
			onSubmit={handleCommand}
		/>
	</div>

	<!-- Fuzzy Finder Overlay -->
	{#if $fuzzyFinderOpen}
		<FuzzyFinder
			posts={$posts}
			onSelect={handleFuzzySelect}
			onClose={() => fuzzyFinderOpen.set(false)}
		/>
	{/if}
</div>
