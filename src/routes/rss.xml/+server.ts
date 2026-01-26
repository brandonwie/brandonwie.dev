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
const siteName = 'Brandon Wie';
const siteDescription = 'Software engineering insights, tutorials, and learnings';

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

	// Sort by date (newest first)
	posts.sort((a, b) => new Date(b.metadata.date).getTime() - new Date(a.metadata.date).getTime());

	const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${siteName}</title>
    <description>${siteDescription}</description>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${posts
			.map(
				(post) => `
    <item>
      <title><![CDATA[${post.metadata.title}]]></title>
      <description><![CDATA[${post.metadata.description}]]></description>
      <link>${siteUrl}/posts/${post.slug}</link>
      <guid isPermaLink="true">${siteUrl}/posts/${post.slug}</guid>
      <pubDate>${new Date(post.metadata.date).toUTCString()}</pubDate>
      ${post.metadata.tags.map((tag) => `<category>${tag}</category>`).join('\n      ')}
    </item>`
			)
			.join('')}
  </channel>
</rss>`;

	return new Response(rss, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
