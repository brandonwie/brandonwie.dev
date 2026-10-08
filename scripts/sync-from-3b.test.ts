/**
 * Regression guard: sync write-back to a 3B source must change only the
 * blog.last_synced / blog.published_at / blog.needs_resync lines and leave every
 * other byte identical (friction obs-2026-05-31-001: stringifyYaml reformatted
 * whole frontmatter blocks).
 *
 * Fixtures are copies of two real 3B knowledge files with their original
 * formatting (lists shortened, bodies replaced, ALL_KEYS' needs_resync set to
 * true to exercise the flip); the test writes only to a temp dir.
 *
 * Run: deno test --allow-read --allow-write --allow-env scripts/sync-from-3b.test.ts
 */
import { assertEquals, assertThrows } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { updateSourceFile, upsertBlogKeyInPlace } from './sync-from-3b.ts';

const TODAY = '2026-10-08';

// Copy of knowledge/ai-ml/dont-retry-retrieval-diagnose-it.md — all three keys present.
const ALL_KEYS = `---
tags: [ai-ml, agent-architecture, rag, failure-routing, transferable]
created: 2026-05-24
updated: 2026-05-24
status: completed
confidence: high
source: personal-research
projects: [3b]
aliases:
  - "don't retry retrieval"
  - "diagnose don't retry"
  - "failure as diagnostic signal"
  - "retry trap"
  - "post-retrieval failure diagnosis"
privacy: public
source_type: distilled
related:
  - path: ./typed-routing-vs-binary-gating.md
    context:
      "Core pattern — diagnose the failure class, apply a class-specific
      corrective action instead of retrying the same primitive. This synthesis
      is the practitioner-facing umbrella over that concept."
  - path: ./parsimony-principle-taxonomy-design.md
    context:
      "Why the corrective vocabulary must stay small — Wei's t-SNE shows >6
      skills collapses the cluster structure routing depends on."
references:
  - url: "https://arxiv.org/abs/2604.15771"
    type: authoritative
    title:
      "Skill-RAG: Failure-State-Aware Retrieval Augmentation via Hidden-State
      Probing and Skill Routing"
    author: "Wei et al. (2026)"
    verified_date: 2026-05-24
    notes:
      "Primary source. Numbers verified against the PDF: Table 1 (Gemma2-9B), §
      4.4 Case Study (the 'Japanese rock band' retry drift), § 5 Conclusion."
blog:
  publishable: true
  ready: true
  published_at: "2026-05-25"
  last_synced: "2026-05-25"
  exclude_reason: null
  needs_resync: true
when_used:
  - date: 2026-05-24
    project: 3b
    context:
      "Synthesis entry created as the canonical blog source for the 'Don't Retry
      Retrieval' post (cross-entry synthesis over 4 Wei notes)."
---

# Don't Retry Retrieval — Diagnose It

Body text stays untouched.
`;

// Copy of knowledge/frontend/no-fouc-theme-toggle.md — no last_synced key.
const NO_LAST_SYNCED = `---
tags:
  - frontend
  - svelte
  - sveltekit
  - theming
created: 2026-06-16
updated: 2026-06-16
status: completed
source: brandonwie.dev
related:
  - path: ./tailwind-v4-semantic-token-aliasing.md
    reason:
      This toggle flips the runtime CSS vars that the token-aliasing pattern
      exposes.
when_used:
  - date: 2026-06-16
    project: brandonwie.dev
    context:
      Dark-default blog with a light-mode toggle, no theme flash on first paint
    journal: ../../journals/2026/06/2026-06-16.md
blog:
  publishable: true
  ready: false
  published_at: null
  exclude_reason: null
  needs_resync: false
---

# No-FOUC Theme Toggle

Body text stays untouched.
`;

/** Replace one exact, unique line; fails loudly if the line is not unique. */
function swapLine(text: string, from: string, to: string): string {
	assertEquals(text.split(from).length, 2, `expected exactly one "${from}"`);
	return text.replace(from, to);
}

async function runUpdate(content: string, isFirstSync: boolean): Promise<string> {
	const path = await Deno.makeTempFile({ suffix: '.md' });
	try {
		await Deno.writeTextFile(path, content);
		await updateSourceFile(path, content, isFirstSync, TODAY);
		return await Deno.readTextFile(path);
	} finally {
		await Deno.remove(path);
	}
}

Deno.test('re-sync of a file with all three keys changes only those lines', async () => {
	let expected = swapLine(ALL_KEYS, '  last_synced: "2026-05-25"\n', `  last_synced: "${TODAY}"\n`);
	expected = swapLine(expected, '  needs_resync: true\n', '  needs_resync: false\n');
	assertEquals(await runUpdate(ALL_KEYS, false), expected);
});

Deno.test('first sync of a file missing last_synced inserts it after blog: only', async () => {
	let expected = swapLine(NO_LAST_SYNCED, 'blog:\n', `blog:\n  last_synced: "${TODAY}"\n`);
	expected = swapLine(expected, '  published_at: null\n', `  published_at: "${TODAY}"\n`);
	assertEquals(await runUpdate(NO_LAST_SYNCED, true), expected);
});

Deno.test('a matching key outside the blog: block is never touched', () => {
	const src =
		'---\nlast_synced: keep\nblog:\n  ready: true\nother:\n  last_synced: keep\n---\nbody\n';
	assertEquals(
		upsertBlogKeyInPlace(src, 'last_synced', '"x"'),
		'---\nlast_synced: keep\nblog:\n  last_synced: "x"\n  ready: true\nother:\n  last_synced: keep\n---\nbody\n',
	);
});

Deno.test('a trailing comment on the replaced line is kept', () => {
	const src = '---\nblog:\n  needs_resync: true # queued\n---\n';
	assertEquals(
		upsertBlogKeyInPlace(src, 'needs_resync', 'false'),
		'---\nblog:\n  needs_resync: false # queued\n---\n',
	);
});

Deno.test('missing frontmatter or block-style blog: throws', () => {
	assertThrows(() => upsertBlogKeyInPlace('# no frontmatter\n', 'k', 'v'), Error, 'no frontmatter');
	assertThrows(
		() => upsertBlogKeyInPlace('---\ntags: []\n---\n', 'k', 'v'),
		Error,
		'no block-style',
	);
	assertThrows(
		() => upsertBlogKeyInPlace('---\nblog: { publishable: true, ready: false }\n---\n', 'k', 'v'),
		Error,
		'no block-style',
	);
});
