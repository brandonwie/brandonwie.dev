import { registerCommand } from './index';
import { resolvePath, getAbsolutePath } from '../filesystem';

registerCommand('cat', (args, context) => {
	if (args.length === 0) {
		return {
			output: [
				{
					type: 'error',
					content: 'cat: missing file operand'
				}
			]
		};
	}

	const path = args[0];
	const node = resolvePath(context.fs, context.cwd, path);

	if (!node) {
		return {
			output: [
				{
					type: 'error',
					content: `cat: ${path}: No such file or directory`
				}
			]
		};
	}

	if (node.type === 'directory') {
		return {
			output: [
				{
					type: 'error',
					content: `cat: ${path}: Is a directory`
				}
			]
		};
	}

	// If it's a post file, navigate to it
	if (node.metadata) {
		context.navigateToPost(node.metadata.slug);
		return {
			output: [
				{
					type: 'success',
					content: `Opening ${node.metadata.title}...`
				}
			]
		};
	}

	return {
		output: [
			{
				type: 'text',
				content: `(file content for ${node.name})`
			}
		]
	};
});

// Also register 'read' as an alias
registerCommand('read', (args, context) => {
	if (args.length === 0) {
		return {
			output: [
				{
					type: 'error',
					content: 'read: missing file operand'
				}
			]
		};
	}

	const path = args[0];
	const node = resolvePath(context.fs, context.cwd, path);

	if (!node) {
		return {
			output: [
				{
					type: 'error',
					content: `read: ${path}: No such file or directory`
				}
			]
		};
	}

	if (node.type === 'directory') {
		return {
			output: [
				{
					type: 'error',
					content: `read: ${path}: Is a directory`
				}
			]
		};
	}

	if (node.metadata) {
		context.navigateToPost(node.metadata.slug);
		return {
			output: [
				{
					type: 'success',
					content: `Opening ${node.metadata.title}...`
				}
			]
		};
	}

	return { output: [] };
});
