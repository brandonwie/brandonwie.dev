import { registerCommand } from './index';
import type { OutputLine } from '../stores/terminal';

registerCommand('grep', (args, context) => {
	if (args.length === 0) {
		return {
			output: [
				{
					type: 'error',
					content: 'grep: missing pattern',
				},
				{
					type: 'text',
					content: 'Usage: grep <pattern>',
				},
			],
		};
	}

	const pattern = args[0].toLowerCase();
	const matches: { post: (typeof context.posts)[0]; matchedIn: string[] }[] = [];

	for (const post of context.posts) {
		const matchedIn: string[] = [];

		if (post.title.toLowerCase().includes(pattern)) {
			matchedIn.push('title');
		}
		if (post.description.toLowerCase().includes(pattern)) {
			matchedIn.push('description');
		}
		if (post.tags.some((tag) => tag.toLowerCase().includes(pattern))) {
			matchedIn.push('tags');
		}
		if (post.category.toLowerCase().includes(pattern)) {
			matchedIn.push('category');
		}

		if (matchedIn.length > 0) {
			matches.push({ post, matchedIn });
		}
	}

	if (matches.length === 0) {
		return {
			output: [
				{
					type: 'text',
					content: `No matches found for "${pattern}"`,
				},
			],
		};
	}

	const output: OutputLine[] = [
		{
			type: 'success',
			content: `Found ${matches.length} match${matches.length === 1 ? '' : 'es'}:`,
		},
	];

	for (const match of matches) {
		output.push({
			type: 'file',
			content: `  posts/${match.post.category}/${match.post.slug}.md`,
			link: `/posts/${match.post.slug}`,
		});
		output.push({
			type: 'text',
			content: `    └─ ${match.matchedIn.join(', ')}: ${match.post.title}`,
		});
	}

	return { output };
});

// Also register 'search' and 'find' as aliases
registerCommand('search', (args, context) => {
	if (args.length === 0) {
		context.openFuzzyFinder();
		return {
			output: [
				{
					type: 'text',
					content: 'Opening fuzzy finder...',
				},
			],
		};
	}

	// Delegate to grep
	const pattern = args[0].toLowerCase();
	const matches = context.posts.filter(
		(post) =>
			post.title.toLowerCase().includes(pattern) ||
			post.description.toLowerCase().includes(pattern) ||
			post.tags.some((tag) => tag.toLowerCase().includes(pattern)),
	);

	if (matches.length === 0) {
		return {
			output: [
				{
					type: 'text',
					content: `No posts found matching "${pattern}"`,
				},
			],
		};
	}

	const output: OutputLine[] = [
		{
			type: 'success',
			content: `Found ${matches.length} post${matches.length === 1 ? '' : 's'}:`,
		},
	];

	for (const post of matches) {
		output.push({
			type: 'file',
			content: `  ${post.slug}.md - ${post.title}`,
			link: `/posts/${post.slug}`,
		});
	}

	return { output };
});

registerCommand('find', (args, context) => {
	if (args.length === 0) {
		return {
			output: [
				{
					type: 'error',
					content: 'find: missing filename pattern',
				},
				{
					type: 'text',
					content: 'Usage: find <pattern>',
				},
			],
		};
	}

	const pattern = args[0].toLowerCase();
	const matches = context.posts.filter((post) => post.slug.toLowerCase().includes(pattern));

	if (matches.length === 0) {
		return {
			output: [
				{
					type: 'text',
					content: `No files found matching "${pattern}"`,
				},
			],
		};
	}

	const output: OutputLine[] = [];
	for (const post of matches) {
		output.push({
			type: 'file',
			content: `./posts/${post.category}/${post.slug}.md`,
		});
	}

	return { output };
});
