import { registerCommand } from './index';
import { resolvePath, getAbsolutePath } from '../filesystem';

registerCommand('cd', (args, context) => {
	const path = args[0] || '~';

	if (path === '~') {
		return {
			output: [],
			newCwd: '~'
		};
	}

	const targetPath = getAbsolutePath(context.cwd, path);
	const node = resolvePath(context.fs, context.cwd, path);

	if (!node) {
		return {
			output: [
				{
					type: 'error',
					content: `cd: no such file or directory: ${path}`
				}
			]
		};
	}

	if (node.type !== 'directory') {
		return {
			output: [
				{
					type: 'error',
					content: `cd: not a directory: ${path}`
				}
			]
		};
	}

	// Calculate the new absolute path
	let newCwd: string;
	if (path === '..') {
		const parts = context.cwd.split('/').filter(Boolean);
		if (parts.length <= 1) {
			newCwd = '~';
		} else {
			newCwd = parts.slice(0, -1).join('/');
			if (!newCwd.startsWith('~')) {
				newCwd = '~/' + newCwd;
			}
		}
	} else if (path.startsWith('~')) {
		newCwd = path;
	} else if (path === '.') {
		newCwd = context.cwd;
	} else {
		newCwd = context.cwd === '~' ? `~/${path}` : `${context.cwd}/${path}`;
	}

	return {
		output: [],
		newCwd
	};
});
