#!/usr/bin/env npx tsx
/**
 * Translation Create Script
 *
 * Creates a Korean translation template from an English post.
 * Run: npm run translation:create -- --slug=<post-slug>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import matter from "gray-matter";

const EN_DIR = "./src/content/posts/en";
const KO_DIR = "./src/content/posts/ko";

function findEnglishPost(slug: string): { path: string; category: string } | null {
  if (!existsSync(EN_DIR)) {
    return null;
  }

  const categories = readdirSync(EN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const category of categories) {
    const postPath = join(EN_DIR, category, `${slug}.md`);
    if (existsSync(postPath)) {
      return { path: postPath, category };
    }
  }

  return null;
}

function parseArgs(): { slug: string } {
  const args = process.argv.slice(2);
  let slug = "";

  for (const arg of args) {
    if (arg.startsWith("--slug=")) {
      slug = arg.replace("--slug=", "");
    }
  }

  if (!slug) {
    console.error("\n❌ Error: --slug argument is required");
    console.error("   Usage: npm run translation:create -- --slug=<post-slug>\n");
    process.exit(1);
  }

  return { slug };
}

function main() {
  const { slug } = parseArgs();

  console.log(`\n📝 Creating Korean translation template for: ${slug}\n`);

  // Find English post
  const enPost = findEnglishPost(slug);
  if (!enPost) {
    console.error(`❌ English post not found: ${slug}`);
    console.error(`   Looked in: ${EN_DIR}/<category>/${slug}.md\n`);
    process.exit(1);
  }

  // Check if Korean version already exists
  const koPath = join(KO_DIR, enPost.category, `${slug}.md`);
  if (existsSync(koPath)) {
    console.error(`❌ Korean translation already exists: ${koPath}`);
    console.error("   Delete it first if you want to recreate.\n");
    process.exit(1);
  }

  // Read English post
  const enContent = readFileSync(enPost.path, "utf-8");
  const { data: enFrontmatter, content: enBody } = matter(enContent);

  // Create Korean frontmatter
  const today = new Date().toISOString().split("T")[0];
  const koFrontmatter = {
    title: `[번역 필요] ${enFrontmatter.title}`,
    description: `[번역 필요] ${enFrontmatter.description}`,
    date: enFrontmatter.date,
    updated: today,
    tags: enFrontmatter.tags || [],
    category: enFrontmatter.category,
    draft: true, // Keep as draft until translation is complete
    lang: "ko",
    source_lang: "en",
    source_slug: slug,
    source_updated: enFrontmatter.updated || enFrontmatter.date,
    translation_date: today,
    _translation_notes: "See docs/TRANSLATION.md for guidelines. Remove [번역 필요] from title/description and set draft: false when done.",
  };

  // Create Korean content (no HTML comments - they break mdsvex)
  // Instructions are in frontmatter and docs/TRANSLATION.md
  const koBody = enBody;

  // Ensure directory exists
  const koDir = dirname(koPath);
  if (!existsSync(koDir)) {
    mkdirSync(koDir, { recursive: true });
  }

  // Write Korean file
  const koContent = matter.stringify(koBody, koFrontmatter);
  writeFileSync(koPath, koContent);

  console.log("✅ Created translation template:");
  console.log(`   ${koPath}\n`);
  console.log("📋 Next steps:");
  console.log("   1. Open the file and translate the content");
  console.log("   2. Update title and description in frontmatter");
  console.log("   3. Remove the instruction comment block");
  console.log("   4. Set draft: false when ready");
  console.log("   5. Run `npm run build` to verify\n");
}

main();
