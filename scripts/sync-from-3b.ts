/**
 * Sync content from 3B knowledge base to blog
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-env scripts/sync-from-3b.ts
 *   deno run --allow-read --allow-env scripts/sync-from-3b.ts --check
 *   deno run --allow-read --allow-write --allow-env --allow-run scripts/sync-from-3b.ts --diff --slug=<slug>
 *
 * Modes:
 *   (default)  Sync new + unexpanded posts. Never overwrites expanded posts.
 *   --check    Report hash mismatches for expanded posts (read-only).
 *   --diff     Show unified diff for a specific post (requires --slug=<slug>).
 *   --dry-run  Preview what would sync without writing.
 *   --verbose  Show skip reasons for each file.
 *
 * This script:
 * 1. Reads markdown files from 3B knowledge directory
 * 2. Filters for blog-ready entries (publishable: true, ready: true)
 * 3. Transforms frontmatter to blog format
 * 4. Protects expanded posts from overwrite (hash guard)
 * 5. Copies to src/content/posts/
 * 6. Updates source file with sync timestamps
 */

import { walk } from 'https://deno.land/std@0.220.0/fs/walk.ts';
import { ensureDir } from 'https://deno.land/std@0.220.0/fs/ensure_dir.ts';
import {
	parse as parseYaml,
	stringify as stringifyYaml,
} from 'https://deno.land/std@0.220.0/yaml/mod.ts';
import { basename, dirname, join } from 'https://deno.land/std@0.220.0/path/mod.ts';

// Configuration — all paths absolute so script works from any directory
const HOME = Deno.env.get('HOME')!;
const SOURCE_DIR = join(HOME, 'dev', 'personal', '3b', 'knowledge');
const BLOG_ROOT = Deno.env.get('BLOG_ROOT') || join(HOME, 'dev', 'personal', 'brandonwie.dev');
const TARGET_DIR = join(BLOG_ROOT, 'src', 'content', 'posts', 'en');
const EXCLUDED_CATEGORIES = ['moba']; // Company-specific content (backup filter)

// ============================================================================
// Types
// ============================================================================

interface BlogMeta {
	publishable: boolean | 'review';
	ready: boolean;
	published_at: string | null;
	last_synced: string | null;
	needs_resync?: boolean;
	exclude_reason: string | null;
}

interface Reference {
	url: string;
	type: 'official' | 'authoritative' | 'verified' | 'experience';
	title: string;
	verified_date?: string;
	notes?: string;
	author?: string;
}

interface SourceFrontmatter {
	tags: string[];
	created: string;
	updated: string;
	status: 'not-started' | 'in-progress' | 'completed';
	source?: string;
	projects?: string[];
	related?: { path: string; context: string }[];
	when_used?: { date: string; project: string; context: string }[];
	blog?: BlogMeta;
	references?: Reference[];
}

interface TargetFrontmatter {
	title: string;
	description: string;
	date: string;
	updated: string;
	tags: string[];
	category: string;
	draft: boolean;
	lang: string;
	references?: { url: string; title: string; type: string }[];
	// Hash guard fields — protect expanded posts from sync overwrite
	expanded?: boolean; // true after blog narrative expansion
	source_content_hash?: string; // SHA-256 of cleaned 3B body at last sync
}

// ============================================================================
// Helpers
// ============================================================================

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
		if (
			foundHeading &&
			line.trim() &&
			!line.startsWith('#') &&
			!line.startsWith('```') &&
			!line.startsWith('>') &&
			!line.startsWith('-')
		) {
			description = line.trim();
			break;
		}
	}

	// Truncate to 160 chars for SEO (word-boundary aware)
	if (description.length > 160) {
		const boundary = description.lastIndexOf(' ', 157);
		description = description.substring(0, boundary > 0 ? boundary : 157) + '...';
	}

	return description || 'No description available';
}

function parseFrontmatter(content: string): {
	frontmatter: SourceFrontmatter | null;
	body: string;
	rawFrontmatter: string;
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) {
		return { frontmatter: null, body: content, rawFrontmatter: '' };
	}

	try {
		const frontmatter = parseYaml(match[1]) as SourceFrontmatter;
		return { frontmatter, body: match[2], rawFrontmatter: match[1] };
	} catch {
		return { frontmatter: null, body: content, rawFrontmatter: '' };
	}
}

/**
 * Check if a file should be synced based on blog metadata
 */
function shouldSync(
	frontmatter: SourceFrontmatter,
	category: string,
): { sync: boolean; reason: string } {
	// Backup filter: excluded categories
	if (EXCLUDED_CATEGORIES.includes(category)) {
		return { sync: false, reason: 'excluded category' };
	}

	// Must have blog metadata (new schema)
	if (!frontmatter.blog) {
		return { sync: false, reason: 'no blog metadata (legacy file)' };
	}

	// Must be publishable (not false or "review")
	if (frontmatter.blog.publishable !== true) {
		const reason =
			frontmatter.blog.exclude_reason ||
			(frontmatter.blog.publishable === 'review' ? 'needs review' : 'not publishable');
		return { sync: false, reason };
	}

	// Must be ready for publication
	if (!frontmatter.blog.ready) {
		return { sync: false, reason: 'not ready (blog.ready: false)' };
	}

	// Must have at least one reference
	if (!frontmatter.references || frontmatter.references.length === 0) {
		return { sync: false, reason: 'no references' };
	}

	// Must have at least one official or authoritative reference
	const hasCredibleRef = frontmatter.references.some(
		(ref) => ref.type === 'official' || ref.type === 'authoritative',
	);
	if (!hasCredibleRef) {
		return { sync: false, reason: 'no official/authoritative reference' };
	}

	// Status check (should be completed)
	if (frontmatter.status !== 'completed') {
		return { sync: false, reason: 'not completed' };
	}

	return { sync: true, reason: 'ok' };
}

function transformFrontmatter(
	source: SourceFrontmatter,
	body: string,
	category: string,
): TargetFrontmatter {
	const target: TargetFrontmatter = {
		title: extractTitle(body),
		description: extractDescription(body),
		date: source.created,
		updated: source.updated,
		tags: source.tags,
		category,
		draft: source.status !== 'completed',
		lang: 'en',
	};

	// Include simplified references for blog
	if (source.references && source.references.length > 0) {
		target.references = source.references.map((ref) => ({
			url: ref.url ?? null,
			title: ref.title ?? '',
			type: ref.type ?? 'experience',
		}));
	}

	return target;
}

/**
 * Clean the markdown body for blog publication.
 *
 * IMPORTANT: Remove H1 title and first paragraph (description) from body.
 *
 * WHY: The blog page layout (src/routes/posts/[slug]/+page.svelte) renders
 * both `data.meta.title` as <h1> and `data.meta.description` as <p> from
 * frontmatter. If we keep these in the body, they appear twice on the page.
 *
 * The sync process:
 * 1. extractTitle() → pulls H1 from body → stores in frontmatter.title
 * 2. extractDescription() → pulls first paragraph → stores in frontmatter.description
 * 3. cleanBody() → removes both from body to prevent duplication
 *
 * Page layout renders: frontmatter.title + frontmatter.description + body
 * So body should start with the first ## section, not # title.
 */
function cleanBody(body: string): string {
	let cleaned = body;

	// Remove H1 title (already extracted to frontmatter.title)
	// The page layout renders frontmatter.title as <h1>, so body shouldn't have it
	cleaned = cleaned.replace(/^#\s+.+\n+/, '');

	// Remove the first paragraph after H1 (already used as description in frontmatter)
	// Match: first non-empty line that's not a heading, code block, quote, or list
	const lines = cleaned.split('\n');
	let foundFirstParagraph = false;
	const filteredLines: string[] = [];

	for (const line of lines) {
		// Skip empty lines at the start
		if (!foundFirstParagraph && line.trim() === '') {
			continue;
		}

		// Skip the first paragraph line (description)
		if (
			!foundFirstParagraph &&
			line.trim() &&
			!line.startsWith('#') &&
			!line.startsWith('```') &&
			!line.startsWith('>') &&
			!line.startsWith('-') &&
			!line.startsWith('---')
		) {
			foundFirstParagraph = true;
			continue; // Skip this line (it's the description)
		}

		// Keep everything else
		if (foundFirstParagraph || line.trim() === '') {
			filteredLines.push(line);
		}
	}

	cleaned = filteredLines.join('\n');

	// Remove related sections (handled by frontmatter)
	cleaned = cleaned.replace(/##\s*Related[\s\S]*?(?=##|$)/gi, '');

	// Remove when_used sections
	cleaned = cleaned.replace(/##\s*When This Came Up[\s\S]*?(?=##|$)/gi, '');

	// Remove horizontal rules at the start (often after title/description)
	cleaned = cleaned.replace(/^[\s\n]*---[\s\n]+/, '');

	// Clean up multiple blank lines
	cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

	return cleaned.trim();
}

/**
 * Compute SHA-256 hash of the cleaned 3B body content.
 *
 * Hashes the CLEANED body (after cleanBody() processing), not the raw source.
 * Changes to sections stripped by cleanBody() (Related, When This Came Up)
 * won't produce false-positive mismatches.
 *
 * NOTE: If cleanBody() logic changes, all stored hashes become invalid.
 * Re-run `npm run sync` to refresh hashes for non-expanded posts.
 */
async function computeContentHash(cleanedBody: string): Promise<string> {
	const data = new TextEncoder().encode(cleanedBody);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Read existing blog post and parse its frontmatter.
 * Returns null if the file doesn't exist.
 */
async function readExistingPost(targetPath: string): Promise<{
	frontmatter: TargetFrontmatter | null;
	body: string;
} | null> {
	try {
		const raw = await Deno.readTextFile(targetPath);
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) return { frontmatter: null, body: raw };
		const frontmatter = parseYaml(match[1]) as TargetFrontmatter;
		return { frontmatter, body: match[2] };
	} catch {
		return null; // File doesn't exist
	}
}

/**
 * Update source file with sync timestamps
 */
async function updateSourceFile(
	sourcePath: string,
	content: string,
	frontmatter: SourceFrontmatter,
	isFirstSync: boolean,
): Promise<void> {
	const today = new Date().toISOString().split('T')[0];

	// Update blog metadata
	if (frontmatter.blog) {
		frontmatter.blog.last_synced = today;
		if (isFirstSync) {
			frontmatter.blog.published_at = today;
		}
		// Clear resync flag after successful sync
		frontmatter.blog.needs_resync = false;
	}

	// Reconstruct file content
	const { body } = parseFrontmatter(content);
	const newFrontmatter = stringifyYaml(frontmatter);
	const newContent = `---\n${newFrontmatter}---\n${body}`;

	await Deno.writeTextFile(sourcePath, newContent);
}

// ============================================================================
// Main
// ============================================================================

/**
 * --diff mode: show unified diff for a specific post
 */
async function diffPost(slug: string, _verbose: boolean) {
	console.log(`🔍 Finding source for: ${slug}`);
	console.log('');

	let found = false;

	for await (const entry of walk(SOURCE_DIR, {
		exts: ['.md'],
		includeDirs: false,
	})) {
		if (basename(entry.path, '.md') !== slug) continue;
		found = true;

		const relativePath = entry.path.replace(SOURCE_DIR + '/', '');
		const category = dirname(relativePath).split('/')[0];
		const content = await Deno.readTextFile(entry.path);
		const { frontmatter, body } = parseFrontmatter(content);

		if (!frontmatter) {
			console.error(`Error: No frontmatter in ${entry.path}`);
			Deno.exit(1);
		}

		const cleanedBody = cleanBody(body);
		const targetPath = join(TARGET_DIR, category, `${slug}.md`);
		const existing = await readExistingPost(targetPath);

		if (!existing) {
			console.log(`Post not found in blog: ${targetPath}`);
			console.log("This post hasn't been synced yet.");
			Deno.exit(0);
		}

		const currentHash = existing.frontmatter?.source_content_hash || '(none)';
		const incomingHash = await computeContentHash(cleanedBody);

		console.log(`📄 Diff for: ${slug}`);
		console.log(`   Source:   ${entry.path}`);
		console.log(`   Target:   ${targetPath}`);
		console.log(`   Expanded: ${existing.frontmatter?.expanded || false}`);
		console.log(`   Hash:     ${currentHash === incomingHash ? '✅ match' : '⚠️  mismatch'}`);
		console.log('');

		// Use system diff via temp files
		const tempOld = await Deno.makeTempFile({ suffix: '-current.md' });
		const tempNew = await Deno.makeTempFile({ suffix: '-incoming.md' });
		await Deno.writeTextFile(tempOld, existing.body.trim());
		await Deno.writeTextFile(tempNew, cleanedBody.trim());

		try {
			const diffCmd = new Deno.Command('diff', {
				args: ['--unified=3', '--label=current (blog)', '--label=incoming (3B)', tempOld, tempNew],
				stdout: 'piped',
				stderr: 'piped',
			});
			const diffOutput = await diffCmd.output();
			const diffText = new TextDecoder().decode(diffOutput.stdout);

			if (diffText) {
				console.log(diffText);
			} else {
				console.log('No content differences found.');
			}
		} finally {
			await Deno.remove(tempOld);
			await Deno.remove(tempNew);
		}

		break;
	}

	if (!found) {
		console.error(`Source file not found for slug: ${slug}`);
		Deno.exit(1);
	}
}

async function syncPosts() {
	const args = Deno.args;
	const dryRun = args.includes('--dry-run');
	const verbose = args.includes('--verbose');
	const checkOnly = args.includes('--check');
	const diffMode = args.includes('--diff');
	const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1];

	// --diff mode: early exit to dedicated function
	if (diffMode) {
		if (!slugArg) {
			console.error('Error: --diff requires --slug=<slug>');
			console.error('Usage: npm run sync:diff -- --slug=redis-queue-patterns');
			Deno.exit(1);
		}
		await diffPost(slugArg, verbose);
		return;
	}

	// Determine mode label
	const modeLabel = checkOnly ? 'HASH CHECK' : dryRun ? 'DRY RUN' : 'APPLY';

	console.log('🔄 Syncing posts from 3B knowledge base...');
	console.log(`   Mode: ${modeLabel}`);
	console.log('');

	let synced = 0;
	let skipped = 0;
	let expandedChecked = 0;
	const skipReasons: Record<string, number> = {};
	const hashMismatches: {
		path: string;
		slug: string;
		oldHash: string;
		newHash: string;
	}[] = [];

	for await (const entry of walk(SOURCE_DIR, {
		exts: ['.md'],
		includeDirs: false,
	})) {
		const relativePath = entry.path.replace(SOURCE_DIR + '/', '');
		const category = dirname(relativePath).split('/')[0];

		// Skip index files
		if (basename(entry.path).startsWith('_')) {
			continue;
		}

		const content = await Deno.readTextFile(entry.path);
		const { frontmatter, body } = parseFrontmatter(content);

		// Skip if no frontmatter
		if (!frontmatter) {
			if (verbose) console.log(`⏭️  Skipping (no frontmatter): ${relativePath}`);
			skipReasons['no frontmatter'] = (skipReasons['no frontmatter'] || 0) + 1;
			skipped++;
			continue;
		}

		// Check if should sync
		const { sync, reason } = shouldSync(frontmatter, category);
		if (!sync) {
			if (verbose) console.log(`⏭️  Skipping (${reason}): ${relativePath}`);
			skipReasons[reason] = (skipReasons[reason] || 0) + 1;
			skipped++;
			continue;
		}

		// Transform and compute hash
		const targetFrontmatter = transformFrontmatter(frontmatter, body, category);
		const cleanedBody = cleanBody(body);
		const contentHash = await computeContentHash(cleanedBody);
		const targetPath = join(TARGET_DIR, category, basename(entry.path));
		const slug = basename(entry.path, '.md');

		// Check if target already exists
		const existing = await readExistingPost(targetPath);

		// --- EXPANDED POST PROTECTION ---
		if (existing?.frontmatter?.expanded === true) {
			expandedChecked++;
			const oldHash = existing.frontmatter.source_content_hash;
			const hashChanged = oldHash !== contentHash;

			if (checkOnly) {
				// --check mode: report status, never write
				if (hashChanged) {
					hashMismatches.push({
						path: relativePath,
						slug,
						oldHash: oldHash || '(none)',
						newHash: contentHash,
					});
					console.log(`⚠️  HASH MISMATCH: ${relativePath} (expanded, upstream changed)`);
				} else if (verbose) {
					console.log(`✅ Hash match: ${relativePath} (expanded, no changes)`);
				}
			} else if (dryRun) {
				if (hashChanged) {
					console.log(`🔒 Would skip (expanded, upstream changed): ${relativePath}`);
				} else if (verbose) {
					console.log(`🔒 Would skip (expanded): ${relativePath}`);
				}
			} else {
				// Normal sync: skip expanded posts, always
				if (hashChanged) {
					console.log(`🔒 Skipping (expanded, upstream changed): ${relativePath}`);
					console.log(`   Run: npm run sync:diff -- --slug=${slug}`);
				} else if (verbose) {
					console.log(`🔒 Skipping (expanded): ${relativePath}`);
				}
			}

			skipReasons['expanded post (protected)'] =
				(skipReasons['expanded post (protected)'] || 0) + 1;
			skipped++;
			continue; // Never overwrite expanded posts
		}
		// --- END EXPANDED POST PROTECTION ---

		// In --check mode, only expanded posts matter — skip the rest
		if (checkOnly) {
			continue;
		}

		// For non-expanded posts: include hash in frontmatter
		targetFrontmatter.source_content_hash = contentHash;

		const targetContent = `---
${stringifyYaml(targetFrontmatter)}---

${cleanedBody}
`;

		if (dryRun) {
			console.log(`✅ Would sync: ${relativePath} → ${targetPath}`);
		} else {
			await ensureDir(dirname(targetPath));
			await Deno.writeTextFile(targetPath, targetContent);

			// Update source file with sync timestamps
			const isFirstSync = !frontmatter.blog?.published_at;
			await updateSourceFile(entry.path, content, frontmatter, isFirstSync);

			console.log(`✅ Synced: ${relativePath}`);
		}
		synced++;
	}

	// --- SUMMARY ---
	console.log('');

	if (checkOnly) {
		// Hash Guard Report
		console.log('📋 Hash Guard Report');
		console.log(`   Expanded posts checked: ${expandedChecked}`);
		console.log(`   Hash matches: ${expandedChecked - hashMismatches.length}`);
		console.log(`   Hash mismatches: ${hashMismatches.length}`);

		if (hashMismatches.length > 0) {
			console.log('');
			console.log('⚠️  Posts with upstream changes:');
			for (const m of hashMismatches) {
				console.log(`   - ${m.path}`);
				console.log(`     Old: ${m.oldHash.substring(0, 16)}...`);
				console.log(`     New: ${m.newHash.substring(0, 16)}...`);
				console.log(`     Run: npm run sync:diff -- --slug=${m.slug}`);
			}
		}

		Deno.exit(hashMismatches.length > 0 ? 1 : 0);
	}

	console.log('📊 Summary');
	console.log(`   Synced: ${synced}`);
	console.log(`   Skipped: ${skipped}`);

	if (Object.keys(skipReasons).length > 0) {
		console.log('');
		console.log('   Skip reasons:');
		for (const [reason, count] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
			console.log(`     - ${reason}: ${count}`);
		}
	}

	if (dryRun && synced > 0) {
		console.log('');
		console.log('Run without --dry-run to apply changes');
	}
}

// Run
await syncPosts();
