import type { Metadata } from 'next';

import PaletteSpike from '@/components/palette/PaletteSpike';
import { listPublishedPosts } from '@/content/posts';
import type { PalettePost } from '@/palette/items';

/**
 * Slice 2 command-palette spike route — scaffolding, deleted at Slice 4.
 *
 * WHY A SPIKE ROUTE. The palette is mounted globally in the Svelte root
 * layout, so shipping it into the Next shell would put it on all 366 compared
 * pages at once and make every shell row in the comparator move for a surface
 * that is still being priced. Behind one fixture route it costs exactly one
 * comparator difference.
 *
 * WHY THE POSTS ARE MAPPED HERE. `listPublishedPosts` reads the filesystem, so
 * it only runs on the server; `PaletteItem.run` is a function, which cannot
 * cross to a Client Component. The serializable half goes down as data and the
 * client builds the closures — the Server/Client boundary showing up a second
 * time in this slice, from the opposite direction to the study copy.
 */
export const metadata: Metadata = {
	title: 'Slice 2 palette spike',
	description: 'Slice 2 verification fixture: the fuzzy command palette, Cmd/Ctrl+K.',
	robots: { index: false, follow: false },
};

/** The comparator reads a stable page; the palette itself opens on a chord. */
export default function PaletteSpikePage() {
	const posts: PalettePost[] = listPublishedPosts('en').map((post) => ({
		slug: post.slug,
		title: post.frontmatter.title,
		description: post.frontmatter.description,
		date: String(post.frontmatter.date),
		tags: post.frontmatter.tags,
		category: post.frontmatter.category,
	}));

	return (
		<main>
			<h1>Slice 2 palette spike</h1>
			<p>
				Press <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>P</kbd>) to open the palette.
			</p>
			<PaletteSpike posts={posts} pathname="/migration-fixture/palette" locale="en" />
		</main>
	);
}
