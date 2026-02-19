/**
 * +page.ts - Korean Home Page Data Loader
 *
 * Loads all Korean blog posts for the FuzzyFinder search.
 * Falls back to English posts if Korean translation doesn't exist.
 */
import type { PageLoad } from "./$types";
import type { PostMetadata } from "$lib/stores/posts";

const modules = import.meta.glob("../../content/posts/ko/**/*.md", {
  import: "metadata",
  eager: true,
}) as Record<string, PostMetadata>;

export const load: PageLoad = () => {
  const posts: PostMetadata[] = [];

  for (const [path, metadata] of Object.entries(modules)) {
    if (metadata.draft) continue;

    const slug = path.split("/").pop()?.replace(".md", "") ?? "";
    posts.push({ slug, ...metadata });
  }

  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { posts };
};
