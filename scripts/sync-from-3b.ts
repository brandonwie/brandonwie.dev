/**
 * Sync content from 3B knowledge base to blog
 *
 * Usage: deno run --allow-read --allow-write scripts/sync-from-3b.ts
 *
 * This script:
 * 1. Reads markdown files from 3B knowledge directory
 * 2. Filters for blog-ready entries (publishable: true, ready: true)
 * 3. Transforms frontmatter to blog format
 * 4. Copies to src/content/posts/
 * 5. Updates source file with sync timestamps
 */

import { walk } from "https://deno.land/std@0.220.0/fs/walk.ts";
import { ensureDir } from "https://deno.land/std@0.220.0/fs/ensure_dir.ts";
import {
  parse as parseYaml,
  stringify as stringifyYaml,
} from "https://deno.land/std@0.220.0/yaml/mod.ts";
import { basename, dirname, join } from "https://deno.land/std@0.220.0/path/mod.ts";

// Configuration
const SOURCE_DIR = Deno.env.get("HOME") + "/dev/personal/3b/knowledge";
const TARGET_DIR = "./src/content/posts/en";
const EXCLUDED_CATEGORIES = ["moba"]; // Company-specific content (backup filter)

// ============================================================================
// Types
// ============================================================================

interface BlogMeta {
  publishable: boolean | "review";
  ready: boolean;
  published_at: string | null;
  last_synced: string | null;
  exclude_reason: string | null;
}

interface Reference {
  url: string;
  type: "official" | "authoritative" | "verified" | "experience";
  title: string;
  verified_date?: string;
  notes?: string;
  author?: string;
}

interface SourceFrontmatter {
  tags: string[];
  created: string;
  updated: string;
  status: "not-started" | "in-progress" | "completed";
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
  return "Untitled";
}

function extractDescription(content: string): string {
  // Find first paragraph after frontmatter and H1
  const lines = content.split("\n");
  let foundHeading = false;
  let description = "";

  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundHeading = true;
      continue;
    }
    if (
      foundHeading &&
      line.trim() &&
      !line.startsWith("#") &&
      !line.startsWith("```") &&
      !line.startsWith(">") &&
      !line.startsWith("-")
    ) {
      description = line.trim();
      break;
    }
  }

  // Truncate to 160 chars for SEO
  if (description.length > 160) {
    description = description.substring(0, 157) + "...";
  }

  return description || "No description available";
}

function parseFrontmatter(content: string): {
  frontmatter: SourceFrontmatter | null;
  body: string;
  rawFrontmatter: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: content, rawFrontmatter: "" };
  }

  try {
    const frontmatter = parseYaml(match[1]) as SourceFrontmatter;
    return { frontmatter, body: match[2], rawFrontmatter: match[1] };
  } catch {
    return { frontmatter: null, body: content, rawFrontmatter: "" };
  }
}

/**
 * Check if a file should be synced based on blog metadata
 */
function shouldSync(
  frontmatter: SourceFrontmatter,
  category: string
): { sync: boolean; reason: string } {
  // Backup filter: excluded categories
  if (EXCLUDED_CATEGORIES.includes(category)) {
    return { sync: false, reason: "excluded category" };
  }

  // Must have blog metadata (new schema)
  if (!frontmatter.blog) {
    return { sync: false, reason: "no blog metadata (legacy file)" };
  }

  // Must be publishable (not false or "review")
  if (frontmatter.blog.publishable !== true) {
    const reason =
      frontmatter.blog.exclude_reason ||
      (frontmatter.blog.publishable === "review"
        ? "needs review"
        : "not publishable");
    return { sync: false, reason };
  }

  // Must be ready for publication
  if (!frontmatter.blog.ready) {
    return { sync: false, reason: "not ready (blog.ready: false)" };
  }

  // Must have at least one reference
  if (!frontmatter.references || frontmatter.references.length === 0) {
    return { sync: false, reason: "no references" };
  }

  // Must have at least one official or authoritative reference
  const hasCredibleRef = frontmatter.references.some(
    (ref) => ref.type === "official" || ref.type === "authoritative"
  );
  if (!hasCredibleRef) {
    return { sync: false, reason: "no official/authoritative reference" };
  }

  // Status check (should be completed)
  if (frontmatter.status !== "completed") {
    return { sync: false, reason: "not completed" };
  }

  return { sync: true, reason: "ok" };
}

function transformFrontmatter(
  source: SourceFrontmatter,
  body: string,
  category: string
): TargetFrontmatter {
  const target: TargetFrontmatter = {
    title: extractTitle(body),
    description: extractDescription(body),
    date: source.created,
    updated: source.updated,
    tags: source.tags,
    category,
    draft: source.status !== "completed",
    lang: "en",
  };

  // Include simplified references for blog
  if (source.references && source.references.length > 0) {
    target.references = source.references.map((ref) => ({
      url: ref.url,
      title: ref.title,
      type: ref.type,
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
  cleaned = cleaned.replace(/^#\s+.+\n+/, "");

  // Remove the first paragraph after H1 (already used as description in frontmatter)
  // Match: first non-empty line that's not a heading, code block, quote, or list
  const lines = cleaned.split("\n");
  let foundFirstParagraph = false;
  const filteredLines: string[] = [];

  for (const line of lines) {
    // Skip empty lines at the start
    if (!foundFirstParagraph && line.trim() === "") {
      continue;
    }

    // Skip the first paragraph line (description)
    if (
      !foundFirstParagraph &&
      line.trim() &&
      !line.startsWith("#") &&
      !line.startsWith("```") &&
      !line.startsWith(">") &&
      !line.startsWith("-") &&
      !line.startsWith("---")
    ) {
      foundFirstParagraph = true;
      continue; // Skip this line (it's the description)
    }

    // Keep everything else
    if (foundFirstParagraph || line.trim() === "") {
      filteredLines.push(line);
    }
  }

  cleaned = filteredLines.join("\n");

  // Remove related sections (handled by frontmatter)
  cleaned = cleaned.replace(/##\s*Related[\s\S]*?(?=##|$)/gi, "");

  // Remove when_used sections
  cleaned = cleaned.replace(/##\s*When This Came Up[\s\S]*?(?=##|$)/gi, "");

  // Remove horizontal rules at the start (often after title/description)
  cleaned = cleaned.replace(/^[\s\n]*---[\s\n]+/, "");

  // Clean up multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * Update source file with sync timestamps
 */
async function updateSourceFile(
  sourcePath: string,
  content: string,
  frontmatter: SourceFrontmatter,
  isFirstSync: boolean
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Update blog metadata
  if (frontmatter.blog) {
    frontmatter.blog.last_synced = today;
    if (isFirstSync) {
      frontmatter.blog.published_at = today;
    }
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

async function syncPosts() {
  const args = Deno.args;
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");

  console.log("🔄 Syncing posts from 3B knowledge base...");
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log("");

  let synced = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};

  for await (const entry of walk(SOURCE_DIR, {
    exts: [".md"],
    includeDirs: false,
  })) {
    const relativePath = entry.path.replace(SOURCE_DIR + "/", "");
    const category = dirname(relativePath).split("/")[0];

    // Skip index files
    if (basename(entry.path).startsWith("_")) {
      continue;
    }

    const content = await Deno.readTextFile(entry.path);
    const { frontmatter, body } = parseFrontmatter(content);

    // Skip if no frontmatter
    if (!frontmatter) {
      if (verbose) console.log(`⏭️  Skipping (no frontmatter): ${relativePath}`);
      skipReasons["no frontmatter"] = (skipReasons["no frontmatter"] || 0) + 1;
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

    // Transform and write
    const targetFrontmatter = transformFrontmatter(frontmatter, body, category);
    const cleanedBody = cleanBody(body);

    const targetContent = `---
${stringifyYaml(targetFrontmatter)}---

${cleanedBody}
`;

    const targetPath = join(TARGET_DIR, category, basename(entry.path));

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

  console.log("");
  console.log("📊 Summary");
  console.log(`   Synced: ${synced}`);
  console.log(`   Skipped: ${skipped}`);

  if (Object.keys(skipReasons).length > 0) {
    console.log("");
    console.log("   Skip reasons:");
    for (const [reason, count] of Object.entries(skipReasons).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`     - ${reason}: ${count}`);
    }
  }

  if (dryRun && synced > 0) {
    console.log("");
    console.log("Run without --dry-run to apply changes");
  }
}

// Run
await syncPosts();
