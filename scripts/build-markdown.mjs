/**
 * Writes the plain-text side of the site into a finished static export, for
 * readers that are programs:
 *
 *   <build>/posts/<slug>.md      each English post as Markdown
 *   <build>/ko/posts/<slug>.md   each Korean post as Markdown
 *   <build>/llms.txt             an index of them (https://llmstxt.org)
 *
 * The post page links to its `.md` file. Drafts are left out, as on the site.
 *
 *   node scripts/build-markdown.mjs <build-dir>
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';

const SITE_URL = 'https://brandonwie.dev';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = process.argv[2];

if (!buildDir || !existsSync(buildDir)) {
	console.error('usage: node scripts/build-markdown.mjs <build-dir>');
	process.exit(2);
}

/** A frontmatter date as `YYYY-MM-DD`. YAML gives a Date for an unquoted value. */
function day(value) {
	if (!value) return '';
	return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
}

/** Published posts of one locale, newest first. */
function posts(locale) {
	const root = join(ROOT, 'src/content/posts', locale);
	return readdirSync(root, { recursive: true })
		.filter((file) => file.endsWith('.md'))
		.map((file) => {
			const { data, content } = matter(readFileSync(join(root, file), 'utf8'));
			return { slug: basename(file, '.md'), data, content };
		})
		.filter((post) => post.data.draft !== true)
		.sort(
			(a, b) => day(b.data.date).localeCompare(day(a.data.date)) || a.slug.localeCompare(b.slug),
		);
}

function postUrl(slug, locale) {
	return `${SITE_URL}${locale === 'ko' ? '/ko' : ''}/posts/${slug}`;
}

function postMarkdown({ slug, data, content }, locale) {
	const updated = day(data.updated);
	const facts = [
		`- Published: ${day(data.date)}`,
		updated && updated !== day(data.date) ? `- Updated: ${updated}` : '',
		`- Category: ${data.category}`,
		data.tags?.length ? `- Tags: ${data.tags.join(', ')}` : '',
		`- Page: ${postUrl(slug, locale)}`,
	].filter(Boolean);
	return `# ${data.title}\n\n> ${data.description}\n\n${facts.join('\n')}\n\n${content.trim()}\n`;
}

const counts = {};
for (const locale of ['en', 'ko']) {
	const out = join(buildDir, locale === 'ko' ? 'ko/posts' : 'posts');
	mkdirSync(out, { recursive: true });
	const list = posts(locale);
	for (const post of list) writeFileSync(join(out, `${post.slug}.md`), postMarkdown(post, locale));
	counts[locale] = list.length;
}

const index = [
	'# Brandon Wie',
	'',
	'> Software engineering notes on backend systems, DevOps, and production product work. Each post is also served as Markdown at its address plus `.md`.',
	'',
	'## Posts',
	'',
	...posts('en').map(
		(post) => `- [${post.data.title}](${postUrl(post.slug, 'en')}.md): ${post.data.description}`,
	),
	'',
	'## Optional',
	'',
	`- [About](${SITE_URL}/about): who writes this site`,
	`- [RSS feed](${SITE_URL}/rss.xml)`,
	`- [Korean posts](${SITE_URL}/ko): the same posts in Korean, at /ko/posts/<slug>.md`,
	'',
].join('\n');
writeFileSync(join(buildDir, 'llms.txt'), index);

console.log(`markdown: ${counts.en} English and ${counts.ko} Korean posts, llms.txt`);
