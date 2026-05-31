import type { PostMetadata } from './stores/posts';

export type FSNodeType = 'directory' | 'file';

export interface FSNode {
	name: string;
	type: FSNodeType;
	children?: Map<string, FSNode>;
	metadata?: PostMetadata;
}

// Build virtual filesystem from posts
export function buildFileSystem(posts: PostMetadata[]): FSNode {
	const root: FSNode = {
		name: '~',
		type: 'directory',
		children: new Map(),
	};

	// Add static directories
	root.children!.set('about', {
		name: 'about',
		type: 'directory',
		children: new Map(),
	});

	root.children!.set('projects', {
		name: 'projects',
		type: 'directory',
		children: new Map(),
	});

	root.children!.set('system', {
		name: 'system',
		type: 'directory',
		children: new Map([
			[
				'3b',
				{
					name: '3b',
					type: 'directory',
					children: new Map(),
				},
			],
		]),
	});

	// Add posts directory
	const postsDir: FSNode = {
		name: 'posts',
		type: 'directory',
		children: new Map(),
	};
	root.children!.set('posts', postsDir);

	// Group posts by category
	for (const post of posts) {
		// Ensure category directory exists
		if (!postsDir.children!.has(post.category)) {
			postsDir.children!.set(post.category, {
				name: post.category,
				type: 'directory',
				children: new Map(),
			});
		}

		const categoryDir = postsDir.children!.get(post.category)!;

		// Add post file
		categoryDir.children!.set(`${post.slug}.md`, {
			name: `${post.slug}.md`,
			type: 'file',
			metadata: post,
		});
	}

	return root;
}

// Resolve path to node
export function resolvePath(root: FSNode, cwd: string, path: string): FSNode | null {
	// Normalize path
	let targetPath = path;

	if (path === '~' || path === '') {
		targetPath = '~';
	} else if (path === '..') {
		// Go up one level
		const parts = cwd.split('/').filter(Boolean);
		if (parts.length > 1) {
			targetPath = parts.slice(0, -1).join('/');
		} else {
			targetPath = '~';
		}
	} else if (path === '.') {
		targetPath = cwd;
	} else if (!path.startsWith('~') && !path.startsWith('/')) {
		// Relative path
		targetPath = cwd === '~' ? `~/${path}` : `${cwd}/${path}`;
	}

	// Handle ~ prefix
	if (targetPath.startsWith('~/')) {
		targetPath = targetPath.slice(2);
	} else if (targetPath === '~') {
		return root;
	}

	// Traverse path
	const parts = targetPath.split('/').filter(Boolean);
	let current = root;

	for (const part of parts) {
		if (part === '..') {
			// This shouldn't happen after normalization, but handle it
			continue;
		}
		if (current.type !== 'directory' || !current.children) {
			return null;
		}
		const next = current.children.get(part);
		if (!next) {
			return null;
		}
		current = next;
	}

	return current;
}

// Get absolute path string from traversal
export function getAbsolutePath(cwd: string, relativePath: string): string {
	if (relativePath === '~') return '~';
	if (relativePath.startsWith('~/')) return relativePath;
	if (relativePath === '..') {
		const parts = cwd.split('/').filter(Boolean);
		if (parts.length <= 1) return '~';
		return parts.slice(0, -1).join('/');
	}
	if (relativePath === '.') return cwd;

	return cwd === '~' ? `~/${relativePath}` : `${cwd}/${relativePath}`;
}

// List directory contents
export function listDirectory(node: FSNode): { name: string; type: FSNodeType }[] {
	if (node.type !== 'directory' || !node.children) {
		return [];
	}

	const entries: { name: string; type: FSNodeType }[] = [];

	for (const [name, child] of node.children) {
		entries.push({ name, type: child.type });
	}

	// Sort: directories first, then files, alphabetically within each group
	return entries.sort((a, b) => {
		if (a.type === b.type) {
			return a.name.localeCompare(b.name);
		}
		return a.type === 'directory' ? -1 : 1;
	});
}

// Get all files recursively (for search)
export function getAllFiles(root: FSNode, basePath: string = ''): { path: string; node: FSNode }[] {
	const files: { path: string; node: FSNode }[] = [];

	function traverse(node: FSNode, currentPath: string) {
		if (node.type === 'file') {
			files.push({ path: currentPath, node });
		} else if (node.children) {
			for (const [name, child] of node.children) {
				const childPath = currentPath ? `${currentPath}/${name}` : name;
				traverse(child, childPath);
			}
		}
	}

	traverse(root, basePath);
	return files;
}
