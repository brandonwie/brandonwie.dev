import type { PageLoad } from "./$types";
import type { PostMetadata } from "$lib/stores/posts";
import { effectiveDate } from "$lib/utils/date";

interface PostEntryWithLang extends PostMetadata {
  lang?: string;
}

// Load Korean posts, with fallback to English
const koModules = import.meta.glob("../../../content/posts/ko/**/*.md", {
  import: "metadata",
  eager: true,
}) as Record<string, PostMetadata>;

const enModules = import.meta.glob("../../../content/posts/en/**/*.md", {
  import: "metadata",
  eager: true,
}) as Record<string, PostMetadata>;

export const load: PageLoad = () => {
  const posts: PostEntryWithLang[] = [];
  const koSlugs = new Set<string>();

  // First, load Korean posts
  for (const [path, metadata] of Object.entries(koModules)) {
    if (metadata.draft) continue;

    const slug = path.split("/").pop()?.replace(".md", "") ?? "";
    koSlugs.add(slug);
    posts.push({ slug, ...metadata, lang: "ko" });
  }

  // Then, load English posts that don't have Korean translations
  for (const [path, metadata] of Object.entries(enModules)) {
    if (metadata.draft) continue;

    const slug = path.split("/").pop()?.replace(".md", "") ?? "";
    if (koSlugs.has(slug)) continue;

    posts.push({ slug, ...metadata, lang: "en" });
  }

  posts.sort(
    (a, b) =>
      new Date(effectiveDate(b.date, b.updated)).getTime() -
      new Date(effectiveDate(a.date, a.updated)).getTime(),
  );

  return { posts };
};
