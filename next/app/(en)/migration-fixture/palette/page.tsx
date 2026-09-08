import type { Metadata } from 'next';

/**
 * Slice 2 command-palette spike route — scaffolding, deleted at Slice 4.
 *
 * WHY THE ROUTE OUTLIVED ITS SPIKE COMPONENT. The palette now mounts in the
 * locale layout, so this page owns no palette state, no post payload and no
 * host of its own: it is a stable, low-noise page for the browser probes to
 * drive the REAL mount on. `PaletteSpike` was deleted with PR 2b — keeping it
 * would have put a second host and a second chord listener on this one route,
 * where every palette assertion is made.
 *
 * The mapping that used to live here moved to `@/palette/server-posts`, which
 * both locale layouts call; the ordering contract (row I7) went with it.
 */
export const metadata: Metadata = {
	title: 'Slice 2 palette spike',
	description: 'Slice 2 verification fixture: the fuzzy command palette, Cmd/Ctrl+K.',
	robots: { index: false, follow: false },
};

/** The comparator reads a stable page; the palette itself opens on a chord. */
export default function PaletteSpikePage() {
	return (
		<main>
			<h1>Slice 2 palette spike</h1>
			<p>
				Press <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>P</kbd>) to open the palette.
			</p>
		</main>
	);
}
