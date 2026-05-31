#!/usr/bin/env -S pnpm exec tsx
/**
 * Translation Status Script
 *
 * Shows which English posts need Korean translations.
 * Run: pnpm translation:status
 */

import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const EN_DIR = './src/content/posts/en';
const KO_DIR = './src/content/posts/ko';

interface PostStatus {
	slug: string;
	category: string;
	hasKorean: boolean;
}

function getPostsInDir(dir: string): Map<string, string> {
	const posts = new Map<string, string>();

	if (!existsSync(dir)) {
		return posts;
	}

	const categories = readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	for (const category of categories) {
		const categoryPath = join(dir, category);
		const files = readdirSync(categoryPath).filter((f) => f.endsWith('.md'));

		for (const file of files) {
			const slug = basename(file, '.md');
			posts.set(slug, category);
		}
	}

	return posts;
}

function main() {
	console.log('\n📊 Translation Status\n');
	console.log('='.repeat(60));

	const enPosts = getPostsInDir(EN_DIR);
	const koPosts = getPostsInDir(KO_DIR);

	if (enPosts.size === 0) {
		console.log('\n⚠️  No English posts found in', EN_DIR);
		console.log('   Run `pnpm sync` first to sync posts from 3B.\n');
		return;
	}

	const statuses: PostStatus[] = [];

	for (const [slug, category] of enPosts) {
		statuses.push({
			slug,
			category,
			hasKorean: koPosts.has(slug),
		});
	}

	// Sort: untranslated first, then by category/slug
	statuses.sort((a, b) => {
		if (a.hasKorean !== b.hasKorean) {
			return a.hasKorean ? 1 : -1;
		}
		return `${a.category}/${a.slug}`.localeCompare(`${b.category}/${b.slug}`);
	});

	const needsTranslation = statuses.filter((s) => !s.hasKorean);
	const translated = statuses.filter((s) => s.hasKorean);

	if (needsTranslation.length > 0) {
		console.log('\n🔴 Needs Translation:\n');
		for (const { slug, category } of needsTranslation) {
			console.log(`   ${category}/${slug}`);
			console.log(`   └─ Create: pnpm translation:create -- --slug=${slug}\n`);
		}
	}

	if (translated.length > 0) {
		console.log('\n🟢 Already Translated:\n');
		for (const { slug, category } of translated) {
			console.log(`   ${category}/${slug}`);
		}
	}

	console.log('\n' + '='.repeat(60));
	console.log(`\n📈 Summary: ${translated.length}/${statuses.length} posts translated`);

	if (needsTranslation.length > 0) {
		console.log(`   ${needsTranslation.length} posts need translation\n`);
	} else {
		console.log('   All posts are translated! 🎉\n');
	}
}

main();
