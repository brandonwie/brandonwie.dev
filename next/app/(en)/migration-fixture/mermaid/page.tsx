import type { Metadata } from 'next';

import Mermaid from '@/components/Mermaid';

/**
 * S9 fixture route -- Slice 2 scaffolding, deleted at Slice 4.
 *
 * WHY A FIXTURE ROUTE AND NOT A REAL POST. `compile-corpus.ts` already proves
 * the pipeline half of mermaid over all 334 content files and fails closed on
 * "a mermaid fence did not become a component" and "a mermaid fence reached the
 * highlighter". What it cannot prove is the BROWSER half: that a diagram the
 * renderer rejects ends up visibly distinct from one it accepts. Adding a real
 * mermaid post to prove that would create two new compared pages of up to
 * fifteen comparator fields each and pull the whole Slice 3 article-parity
 * obligation forward onto a second, harder article. This route costs exactly
 * one comparator difference -- `present in candidate, absent from baseline` --
 * and one ledger entry approving it.
 *
 * WHY `migration-fixture/` AND NOT `__migration/`. Next treats a folder whose
 * name starts with an underscore as a PRIVATE folder and excludes it from
 * routing -- silently. The first spelling of this route built clean, emitted no
 * warning, and produced no page at all; the export went from seven HTML files
 * to seven. A ledger entry written from the intended URL would have matched
 * nothing and been stale on arrival. Any name outside the framework's reserved
 * prefixes works; this one says what the directory is for.
 *
 * WHY IT IS LEDGERED AND NOT SKIPPED. A skip is a code path that hides pages
 * from the comparator; nobody reads it again. A ledger entry is visible and
 * self-cleaning: when Slice 4 deletes this directory the entry stops matching
 * anything, is counted stale, and fails the run until it is removed too. That
 * only became true with the page-row fingerprint fix in `compare()` -- before
 * it, a page-presence difference carried no fingerprint, so an entry aimed at
 * one was stale the moment it was written.
 *
 * The two fences below are the fixture. `VALID_FENCE` is ordinary flowchart
 * source. `INVALID_FENCE` names a diagram type mermaid does not have, so its
 * parser throws and the component takes its error branch. Both render as
 * `data-mermaid` in the export -- the server has not tried to draw either --
 * and they diverge only once the client has run, which is the property S9
 * exists to hold onto.
 */
export const metadata: Metadata = {
	title: 'C11 mermaid fixture',
	description: 'Slice 2 verification fixture: one renderable fence and one the renderer rejects.',
	robots: { index: false, follow: false },
};

export const VALID_FENCE = `flowchart LR
    A[Source] --> B[Process]
    B --> C[Output]`;

export const INVALID_FENCE = `notADiagramType XYZ
    this line cannot parse under any mermaid grammar`;

export default function MermaidFixturePage() {
	return (
		<main>
			<h1>C11 mermaid fixture</h1>
			<section data-fixture="valid">
				<h2>Renderable</h2>
				<Mermaid code={VALID_FENCE} />
			</section>
			<section data-fixture="invalid">
				<h2>Rejected by the renderer</h2>
				<Mermaid code={INVALID_FENCE} />
			</section>
		</main>
	);
}
