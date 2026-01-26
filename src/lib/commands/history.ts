import { registerCommand } from './index';
import { get } from 'svelte/store';
import { commandHistory } from '../stores/terminal';
import type { OutputLine } from '../stores/terminal';

registerCommand('history', () => {
	const history = get(commandHistory);

	if (history.length === 0) {
		return {
			output: [
				{
					type: 'text',
					content: '(no commands in history)'
				}
			]
		};
	}

	const output: OutputLine[] = history.map((entry, index) => ({
		type: 'text',
		content: `  ${String(index + 1).padStart(4)}  ${entry.command}`
	}));

	return { output };
});
