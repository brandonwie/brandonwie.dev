import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import matter from 'gray-matter';

import { renderMarkdown, type Heading } from '../markdown/pipeline';

/**
 * Post loading for the Next candidate.
 *
 * The SvelteKit original is `src/routes/posts/[slug]/+page.ts`, which uses
 * `import.meta.glob` to turn every markdown file into a lazily-imported module.
 * That is a Vite feature with no Next equivalent, and it is one of the 17
 * `import.meta.glob` call sites contract C5 is about. Under `output: 'export'`
 * the files are read from disk at build time instead, which is the same work
 * without the bundler in the middle.
 *
 * Frontmatter is parsed by gray-matter, exactly as the markdown pipeline
 * already does, so a date written unquoted in YAML stays a `Date` and a quoted
 * one stays a string. That distinction is load-bearing: the baseline's JSON-LD
 * carries `datePublished` as an ISO timestamp and `dateModified` as a bare
 * `YYYY-MM-DD`, because the source file quotes one and not the other.
 */

/**
 * Content lives one level above this package, in the repository the SvelteKit
 * app still owns.
 *
 * The root is derived from the working directory rather than `import.meta.url`.
 * The first version used `new URL('../../../', import.meta.url)`, which reads
 * naturally and does not build: Turbopack treats the URL argument as a module
 * specifier and fails with `Can't resolve '../../../'`. `next build` runs with
 * the working directory set to this package, the same assumption Tailwind's
 * source detection already relies on, so `../` is the repository root.
 */
const CONTENT_ROOT = join(process.cwd(), '..', 'src/content/posts');

export type Locale = 'en' | 'ko';

export interface PostFrontmatter {
	title: string;
	description: string;
	date: string | Date;
	updated?: string | Date;
	tags: string[];
	category: string;
	draft?: boolean;
}

export interface LoadedPost {
	slug: string;
	locale: Locale;
	frontmatter: PostFrontmatter;
	content: Awaited<ReturnType<typeof renderMarkdown>>['content'];
	readingTime: number;
	headings: Heading[];
	hasKoreanTranslation: boolean;
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (entry.endsWith('.md')) out.push(full);
	}
	return out;
}

/** Absolute path of `<slug>.md` under a locale, or null. */
export function findPostFile(slug: string, locale: Locale): string | null {
	const root = join(CONTENT_ROOT, locale);
	return walk(root).find((file) => file.endsWith(`/${slug}.md`)) ?? null;
}

/** Every slug published in a locale, drafts excluded. */
export function listPostSlugs(locale: Locale): string[] {
	return walk(join(CONTENT_ROOT, locale))
		.map((file) => ({ file, slug: file.split('/').pop()!.replace(/\.md$/, '') }))
		.filter(({ file }) => matter(readFileSync(file, 'utf8')).data.draft !== true)
		.map(({ slug }) => slug)
		.sort();
}

/**
 * Load and render one post.
 *
 * Returns null for a missing slug AND for a draft. The SvelteKit loader calls
 * `error(404, ...)` on a draft rather than rendering it, because "retiring a
 * post that failed a content-integrity gate actually withdraws it" — the direct
 * URL has to stop working, not just the listings.
 */
export async function loadPost(slug: string, locale: Locale): Promise<LoadedPost | null> {
	const file = findPostFile(slug, locale);
	if (!file) return null;

	const rendered = await renderMarkdown(readFileSync(file, 'utf8'));
	const frontmatter = rendered.frontmatter as unknown as PostFrontmatter;
	if (frontmatter.draft === true) return null;

	return {
		slug,
		locale,
		frontmatter,
		content: rendered.content,
		readingTime: rendered.readingTime,
		headings: rendered.headings,
		hasKoreanTranslation: findPostFile(slug, 'ko') !== null,
	};
}
