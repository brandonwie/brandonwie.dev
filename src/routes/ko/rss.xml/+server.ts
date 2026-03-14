import type { RequestHandler } from "./$types";
import { effectiveDate } from "$lib/utils/date";

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

const siteUrl = "https://brandonwie.dev";
const siteName = "Brandon Wie";
const siteDescription = "소프트웨어 엔지니어링 인사이트, 튜토리얼, 배움";

export const prerender = true;

export const GET: RequestHandler = async () => {
  // Load Korean posts first, then English as fallback
  const koModules = import.meta.glob("../../../content/posts/ko/**/*.md");
  const enModules = import.meta.glob("../../../content/posts/en/**/*.md");

  const posts: {
    slug: string;
    metadata: PostModule["metadata"];
    lang: string;
  }[] = [];
  const koSlugs = new Set<string>();

  // Load Korean posts
  for (const [path, resolver] of Object.entries(koModules)) {
    const post = (await resolver()) as PostModule;
    const slug = path.split("/").pop()?.replace(".md", "") ?? "";

    if (post.metadata.draft) continue;

    koSlugs.add(slug);
    posts.push({
      slug,
      metadata: post.metadata,
      lang: "ko",
    });
  }

  // Load English posts as fallback (for posts without Korean translation)
  for (const [path, resolver] of Object.entries(enModules)) {
    const post = (await resolver()) as PostModule;
    const slug = path.split("/").pop()?.replace(".md", "") ?? "";

    if (post.metadata.draft) continue;
    if (koSlugs.has(slug)) continue; // Skip if Korean exists

    posts.push({
      slug,
      metadata: post.metadata,
      lang: "en",
    });
  }

  // Sort by most recent activity (newest first)
  posts.sort(
    (a, b) =>
      new Date(effectiveDate(b.metadata.date, b.metadata.updated)).getTime() -
      new Date(effectiveDate(a.metadata.date, a.metadata.updated)).getTime(),
  );

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${siteName}</title>
    <description>${siteDescription}</description>
    <link>${siteUrl}/ko</link>
    <atom:link href="${siteUrl}/ko/rss.xml" rel="self" type="application/rss+xml"/>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${posts
      .map(
        (post) => `
    <item>
      <title><![CDATA[${post.metadata.title}]]></title>
      <description><![CDATA[${post.metadata.description}]]></description>
      <link>${siteUrl}/ko/posts/${post.slug}</link>
      <guid isPermaLink="true">${siteUrl}/ko/posts/${post.slug}</guid>
      <pubDate>${new Date(effectiveDate(post.metadata.date, post.metadata.updated)).toUTCString()}</pubDate>
      ${post.metadata.tags.map((tag) => `<category>${tag}</category>`).join("\n      ")}
    </item>`,
      )
      .join("")}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "max-age=3600",
    },
  });
};
