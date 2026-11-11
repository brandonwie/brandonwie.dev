/**
 * Sync content from 3B knowledge base to blog
 *
 * Usage:
 *   deno run --allow-read --allow-write=src/content/posts --allow-env scripts/sync-from-3b.ts
 *   deno run --allow-read --allow-env scripts/sync-from-3b.ts --check
 *   deno run --allow-read --allow-write --allow-env --allow-run scripts/sync-from-3b.ts --diff --slug=<slug>
 *
 * Modes:
 *   (default)    Sync new + unexpanded posts. Never overwrites expanded posts.
 *   --check      Report hash mismatches for expanded posts (read-only).
 *   --diff       Show unified diff for a specific post (requires --slug=<slug>).
 *   --rehash     Re-baseline source_content_hash for --allow=<file> posts.
 *                Writes only to blog post frontmatter; never touches sources.
 *   --dry-run    Preview what would sync without writing.
 *   --verbose    Show skip reasons for each file.
 *   --allow-missing-terms  Write even when the G1 deny list (BLOG_AUDIT_TERMS,
 *                else <3B>/.agent-ssot/config/blog-audit-terms.json) is missing.
 *
 * One-way: this script only READS the 3B checkout. No mode writes a file under
 * the 3B root (brandonwie/brandonwie.dev#76). Publish state lives in this repo:
 *   - published     = a post file exists for the note's category and slug
 *   - needs resync  = the post's source_content_hash differs from the hash of
 *                     the current source note; `pnpm sync:check` lists these
 * Two guards keep a write inside the posts tree:
 *   1. writePost() checks the real destination before every post write: the
 *      real posts root must not overlap the 3B root, and no path component
 *      below the posts root, the post file included, may be a symlink.
 *   2. `pnpm sync` and `pnpm sync:rehash` grant write access to
 *      src/content/posts of the current directory only. Deno checks the
 *      pathname and follows symlinks, so this grant alone does not stop a
 *      write through a symlink; guard 1 does.
 * Run them from the checkout that BLOG_ROOT names (in a worktree:
 * BLOG_ROOT="$PWD").
 *
 * G1 gate: every post is audited (scripts/lib/g1.ts) before any write. A post
 * with a finding is not written; exit code 1.
 * The default mode, --dry-run and --check load the deny list; a malformed list
 * (bad JSON, or a section without its string array) fails all three. A missing
 * list stops a writing run unless --allow-missing-terms; --dry-run and --check
 * continue without it, and a dry run then previews STRUCTURAL G1 checks only
 * (no employer or identifier detection). --diff and --rehash do not load the
 * list and do not run the G1 gate.
 *
 * This script:
 * 1. Reads markdown files from 3B knowledge directory
 * 2. Filters for blog-ready entries (publishable: true, ready: true)
 * 3. Transforms frontmatter to blog format
 * 4. Protects expanded posts from overwrite (hash guard)
 * 5. Copies to src/content/posts/
 */

import { walk } from 'https://deno.land/std@0.220.0/fs/walk.ts';
import { ensureDir } from 'https://deno.land/std@0.220.0/fs/ensure_dir.ts';
import {
	parse as parseYaml,
	stringify as stringifyYaml,
} from 'https://deno.land/std@0.220.0/yaml/mod.ts';
import { basename, dirname, join, relative } from 'https://deno.land/std@0.220.0/path/mod.ts';
import { auditG1, EMPTY_TERMS, parseTerms, type Terms } from './lib/g1.ts';

// Configuration — all paths absolute so script works from any directory
// Without HOME every default path below is meaningless, and join() would throw a
// TypeError that names neither variable. Fail on the real cause instead.
const HOME = Deno.env.get('HOME');
if (!HOME) {
	console.error(
		'Error: HOME is not set. Set B3_PATH and BLOG_ROOT to absolute paths, or run with HOME set.',
	);
	Deno.exit(1);
}
// 3B was renamed to B3 and its checkout is anchored at ~/.b3 (brandonwie/b3#941).
// Honor B3_PATH, then the legacy THREEB_PATH, then fall back to the first
// existing root: ~/.b3, then ~/dev/b3.
function resolveThreeBRoot(): string {
	const fromEnv = Deno.env.get('B3_PATH') || Deno.env.get('THREEB_PATH');
	if (fromEnv) return fromEnv;
	const candidates = [join(HOME, '.b3'), join(HOME, 'dev', 'b3')];
	for (const candidate of candidates) {
		try {
			if (Deno.statSync(candidate).isDirectory) return candidate;
		} catch {
			/* not this one */
		}
	}
	return candidates[0];
}
const THREEB_ROOT = resolveThreeBRoot();
const SOURCE_DIR = join(THREEB_ROOT, 'knowledge');
/**
 * The private G1 deny list, resolved like scripts/audit-posts.ts: BLOG_AUDIT_TERMS
 * wins, else the copy inside the 3B root this run reads from.
 */
const TERMS_PATH =
	Deno.env.get('BLOG_AUDIT_TERMS') ??
	join(THREEB_ROOT, '.agent-ssot', 'config', 'blog-audit-terms.json');
/**
 * The blog checkout this script writes into. BLOG_ROOT wins; the default is the
 * usual location. A default that no longer exists is the same class of bug as
 * the pre-move 3B path, so it is reported here rather than surfacing as a
 * confusing write into a directory nobody has.
 *
 * Deliberately asymmetric with resolveThreeBRoot(), which tries a second
 * candidate: 3B has actually moved and both locations are in use, so
 * auto-discovery earns its keep there. The blog has one known location, and
 * guessing a second would only delay a clear error. If it ever moves, set
 * BLOG_ROOT — the message names the path that was tried.
 */
function resolveBlogRoot(): string {
	const fromEnv = Deno.env.get('BLOG_ROOT');
	if (fromEnv) return fromEnv;
	const fallback = join(HOME, 'dev', 'personal', 'brandonwie.dev');
	try {
		if (Deno.statSync(fallback).isDirectory) return fallback;
	} catch {
		/* reported below */
	}
	console.error(
		`Error: BLOG_ROOT is not set and the default blog checkout does not exist: ${fallback}. Set BLOG_ROOT=/absolute/path/to/brandonwie.dev.`,
	);
	Deno.exit(1);
}
const BLOG_ROOT = resolveBlogRoot();
const POSTS_ROOT = join(BLOG_ROOT, 'src', 'content', 'posts');
const TARGET_DIR = join(POSTS_ROOT, 'en');
const EXCLUDED_CATEGORIES = ['moba']; // Company-specific content (backup filter)

// ============================================================================
// Types
// ============================================================================

// The note's publish intent. Older notes also carry published_at, last_synced
// and needs_resync; this script no longer reads or writes them.
interface BlogMeta {
	publishable: boolean | 'review';
	ready: boolean;
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
	// Blog-first marker (NON-TASK lane, /3b:blog-publish v3) — the post was
	// authored directly in this repo with no 3B source. Sync + --check skip
	// hash-compare entirely; Step 8.5 knowledge promotion removes this field
	// and retrofits expanded + source_content_hash.
	origin?: 'blog';
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

function isPlainParagraphLine(line: string): boolean {
	const trimmed = line.trim();
	return (
		trimmed.length > 0 &&
		!trimmed.startsWith('#') &&
		!trimmed.startsWith('```') &&
		!trimmed.startsWith('>') &&
		!trimmed.startsWith('-') &&
		!trimmed.startsWith('---')
	);
}

function extractFirstParagraphLines(content: string): string[] {
	// Find first full paragraph after frontmatter and H1
	const lines = content.split('\n');
	let foundHeading = false;
	let foundParagraph = false;
	const paragraph: string[] = [];

	for (const line of lines) {
		if (line.startsWith('# ')) {
			foundHeading = true;
			continue;
		}

		if (!foundHeading) continue;

		if (!foundParagraph) {
			if (!line.trim()) continue;
			if (!isPlainParagraphLine(line)) continue;
			foundParagraph = true;
			paragraph.push(line.trim());
			continue;
		}

		if (!line.trim() || !isPlainParagraphLine(line)) {
			break;
		}

		paragraph.push(line.trim());
	}

	return paragraph;
}

function stripWrappingMarkdownEmphasis(text: string): string {
	const trimmed = text.trim();
	const singleWrapped =
		(trimmed.startsWith('_') && trimmed.endsWith('_')) ||
		(trimmed.startsWith('*') && trimmed.endsWith('*'));
	const doubleWrapped =
		(trimmed.startsWith('__') && trimmed.endsWith('__')) ||
		(trimmed.startsWith('**') && trimmed.endsWith('**'));

	if (doubleWrapped) return trimmed.slice(2, -2).trim();
	if (singleWrapped) return trimmed.slice(1, -1).trim();
	return trimmed;
}

function extractDescription(content: string): string {
	let description = stripWrappingMarkdownEmphasis(extractFirstParagraphLines(content).join(' '));

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

/**
 * Tags that exist for internal filing in the knowledge base and must never ship.
 * `work` is the important one: the blog renders tags on cards and post pages, so
 * syncing it publicly labels a post as employer-derived content — a G1 leak the
 * prose-level generalization pass does not catch because it lives in metadata.
 */
const INTERNAL_ONLY_TAGS = new Set(['work', 'company', 'internal', 'private', 'confidential']);

function publishableTags(tags: string[] | undefined): string[] {
	return (tags ?? []).filter((tag) => !INTERNAL_ONLY_TAGS.has(tag.trim().toLowerCase()));
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
		tags: publishableTags(source.tags),
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
	let skippingFirstParagraph = false;
	const filteredLines: string[] = [];

	for (const line of lines) {
		// Skip empty lines at the start
		if (!foundFirstParagraph && line.trim() === '') {
			continue;
		}

		// Skip the whole first paragraph (description), including wrapped lines.
		if (!foundFirstParagraph && isPlainParagraphLine(line)) {
			foundFirstParagraph = true;
			skippingFirstParagraph = true;
			continue;
		}

		if (skippingFirstParagraph) {
			if (line.trim() === '') {
				skippingFirstParagraph = false;
				continue;
			}

			if (isPlainParagraphLine(line)) {
				continue;
			}

			skippingFirstParagraph = false;
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
 * Re-run `pnpm sync` to refresh hashes for non-expanded posts.
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
 * Read and validate the deny list. `loaded` is false only when the file is
 * absent; bad JSON or a malformed section throws (parseTerms), in every mode.
 */
async function loadTerms(): Promise<{ terms: Terms; loaded: boolean }> {
	let text: string;
	try {
		text = await Deno.readTextFile(TERMS_PATH);
	} catch (err) {
		if (err instanceof Deno.errors.NotFound) return { terms: EMPTY_TERMS, loaded: false };
		throw err;
	}
	return { terms: parseTerms(JSON.parse(text), TERMS_PATH), loaded: true };
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

/**
 * Surgically replace the `source_content_hash:` value inside the YAML
 * frontmatter only, preserving the rest of the file byte-for-byte.
 *
 * WHY NOT stringifyYaml: round-tripping through the YAML serializer reformats
 * tags lists, normalizes date strings to ISO datetimes, and re-quotes strings —
 * producing 60+ line diffs for a 1-line semantic change. A regex on the
 * frontmatter substring keeps the diff to exactly one line.
 *
 * source_content_hash is a top-level key, so the indent matcher is `[ \t]*`.
 * Returns null if the field is absent (no-op signal to the caller).
 */
function setSourceHashInPlace(content: string, newHash: string): string | null {
	const match = content.match(/^(---\n)([\s\S]*?)(\n---\n)([\s\S]*)$/);
	if (!match) return null;
	const [, openDelim, frontmatterRaw, closeDelim, body] = match;
	const updatedFrontmatter = frontmatterRaw.replace(
		/(\n[ \t]*source_content_hash:[ \t]*)(['"]?)[0-9a-f]+\2/,
		`$1${newHash}`,
	);
	if (updatedFrontmatter === frontmatterRaw) return null;
	return `${openDelim}${updatedFrontmatter}${closeDelim}${body}`;
}

/** True when one path is the other or lies inside it. Both must be real paths. */
function pathsOverlap(a: string, b: string): boolean {
	return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

/**
 * Throw unless targetPath is a safe post destination. The Deno write grant
 * checks the pathname only and follows symlinks, so a symlink under the posts
 * root could send a write into the 3B checkout. Checks, all before any write:
 *   - the real posts root does not overlap the real 3B root;
 *   - targetPath is below the posts root;
 *   - no existing component below the posts root is a symlink, the post file
 *     included.
 */
async function assertSafePostPath(targetPath: string): Promise<void> {
	let postsReal: string;
	try {
		postsReal = await Deno.realPath(POSTS_ROOT);
	} catch {
		throw new Error(`posts root does not exist: ${POSTS_ROOT}`);
	}
	let threeBReal: string | null = null;
	try {
		threeBReal = await Deno.realPath(THREEB_ROOT);
	} catch (err) {
		if (!(err instanceof Deno.errors.NotFound)) throw err;
	}
	if (threeBReal && pathsOverlap(postsReal, threeBReal)) {
		throw new Error(`posts root ${postsReal} overlaps the 3B root ${threeBReal}`);
	}
	const rel = relative(POSTS_ROOT, targetPath);
	if (rel === '' || rel.startsWith('..') || rel.startsWith('/')) {
		throw new Error(`post path is outside the posts root: ${targetPath}`);
	}
	let current = POSTS_ROOT;
	for (const part of rel.split('/')) {
		current = join(current, part);
		let info: Deno.FileInfo;
		try {
			info = await Deno.lstat(current);
		} catch (err) {
			if (err instanceof Deno.errors.NotFound) break; // nothing below exists yet
			throw err;
		}
		if (info.isSymlink) throw new Error(`symlink in the post path: ${current}`);
	}
}

/**
 * The one place a post file is written (sync and --rehash). A refused
 * destination stops the run with exit 1: nothing is created or written for it.
 * ponytail: check-then-write, not atomic; a symlink planted between the check
 * and the write is out of scope for a single-user local script.
 */
async function writePost(targetPath: string, content: string): Promise<void> {
	try {
		await assertSafePostPath(targetPath);
	} catch (err) {
		console.error(`Error: refused to write ${targetPath}: ${(err as Error).message}`);
		Deno.exit(1);
	}
	await ensureDir(dirname(targetPath));
	await Deno.writeTextFile(targetPath, content);
}

/**
 * --rehash mode: re-baseline source_content_hash for an allowlist of posts.
 *
 * Use case: a cleanBody-neutral reformat upstream (markdown reflow, dash style,
 * table spacing) changes the cleaned-body bytes and therefore the hash, even
 * though no real content changed. That produces false-positive HASH MISMATCH
 * reports against expanded posts. This pass recomputes the authoritative hash
 * (same cleanBody + computeContentHash the sync uses) and writes ONLY the hash
 * line back into the blog post frontmatter, for posts named in --allow=<file>
 * (newline-separated `category/slug.md` paths).
 *
 * Safety: skips blog-first posts, any allowlisted post that is not
 * expanded:true, and any whose hash already matches. Never rewrites body or
 * any other frontmatter field. The allowlist must be audit-verified as
 * format-only; this pass does not itself distinguish format-only from real
 * content change.
 */
async function rehashFormatOnly(allowPath: string, dryRun: boolean, verbose: boolean) {
	console.log('🔁 Re-baselining source_content_hash (format-only allowlist)...');
	console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
	console.log(`   Allowlist: ${allowPath}`);
	console.log('');

	let allow: Set<string>;
	try {
		const raw = await Deno.readTextFile(allowPath);
		allow = new Set(
			raw
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean),
		);
	} catch {
		console.error(`Error: cannot read allowlist file: ${allowPath}`);
		Deno.exit(1);
	}
	console.log(`   Allowlist entries: ${allow.size}`);
	console.log('');

	let rehashed = 0;
	let alreadyCurrent = 0;
	let skippedNotExpanded = 0;
	let skippedBlogFirst = 0;
	let notFound = 0;
	const seen = new Set<string>();

	for await (const entry of walk(SOURCE_DIR, { exts: ['.md'], includeDirs: false })) {
		const relativePath = entry.path.replace(SOURCE_DIR + '/', '');
		if (!allow.has(relativePath)) continue;
		seen.add(relativePath);

		const category = dirname(relativePath).split('/')[0];
		const slug = basename(entry.path, '.md');
		const content = await Deno.readTextFile(entry.path);
		const { frontmatter, body } = parseFrontmatter(content);
		if (!frontmatter) {
			console.log(`⏭️  ${relativePath}: no frontmatter`);
			continue;
		}

		const targetPath = join(TARGET_DIR, category, `${slug}.md`);
		const existing = await readExistingPost(targetPath);
		if (!existing) {
			console.log(`⏭️  ${relativePath}: blog post not found`);
			notFound++;
			continue;
		}
		if (existing.frontmatter?.origin === 'blog') {
			console.log(`⏭️  ${relativePath}: blog-first post (origin: blog) — skipping`);
			skippedBlogFirst++;
			continue;
		}
		if (existing.frontmatter?.expanded !== true) {
			console.log(`⚠️  ${relativePath}: blog post not expanded — skipping (safety)`);
			skippedNotExpanded++;
			continue;
		}

		const newHash = await computeContentHash(cleanBody(body));
		const oldHash = existing.frontmatter.source_content_hash || '(none)';
		if (oldHash === newHash) {
			alreadyCurrent++;
			if (verbose) console.log(`✅ ${relativePath}: already current`);
			continue;
		}

		if (dryRun) {
			console.log(
				`🔁 Would rehash: ${relativePath}  ${String(oldHash).slice(0, 12)}… → ${newHash.slice(0, 12)}…`,
			);
		} else {
			const targetRaw = await Deno.readTextFile(targetPath);
			const updated = setSourceHashInPlace(targetRaw, newHash);
			if (updated === null) {
				console.log(`⚠️  ${relativePath}: source_content_hash line not found — skipping`);
				continue;
			}
			await writePost(targetPath, updated);
			console.log(`🔁 Rehashed: ${relativePath}`);
		}
		rehashed++;
	}

	const missing = [...allow].filter((r) => !seen.has(r));
	console.log('');
	console.log('📊 Rehash Summary');
	console.log(`   ${dryRun ? 'Would rehash' : 'Rehashed'}: ${rehashed}`);
	console.log(`   Already current: ${alreadyCurrent}`);
	console.log(`   Skipped (blog-first): ${skippedBlogFirst}`);
	console.log(`   Skipped (not expanded): ${skippedNotExpanded}`);
	console.log(`   Blog post not found: ${notFound}`);
	if (missing.length) {
		console.log(`   ⚠️  Allowlist entries not found in source tree: ${missing.length}`);
		for (const m of missing) console.log(`      - ${m}`);
	}
}

async function syncPosts() {
	const args = Deno.args;
	const dryRun = args.includes('--dry-run');
	const verbose = args.includes('--verbose');
	const checkOnly = args.includes('--check');
	const diffMode = args.includes('--diff');
	const rehashMode = args.includes('--rehash');
	const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1];
	const allowArg = args.find((a) => a.startsWith('--allow='))?.split('=')[1];

	// --reconcile repaired needs_resync flags inside 3B notes. The sync is now
	// one-way, so refuse it by name: an ignored flag would run a normal sync.
	if (args.includes('--reconcile')) {
		console.error(
			'Error: --reconcile was removed. The sync no longer writes to 3B; run `pnpm sync:check` to list posts that are behind.',
		);
		Deno.exit(1);
	}

	// --diff mode: early exit to dedicated function
	if (diffMode) {
		if (!slugArg) {
			console.error('Error: --diff requires --slug=<slug>');
			console.error('Usage: pnpm sync:diff -- --slug=redis-queue-patterns');
			Deno.exit(1);
		}
		await diffPost(slugArg, verbose);
		return;
	}

	// --rehash mode: re-baseline source_content_hash for an audit-verified
	// allowlist of format-only posts, then exit
	if (rehashMode) {
		if (!allowArg) {
			console.error(
				'Error: --rehash requires --allow=<file> (newline-separated category/slug.md paths)',
			);
			Deno.exit(1);
		}
		await rehashFormatOnly(allowArg, dryRun, verbose);
		return;
	}

	// G1 gate input. Fail closed like the audit: without the deny list, employer
	// and identifier detection is OFF, so a run that writes refuses to start.
	let loadedTerms: { terms: Terms; loaded: boolean };
	try {
		loadedTerms = await loadTerms();
	} catch (err) {
		console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
		Deno.exit(1);
	}
	const { terms, loaded: termsLoaded } = loadedTerms;
	const writes = !dryRun && !checkOnly;
	if (!termsLoaded && writes && !args.includes('--allow-missing-terms')) {
		console.error(
			`❌ Deny list not found at ${TERMS_PATH}.\n` +
				`   The G1 gate would run without employer/identifier detection, so sync refuses to write.\n` +
				`   Set BLOG_AUDIT_TERMS to the private list, or pass --allow-missing-terms\n` +
				`   for structural G1 checks only.`,
		);
		Deno.exit(1);
	}

	// Determine mode label
	const modeLabel = checkOnly ? 'HASH CHECK' : dryRun ? 'DRY RUN' : 'APPLY';

	console.log('🔄 Syncing posts from 3B knowledge base...');
	console.log(`   Mode: ${modeLabel}`);
	if (!termsLoaded && !checkOnly) {
		console.log(`⚠️  Deny list not found at ${TERMS_PATH} — G1 runs STRUCTURAL checks only.`);
	}
	console.log('');

	let synced = 0;
	let skipped = 0;
	let refused = 0;
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

		const targetPath = join(TARGET_DIR, category, basename(entry.path));
		const slug = basename(entry.path, '.md');

		// Check if target already exists
		const existing = await readExistingPost(targetPath);

		// --- BLOG-FIRST POST PROTECTION (origin: blog) ---
		// NON-TASK lane posts (/3b:blog-publish v3) are authored directly in
		// this repo and have no 3B source. If a 3B knowledge file later appears
		// with the SAME slug, never overwrite the blog-first post and never
		// hash-compare it (it has no source_content_hash until Step 8.5
		// promotion retrofits one and removes `origin: blog`).
		if (existing?.frontmatter?.origin === 'blog') {
			if (verbose || checkOnly) {
				console.log(`⏭️  Skipping (blog-first, origin: blog): ${relativePath}`);
			}
			skipReasons['blog-first post (origin: blog)'] =
				(skipReasons['blog-first post (origin: blog)'] || 0) + 1;
			skipped++;
			continue;
		}
		// --- END BLOG-FIRST POST PROTECTION ---

		// Transform and compute hash
		const targetFrontmatter = transformFrontmatter(frontmatter, body, category);
		const cleanedBody = cleanBody(body);
		const contentHash = await computeContentHash(cleanedBody);

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
					console.log(`   Run: pnpm sync:diff -- --slug=${slug}`);
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

		// --- G1 GATE ---
		// Audit the exact frontmatter and body about to ship, before any write: a
		// post with a finding is not written.
		const g1Findings = auditG1(
			targetFrontmatter as unknown as Record<string, unknown>,
			cleanedBody,
			terms,
		);
		if (g1Findings.length > 0) {
			console.log(`❌ ${dryRun ? 'Would refuse' : 'Refused'} (G1): ${relativePath}`);
			for (const f of g1Findings) console.log(`   [${f.gate} ${f.rule}] ${f.detail}`);
			refused++;
			continue;
		}
		// --- END G1 GATE ---

		if (dryRun) {
			console.log(`✅ Would sync: ${relativePath} → ${targetPath}`);
		} else {
			await writePost(targetPath, targetContent);

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
				console.log(`     Old: ${m.oldHash}`);
				console.log(`     New: ${m.newHash}`);
				console.log(`     Run: pnpm sync:diff -- --slug=${m.slug}`);
			}
		}

		Deno.exit(hashMismatches.length > 0 ? 1 : 0);
	}

	console.log('📊 Summary');
	console.log(`   Synced: ${synced}`);
	console.log(`   Skipped: ${skipped}`);
	console.log(`   ${dryRun ? 'Would refuse' : 'Refused'} (G1): ${refused}`);

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

	if (refused > 0) {
		console.log('');
		console.log('❌ G1 findings blocked the posts above. Generalize them in 3B, then re-run.');
		Deno.exit(1);
	}
}

// Run (guarded so the test can import helpers without triggering a sync)
if (import.meta.main) await syncPosts();
