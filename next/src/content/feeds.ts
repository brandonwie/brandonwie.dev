import { SITE_URL } from '../../../src/lib/seo';
import { sourceDate } from './article-contract';
import { listPublishedPosts, type Locale, type PublishedPost } from './posts';

/**
 * Sitemap and RSS for the Next candidate.
 *
 * These are ports of three SvelteKit endpoints, template for template:
 *
 *   src/routes/sitemap.xml/+server.ts
 *   src/routes/rss.xml/+server.ts
 *   src/routes/ko/rss.xml/+server.ts
 *
 * The templates are kept byte-identical on purpose. `scripts/migration-verify.ts`
 * compares the feeds SEMANTICALLY (item counts, ordering, links, titles), and
 * that is the acceptance bar in plan.md AC5, but `assert-publishing-surfaces.ts`
 * also holds the candidate to the Svelte build's exact bytes minus
 * `<lastBuildDate>`, because "semantically equal" leaves room for a port that
 * quietly drops `hreflang` alternates or `<lastmod>` -- neither of which the
 * semantic shape sees.
 *
 * Two source-format facts decide the date handling:
 *
 *   - mdsvex serialises frontmatter to JSON before it reaches the Svelte
 *     endpoint, so an unquoted YAML date arrives there as an ISO string
 *     (`2026-01-28T00:00:00.000Z`) and is printed as such in `<lastmod>`.
 *     gray-matter hands this package a `Date` for the same source line, so
 *     `sourceDate` restores the ISO form before anything is interpolated.
 *   - `effectiveDate` is `src/lib/utils/date.ts` verbatim; it cannot be
 *     imported because that module pulls in the Paraglide runtime.
 */

const siteUrl = SITE_URL;
const siteName = 'Brandon Wie';

const SITE_DESCRIPTION: Record<Locale, string> = {
	en: 'Software engineering insights, tutorials, and learnings',
	ko: '소프트웨어 엔지니어링 인사이트, 튜토리얼, 배움',
};

/** Returns updated date if available and different from date, otherwise date. */
export function effectiveDate(date: string, updated?: string): string {
	if (!updated) return date;
	return new Date(updated).getTime() !== new Date(date).getTime() ? updated : date;
}

interface FeedPost {
	slug: string;
	title: string;
	description: string;
	date: string;
	updated?: string;
	tags: string[];
}

function feedPost(post: PublishedPost): FeedPost {
	const meta = post.frontmatter;
	return {
		slug: post.slug,
		title: meta.title,
		description: meta.description,
		date: sourceDate(meta.date) as string,
		updated: sourceDate(meta.updated),
		tags: meta.tags,
	};
}

/** Newest activity first; ties keep the caller's (path-sorted) order, as `Array.prototype.sort` is stable. */
function byRecentActivity(a: FeedPost, b: FeedPost): number {
	return (
		new Date(effectiveDate(b.date, b.updated)).getTime() -
		new Date(effectiveDate(a.date, a.updated)).getTime()
	);
}

// Static pages (both languages)
const staticPages = [
	{ en: '', ko: '/ko', priority: '1.0' },
	{ en: '/about', ko: '/ko/about', priority: '0.8' },
	{ en: '/study', ko: '/ko/study', priority: '0.8' },
	{ en: '/study/dsa-i', ko: '/ko/study/dsa-i', priority: '0.7' },
	{ en: '/study/dsa-ii', ko: '/ko/study/dsa-ii', priority: '0.7' },
	{ en: '/study/dsa-iii', ko: '/ko/study/dsa-iii', priority: '0.7' },
	{ en: '/study/dsa-iv', ko: '/ko/study/dsa-iv', priority: '0.7' },
	{ en: '/posts', ko: '/ko/posts', priority: '0.8' },
	{ en: '/tags', ko: '/ko/tags', priority: '0.5' },
	{ en: '/projects', ko: '/ko/projects', priority: '0.7' },
	{ en: '/contact', ko: '/ko/contact', priority: '0.6' },
	{ en: '/system', ko: '/ko/system', priority: '0.5' },
	{ en: '/system/3b', ko: '/ko/system/3b', priority: '0.7' },
];

export function sitemapXml(): string {
	const koSlugs = new Set(listPublishedPosts('ko').map((post) => post.slug));
	const posts = listPublishedPosts('en').map((post) => ({
		...feedPost(post),
		hasKorean: koSlugs.has(post.slug),
	}));

	return `<?xml version="1.0" encoding="UTF-8"?>
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
    ${
			post.hasKorean
				? `<xhtml:link rel="alternate" hreflang="ko" href="${siteUrl}/ko/posts/${post.slug}"/>`
				: ''
		}
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/posts/${post.slug}"/>
    <lastmod>${post.updated || post.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>${
		post.hasKorean
			? `
  <url>
    <loc>${siteUrl}/ko/posts/${post.slug}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}/posts/${post.slug}"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${siteUrl}/ko/posts/${post.slug}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/posts/${post.slug}"/>
    <lastmod>${post.updated || post.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
			: ''
	}`,
		)
		.join('')}
</urlset>`;
}

/**
 * The English feed lists English posts only. The Korean feed lists every
 * Korean post and then falls back to the English post for each slug that has
 * no translation -- the Korean reader sees the whole corpus, in Korean where
 * a translation exists.
 */
function feedPosts(locale: Locale): FeedPost[] {
	if (locale === 'en') return listPublishedPosts('en').map(feedPost).sort(byRecentActivity);

	const korean = listPublishedPosts('ko').map(feedPost);
	const koSlugs = new Set(korean.map((post) => post.slug));
	const fallback = listPublishedPosts('en')
		.filter((post) => !koSlugs.has(post.slug))
		.map(feedPost);
	return [...korean, ...fallback].sort(byRecentActivity);
}

export function rssXml(locale: Locale): string {
	const posts = feedPosts(locale);
	const prefix = locale === 'ko' ? '/ko' : '';

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${siteName}</title>
    <description>${SITE_DESCRIPTION[locale]}</description>
    <link>${siteUrl}${prefix}</link>
    <atom:link href="${siteUrl}${prefix}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>${locale === 'ko' ? 'ko' : 'en-us'}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${posts
			.map(
				(post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <description><![CDATA[${post.description}]]></description>
      <link>${siteUrl}${prefix}/posts/${post.slug}</link>
      <guid isPermaLink="true">${siteUrl}${prefix}/posts/${post.slug}</guid>
      <pubDate>${new Date(effectiveDate(post.date, post.updated)).toUTCString()}</pubDate>
      ${post.tags.map((tag) => `<category>${tag}</category>`).join('\n      ')}
    </item>`,
			)
			.join('')}
  </channel>
</rss>`;
}

/**
 * Under `output: 'export'` only the body is written to disk; response headers
 * never reach Cloudflare Pages. The Svelte endpoints also sent
 * `Cache-Control: max-age=3600`, but caching for static files is a `_headers`
 * concern, so it is deliberately not restated here.
 */
export function xmlResponse(body: string): Response {
	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
