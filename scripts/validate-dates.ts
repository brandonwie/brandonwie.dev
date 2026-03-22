#!/usr/bin/env npx tsx
/**
 * Validate frontmatter date consistency across EN and KO posts.
 *
 * Rules:
 *   1. EN posts: updated >= date
 *   2. KO posts: source_slug must reference an existing EN post
 *   3. KO posts: source_updated must match EN's updated
 *   4. KO posts: date must match EN's date
 *   5. KO posts: updated must match EN's updated
 *
 * Usage:
 *   npx tsx scripts/validate-dates.ts          # Report errors, exit 1 if any
 *   npx tsx scripts/validate-dates.ts --fix    # Auto-fix date mismatches (rules 3-5)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';

const EN_DIR = './src/content/posts/en';
const KO_DIR = './src/content/posts/ko';

interface EnPostMeta {
	slug: string;
	category: string;
	date: string;
	updated: string;
	filePath: string;
}

interface KoPostMeta {
	slug: string;
	category: string;
	date: string;
	updated: string;
	source_slug: string;
	source_updated: string;
	filePath: string;
}

interface ValidationError {
	file: string;
	rule: string;
	message: string;
	fixable: boolean;
}

/** Normalize any date format to YYYY-MM-DD for comparison */
function normalizeDate(dateStr: string | Date): string {
	const d = new Date(dateStr);
	return d.toISOString().split('T')[0];
}

/** Scan EN directory and return slug -> metadata map */
function scanEnPosts(): Map<string, EnPostMeta> {
	const posts = new Map<string, EnPostMeta>();
	if (!existsSync(EN_DIR)) return posts;

	const categories = readdirSync(EN_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	for (const category of categories) {
		const categoryPath = join(EN_DIR, category);
		const files = readdirSync(categoryPath).filter((f) => f.endsWith('.md'));

		for (const file of files) {
			const filePath = join(categoryPath, file);
			const slug = basename(file, '.md');
			const { data } = matter(readFileSync(filePath, 'utf-8'));

			posts.set(slug, {
				slug,
				category,
				date: String(data.date || ''),
				updated: String(data.updated || data.date || ''),
				filePath,
			});
		}
	}

	return posts;
}

/** Scan KO directory and return slug -> metadata map */
function scanKoPosts(): Map<string, KoPostMeta> {
	const posts = new Map<string, KoPostMeta>();
	if (!existsSync(KO_DIR)) return posts;

	const categories = readdirSync(KO_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	for (const category of categories) {
		const categoryPath = join(KO_DIR, category);
		const files = readdirSync(categoryPath).filter((f) => f.endsWith('.md'));

		for (const file of files) {
			const filePath = join(categoryPath, file);
			const slug = basename(file, '.md');
			const { data } = matter(readFileSync(filePath, 'utf-8'));

			posts.set(slug, {
				slug,
				category,
				date: String(data.date || ''),
				updated: String(data.updated || data.date || ''),
				source_slug: String(data.source_slug || ''),
				source_updated: String(data.source_updated || ''),
				filePath,
			});
		}
	}

	return posts;
}

/** Run all validation rules */
function validate(
	enPosts: Map<string, EnPostMeta>,
	koPosts: Map<string, KoPostMeta>,
): ValidationError[] {
	const errors: ValidationError[] = [];

	// Rule 1: EN updated >= date
	for (const [slug, en] of enPosts) {
		if (!en.date || !en.updated) continue;
		const dateNorm = normalizeDate(en.date);
		const updatedNorm = normalizeDate(en.updated);
		if (updatedNorm < dateNorm) {
			errors.push({
				file: `en/${en.category}/${slug}.md`,
				rule: 'en-updated-before-date',
				message: `updated (${updatedNorm}) is before date (${dateNorm})`,
				fixable: false,
			});
		}
	}

	// Rule 2 & 3: KO source_slug exists + source_updated matches
	for (const [slug, ko] of koPosts) {
		if (!ko.source_slug) continue;

		const en = enPosts.get(ko.source_slug);

		// Rule 2: source_slug must reference existing EN post
		if (!en) {
			errors.push({
				file: `ko/${ko.category}/${slug}.md`,
				rule: 'orphaned-source-slug',
				message: `source_slug "${ko.source_slug}" has no matching EN post`,
				fixable: false,
			});
			continue;
		}

		// Rule 3: source_updated must match EN updated
		if (ko.source_updated) {
			const koSourceNorm = normalizeDate(ko.source_updated);
			const enUpdatedNorm = normalizeDate(en.updated);
			if (koSourceNorm !== enUpdatedNorm) {
				errors.push({
					file: `ko/${ko.category}/${slug}.md`,
					rule: 'source-updated-mismatch',
					message: `source_updated (${koSourceNorm}) != EN updated (${enUpdatedNorm})`,
					fixable: true,
				});
			}
		}

		// Rule 4: KO date must match EN date
		const koDateNorm = normalizeDate(ko.date);
		const enDateNorm = normalizeDate(en.date);
		if (koDateNorm !== enDateNorm) {
			errors.push({
				file: `ko/${ko.category}/${slug}.md`,
				rule: 'date-mismatch',
				message: `KO date (${koDateNorm}) != EN date (${enDateNorm})`,
				fixable: true,
			});
		}

		// Rule 5: KO updated must match EN updated
		const koUpdatedNorm = normalizeDate(ko.updated);
		const enUpdNorm = normalizeDate(en.updated);
		if (koUpdatedNorm !== enUpdNorm) {
			errors.push({
				file: `ko/${ko.category}/${slug}.md`,
				rule: 'updated-mismatch',
				message: `KO updated (${koUpdatedNorm}) != EN updated (${enUpdNorm})`,
				fixable: true,
			});
		}
	}

	return errors;
}

/** Apply auto-fixes for fixable errors */
function applyFixes(
	errors: ValidationError[],
	enPosts: Map<string, EnPostMeta>,
	koPosts: Map<string, KoPostMeta>,
): number {
	// Group fixable errors by file to batch writes
	const fixesByFile = new Map<string, ValidationError[]>();
	for (const error of errors) {
		if (!error.fixable) continue;
		const list = fixesByFile.get(error.file) || [];
		list.push(error);
		fixesByFile.set(error.file, list);
	}

	let fixed = 0;

	for (const [file, fileErrors] of fixesByFile) {
		const slug = basename(file, '.md');
		const ko = koPosts.get(slug);
		if (!ko) continue;

		const en = enPosts.get(ko.source_slug);
		if (!en) continue;

		const raw = readFileSync(ko.filePath, 'utf-8');
		const { data, content } = matter(raw);

		const changes: string[] = [];

		for (const error of fileErrors) {
			if (error.rule === 'source-updated-mismatch') {
				data.source_updated = normalizeDate(en.updated);
				changes.push(`source_updated: ${data.source_updated}`);
			} else if (error.rule === 'date-mismatch') {
				data.date = normalizeDate(en.date);
				changes.push(`date: ${data.date}`);
			} else if (error.rule === 'updated-mismatch') {
				data.updated = normalizeDate(en.updated);
				changes.push(`updated: ${data.updated}`);
			}
		}

		if (changes.length > 0) {
			writeFileSync(ko.filePath, matter.stringify(content, data));
			fixed++;
			console.log(`  ✅ Fixed: ${file} → ${changes.join(', ')}`);
		}
	}

	return fixed;
}

function main() {
	const args = process.argv.slice(2);
	const fixMode = args.includes('--fix');

	console.log('\n📋 Frontmatter Date Validation\n');
	console.log('='.repeat(50));

	const enPosts = scanEnPosts();
	const koPosts = scanKoPosts();

	console.log(`\n  Scanned: ${enPosts.size} EN posts, ${koPosts.size} KO posts\n`);

	const errors = validate(enPosts, koPosts);

	if (errors.length === 0) {
		console.log('  ✅ All dates consistent — no errors found.\n');
		process.exit(0);
	}

	// Group errors by rule
	const byRule = new Map<string, ValidationError[]>();
	for (const err of errors) {
		const list = byRule.get(err.rule) || [];
		list.push(err);
		byRule.set(err.rule, list);
	}

	const fixable = errors.filter((e) => e.fixable);
	const unfixable = errors.filter((e) => !e.fixable);

	if (unfixable.length > 0) {
		console.log('❌ Errors (manual fix required):\n');
		for (const err of unfixable) {
			console.log(`  ${err.file}`);
			console.log(`    [${err.rule}] ${err.message}\n`);
		}
	}

	if (fixable.length > 0) {
		console.log(`⚠️  Fixable errors (${fixable.length}):\n`);
		for (const err of fixable) {
			console.log(`  ${err.file}`);
			console.log(`    [${err.rule}] ${err.message}\n`);
		}
	}

	if (fixMode && fixable.length > 0) {
		console.log('🔧 Applying fixes...\n');
		const fixed = applyFixes(errors, enPosts, koPosts);
		console.log(`\n  Fixed ${fixed} file(s).`);

		// Re-validate after fix
		const remaining = validate(scanEnPosts(), scanKoPosts());
		if (remaining.length === 0) {
			console.log('  ✅ All errors resolved.\n');
			process.exit(0);
		} else {
			console.log(`  ⚠️  ${remaining.length} error(s) remain (not auto-fixable).\n`);
			process.exit(1);
		}
	}

	console.log('='.repeat(50));
	console.log(`\n  Total: ${errors.length} error(s) (${fixable.length} fixable with --fix)\n`);

	if (fixable.length > 0 && !fixMode) {
		console.log('  Run with --fix to auto-resolve fixable errors.\n');
	}

	process.exit(1);
}

main();
