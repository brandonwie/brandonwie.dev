import type { RequestHandler } from './$types';

interface PostModule {
	metadata: {
		title: string;
		description: string;
		date: string;
		updated?: string;
		tags: string[];
		category: string;
		draft?: boolean;
		lang?: string;
	};
}

const siteUrl = 'https://brandonwie.dev';

export const prerender = true;

export const GET: RequestHandler = async () => {
	// Load posts from both languages
	const enModules = import.meta.glob('../../content/posts/en/**/*.md');
	const koModules = import.meta.glob('../../content/posts/ko/**/*.md');

	const posts: { slug: string; metadata: PostModule['metadata']; hasKorean: boolean }[] = [];
	const koSlugs = new Set<string>();

	// First pass: collect Korean slugs
	for (const [path] of Object.entries(koModules)) {
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		koSlugs.add(slug);
	}

	// Load English posts and check for Korean translations
	for (const [path, resolver] of Object.entries(enModules)) {
		const post = (await resolver()) as PostModule;
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';

		if (post.metadata.draft) continue;

		posts.push({
			slug,
			metadata: post.metadata,
			hasKorean: koSlugs.has(slug),
		});
	}

	// Static pages (both languages)
	const staticPages = [
		{ en: '', ko: '/ko', priority: '1.0' },
		{ en: '/posts', ko: '/ko/posts', priority: '0.8' },
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${staticPages
		.map(
			(page) => `
  <url>
    <loc>${siteUrl}${page.en}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}${page.en}"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${siteUrl}${page.ko}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}${page.en}"/>
    <changefreq>weekly</changefreq>
    <priority>${page.priority}</priority>
  </url>
  <url>
    <loc>${siteUrl}${page.ko}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}${page.en}"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${siteUrl}${page.ko}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}${page.en}"/>
    <changefreq>weekly</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
		)
		.join('')}
  ${posts
		.map(
			(post) => `
  <url>
    <loc>${siteUrl}/posts/${post.slug}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}/posts/${post.slug}"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${siteUrl}/ko/posts/${post.slug}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/posts/${post.slug}"/>
    <lastmod>${post.metadata.updated || post.metadata.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${siteUrl}/ko/posts/${post.slug}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}/posts/${post.slug}"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${siteUrl}/ko/posts/${post.slug}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/posts/${post.slug}"/>
    <lastmod>${post.metadata.updated || post.metadata.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`,
		)
		.join('')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600',
		},
	});
};
