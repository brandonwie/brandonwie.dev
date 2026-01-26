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
	};
}

const siteUrl = 'https://brandonwie.dev';

export const prerender = true;

export const GET: RequestHandler = async () => {
	const modules = import.meta.glob('../../content/posts/**/*.md');
	const posts: { slug: string; metadata: PostModule['metadata'] }[] = [];

	for (const [path, resolver] of Object.entries(modules)) {
		const post = (await resolver()) as PostModule;
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';

		if (post.metadata.draft) continue;

		posts.push({
			slug,
			metadata: post.metadata
		});
	}

	// Static pages
	const staticPages = ['', '/posts'];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${staticPages
		.map(
			(page) => `
  <url>
    <loc>${siteUrl}${page}</loc>
    <changefreq>weekly</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`
		)
		.join('')}
  ${posts
		.map(
			(post) => `
  <url>
    <loc>${siteUrl}/posts/${post.slug}</loc>
    <lastmod>${post.metadata.updated || post.metadata.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
		)
		.join('')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
