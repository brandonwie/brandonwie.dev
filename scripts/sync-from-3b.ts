/**
 * Sync content from 3B knowledge base to blog
 *
 * Usage: deno run --allow-read --allow-write scripts/sync-from-3b.ts
 *
 * This script:
 * 1. Reads markdown files from 3B knowledge directory
 * 2. Filters for completed, non-moba entries
 * 3. Transforms frontmatter to blog format
 * 4. Copies to src/content/posts/
 */

import { walk } from 'https://deno.land/std@0.220.0/fs/walk.ts';
import { ensureDir } from 'https://deno.land/std@0.220.0/fs/ensure_dir.ts';
import { parse as parseYaml, stringify as stringifyYaml } from 'https://deno.land/std@0.220.0/yaml/mod.ts';
import { basename, dirname, join } from 'https://deno.land/std@0.220.0/path/mod.ts';

// Configuration
const SOURCE_DIR = Deno.env.get('HOME') + '/dev/personal/3b/knowledge';
const TARGET_DIR = './src/content/posts';
const EXCLUDED_CATEGORIES = ['moba']; // Company-specific content

interface SourceFrontmatter {
	tags: string[];
	created: string;
	updated: string;
	status: 'not-started' | 'in-progress' | 'completed';
	source?: string;
	projects?: string[];
	related?: { path: string; context: string }[];
	when_used?: { date: string; project: string; context: string }[];
}

interface TargetFrontmatter {
	title: string;
	description: string;
	date: string;
	updated: string;
	tags: string[];
	category: string;
	draft: boolean;
}

function extractTitle(content: string): string {
	// Find first H1 heading
	const match = content.match(/^#\s+(.+)$/m);
	if (match) {
		return match[1].trim();
	}
	return 'Untitled';
}

function extractDescription(content: string): string {
	// Find first paragraph after frontmatter and H1
	const lines = content.split('\n');
	let foundHeading = false;
	let description = '';

	for (const line of lines) {
		if (line.startsWith('# ')) {
			foundHeading = true;
			continue;
		}
		if (foundHeading && line.trim() && !line.startsWith('#') && !line.startsWith('```')) {
			description = line.trim();
			break;
		}
	}

	// Truncate to 160 chars for SEO
	if (description.length > 160) {
		description = description.substring(0, 157) + '...';
	}

	return description || 'No description available';
}

function parseFrontmatter(content: string): { frontmatter: SourceFrontmatter | null; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) {
		return { frontmatter: null, body: content };
	}

	try {
		const frontmatter = parseYaml(match[1]) as SourceFrontmatter;
		return { frontmatter, body: match[2] };
	} catch {
		return { frontmatter: null, body: content };
	}
}

function transformFrontmatter(
	source: SourceFrontmatter,
	body: string,
	category: string
): TargetFrontmatter {
	return {
		title: extractTitle(body),
		description: extractDescription(body),
		date: source.created,
		updated: source.updated,
		tags: source.tags,
		category,
		draft: source.status !== 'completed'
	};
}

function cleanBody(body: string): string {
	// Remove 3B-specific sections
	let cleaned = body;

	// Remove related sections (handled by frontmatter)
	cleaned = cleaned.replace(/##\s*Related[\s\S]*?(?=##|$)/gi, '');

	// Remove when_used sections
	cleaned = cleaned.replace(/##\s*When This Came Up[\s\S]*?(?=##|$)/gi, '');

	// Clean up multiple blank lines
	cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

	return cleaned.trim();
}

async function syncPosts() {
	console.log('🔄 Syncing posts from 3B knowledge base...\n');

	let synced = 0;
	let skipped = 0;

	for await (const entry of walk(SOURCE_DIR, {
		exts: ['.md'],
		includeDirs: false
	})) {
		const relativePath = entry.path.replace(SOURCE_DIR + '/', '');
		const category = dirname(relativePath).split('/')[0];

		// Skip excluded categories
		if (EXCLUDED_CATEGORIES.includes(category)) {
			skipped++;
			continue;
		}

		// Skip index files
		if (basename(entry.path).startsWith('_')) {
			continue;
		}

		const content = await Deno.readTextFile(entry.path);
		const { frontmatter, body } = parseFrontmatter(content);

		// Skip if no frontmatter or not completed
		if (!frontmatter) {
			console.log(`⏭️  Skipping (no frontmatter): ${relativePath}`);
			skipped++;
			continue;
		}

		if (frontmatter.status !== 'completed') {
			console.log(`⏭️  Skipping (not completed): ${relativePath}`);
			skipped++;
			continue;
		}

		// Transform and write
		const targetFrontmatter = transformFrontmatter(frontmatter, body, category);
		const cleanedBody = cleanBody(body);

		const targetContent = `---
${stringifyYaml(targetFrontmatter)}---

${cleanedBody}
`;

		const targetPath = join(TARGET_DIR, category, basename(entry.path));
		await ensureDir(dirname(targetPath));
		await Deno.writeTextFile(targetPath, targetContent);

		console.log(`✅ Synced: ${relativePath}`);
		synced++;
	}

	console.log(`\n📊 Summary: ${synced} synced, ${skipped} skipped`);
}

// Run
await syncPosts();
