import type { OutputLine } from '../stores/terminal';
import type { FSNode } from '../filesystem';
import type { PostMetadata } from '../stores/posts';

export interface CommandContext {
	cwd: string;
	setCwd: (path: string) => void;
	fs: FSNode;
	posts: PostMetadata[];
	navigateToPost: (slug: string) => void;
	openFuzzyFinder: () => void;
}

export interface CommandResult {
	output: OutputLine[];
	newCwd?: string;
}

export type CommandHandler = (args: string[], context: CommandContext) => CommandResult;

// Command registry
const commands: Map<string, CommandHandler> = new Map();

// Register a command
export function registerCommand(name: string, handler: CommandHandler) {
	commands.set(name, handler);
}

// Execute a command
export function executeCommand(input: string, context: CommandContext): CommandResult {
	const trimmed = input.trim();

	if (!trimmed) {
		return { output: [] };
	}

	// Parse command and arguments
	const parts = parseCommandLine(trimmed);
	const [commandName, ...args] = parts;

	const handler = commands.get(commandName.toLowerCase());

	if (!handler) {
		return {
			output: [
				{
					type: 'error',
					content: `command not found: ${commandName}`,
				},
				{
					type: 'text',
					content: `Type 'help' for available commands`,
				},
			],
		};
	}

	try {
		return handler(args, context);
	} catch (error) {
		return {
			output: [
				{
					type: 'error',
					content: `Error executing ${commandName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
				},
			],
		};
	}
}

// Parse command line respecting quotes
function parseCommandLine(input: string): string[] {
	const parts: string[] = [];
	let current = '';
	let inQuotes = false;
	let quoteChar = '';

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if ((char === '"' || char === "'") && !inQuotes) {
			inQuotes = true;
			quoteChar = char;
		} else if (char === quoteChar && inQuotes) {
			inQuotes = false;
			quoteChar = '';
		} else if (char === ' ' && !inQuotes) {
			if (current) {
				parts.push(current);
				current = '';
			}
		} else {
			current += char;
		}
	}

	if (current) {
		parts.push(current);
	}

	return parts;
}

// Get all registered commands
export function getCommands(): string[] {
	return Array.from(commands.keys()).sort();
}

// Export for command autocomplete
export function getCommandCompletions(partial: string): string[] {
	const lower = partial.toLowerCase();
	return getCommands().filter((cmd) => cmd.startsWith(lower));
}
