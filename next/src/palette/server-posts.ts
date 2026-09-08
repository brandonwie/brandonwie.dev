import { sourceDate } from '@/content/article-contract';
import { listPublishedPosts } from '@/content/posts';
import type { Locale } from '@/i18n/locale';
import type { PalettePost } from '@/palette/items';
import { orderPostsForPalette } from '@/palette/post-order';

/**
 * The palette's post payload, produced on the server.
 *
 * WHY A MODULE AND NOT A MAPPING AT THE MOUNT. `listPublishedPosts` reaches the
 * filesystem (`@/content/posts` imports `node:fs`), so it can only run on the
 * server, while the palette host is a Client Component. Both locale layouts
 * need the same payload in the same order, and the Slice 2 spike page carried
 * this mapping inline. One module keeps `node:fs` on the server side of the
 * boundary and gives the ordering contract (row I7) a single call site instead
 * of one copy per layout.
 *
 * WHY `sourceDate` AND NOT `String(date)`. gray-matter hands back a real `Date`
 * for an unquoted YAML date, and `String(Date)` is a timezone- and
 * ICU-dependent local string: it would render
 * "Tue Jan 27 2026 09:00:00 GMT+0900 (Korean Standard Time)" where the Svelte
 * palette renders the ISO value, show the PREVIOUS calendar day on any builder
 * west of UTC, and make the exported bytes a function of the build machine's
 * clock. `feeds.ts` and `article-json-ld.ts` already use this helper.
 */
export function palettePosts(locale: Locale): PalettePost[] {
	return orderPostsForPalette(listPublishedPosts(locale)).map((post) => ({
		slug: post.slug,
		title: post.frontmatter.title,
		description: post.frontmatter.description,
		date: sourceDate(post.frontmatter.date) ?? '',
		tags: post.frontmatter.tags,
		category: post.frontmatter.category,
	}));
}
