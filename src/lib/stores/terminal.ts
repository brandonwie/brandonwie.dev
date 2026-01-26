import { writable, derived, get } from 'svelte/store';

export interface CommandHistoryEntry {
	command: string;
	output: OutputLine[];
	timestamp: Date;
}

export interface OutputLine {
	type: 'text' | 'error' | 'success' | 'directory' | 'file' | 'link' | 'markdown' | 'html' | 'purple';
	content: string;
	link?: string;
}

// Current working directory
export const cwd = writable<string>('~');

// Command history
export const commandHistory = writable<CommandHistoryEntry[]>([]);

// History navigation index (-1 means not navigating)
export const historyIndex = writable<number>(-1);

// Current input value
export const currentInput = writable<string>('');

// Fuzzy finder state
export const fuzzyFinderOpen = writable<boolean>(false);

// Terminal output buffer (for display)
export const outputBuffer = writable<OutputLine[]>([]);

// Add output to buffer
export function addOutput(lines: OutputLine | OutputLine[]) {
	outputBuffer.update((buffer) => {
		const newLines = Array.isArray(lines) ? lines : [lines];
		return [...buffer, ...newLines];
	});
}

// Clear output buffer
export function clearOutput() {
	outputBuffer.set([]);
}

// Add command to history
export function addToHistory(command: string, output: OutputLine[]) {
	commandHistory.update((history) => [
		...history,
		{
			command,
			output,
			timestamp: new Date()
		}
	]);
	historyIndex.set(-1);
}

// Navigate history up
export function historyUp() {
	const history = get(commandHistory);
	const currentIndex = get(historyIndex);

	if (history.length === 0) return;

	if (currentIndex === -1) {
		historyIndex.set(history.length - 1);
		currentInput.set(history[history.length - 1].command);
	} else if (currentIndex > 0) {
		historyIndex.set(currentIndex - 1);
		currentInput.set(history[currentIndex - 1].command);
	}
}

// Navigate history down
export function historyDown() {
	const history = get(commandHistory);
	const currentIndex = get(historyIndex);

	if (currentIndex === -1) return;

	if (currentIndex < history.length - 1) {
		historyIndex.set(currentIndex + 1);
		currentInput.set(history[currentIndex + 1].command);
	} else {
		historyIndex.set(-1);
		currentInput.set('');
	}
}

// Get just the command strings from history
export const commandStrings = derived(commandHistory, ($history) =>
	$history.map((entry) => entry.command)
);
