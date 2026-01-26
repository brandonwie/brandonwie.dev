import { registerCommand } from './index';
import { clearOutput } from '../stores/terminal';

registerCommand('clear', () => {
	clearOutput();
	return { output: [] };
});

// Also register 'cls' as alias (Windows users)
registerCommand('cls', () => {
	clearOutput();
	return { output: [] };
});
