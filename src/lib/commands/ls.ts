import { registerCommand } from './index';
import { resolvePath, listDirectory, getAbsolutePath } from '../filesystem';
import type { OutputLine } from '../stores/terminal';

registerCommand('ls', (args, context) => {
	const path = args[0] || '.';
	const targetPath = getAbsolutePath(context.cwd, path);
	const node = resolvePath(context.fs, context.cwd, path);

	if (!node) {
		return {
			output: [
				{
					type: 'error',
					content: `ls: cannot access '${path}': No such file or directory`
				}
			]
		};
	}

	if (node.type === 'file') {
		// ls on a file just shows the file
		return {
			output: [
				{
					type: 'file',
					content: node.name
				}
			]
		};
	}

	const entries = listDirectory(node);

	if (entries.length === 0) {
		return {
			output: [
				{
					type: 'text',
					content: '(empty directory)'
				}
			]
		};
	}

	const output: OutputLine[] = entries.map((entry) => ({
		type: entry.type === 'directory' ? 'directory' : 'file',
		content: entry.type === 'directory' ? `${entry.name}/` : entry.name
	}));

	return { output };
});

// Also register 'll' as an alias
registerCommand('ll', (args, context) => {
	const path = args[0] || '.';
	const node = resolvePath(context.fs, context.cwd, path);

	if (!node) {
		return {
			output: [
				{
					type: 'error',
					content: `ll: cannot access '${path}': No such file or directory`
				}
			]
		};
	}

	if (node.type === 'file') {
		const meta = node.metadata;
		return {
			output: [
				{
					type: 'file',
					content: `${node.name}  ${meta?.date || ''}`
				}
			]
		};
	}

	const entries = listDirectory(node);

	if (entries.length === 0) {
		return {
			output: [
				{
					type: 'text',
					content: '(empty directory)'
				}
			]
		};
	}

	const output: OutputLine[] = entries.map((entry) => {
		if (entry.type === 'directory') {
			return {
				type: 'directory',
				content: `drwxr-xr-x  ${entry.name}/`
			};
		}

		// Get metadata for files
		const fileNode = node.children?.get(entry.name);
		const date = fileNode?.metadata?.date || '';
		return {
			type: 'file',
			content: `-rw-r--r--  ${date}  ${entry.name}`
		};
	});

	return { output };
});
