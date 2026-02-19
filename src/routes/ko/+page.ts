/**
 * +page.ts - Korean Home Page Data Loader
 *
 * Loads all Korean blog posts for the FuzzyFinder search.
 * Falls back to English posts if Korean translation doesn't exist.
 */
import type { PageLoad } from "./$types";
import type { PostMetadata } from "$lib/stores/posts";

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

type PostEntry = PostMetadata;

export const load: PageLoad = async () => {
  // Load Korean posts
  const modules = import.meta.glob("../../content/posts/ko/**/*.md");
  const posts: PostEntry[] = [];

  for (const [path, resolver] of Object.entries(modules)) {
    const post = (await resolver()) as PostModule;
    const slug = path.split("/").pop()?.replace(".md", "") ?? "";

    // Skip drafts in production
    if (post.metadata.draft) continue;

    posts.push({
      slug,
      ...post.metadata,
    });
  }

  // Sort by date (newest first)
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { posts };
};
