---
title: Wrap Skill Follow-Up Persistence Architecture
description: 'When a session-state dashboard regenerates from a single source (today''s journal), unresolved follow-ups from prior sessions vanish silently on every rebuild. Compounded with single-source discovery and conversation-only mentions, follow-ups disappear three ways at once. The fix is a 4-layer architecture.'
date: 2026-04-25T00:00:00.000Z
updated: '2026-08-02'
tags:
  - devops
  - claude-code
  - skill-design
  - session-state
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://git-scm.com/docs/git-merge'
    title: 'git-merge documentation — --ff / --no-ff'
    type: official
  - url: 'https://github.com/DavidAnson/markdownlint/blob/main/doc/md041.md'
    title: 'markdownlint MD041 — first-line-heading'
    type: official
source_content_hash: 94b743d389bb5aa18c4b92817a7fc24f5d9dde6cad40e80ff74b05eacccfd517
---

When a session-state dashboard regenerates from a single source (e.g., today's journal), unresolved follow-ups from prior sessions vanish silently on every rebuild. Compounded with single-source discovery and conversation-only mentions, follow-ups disappear three ways at once. The fix is a 4-layer architecture that defends against each loss mode independently.

## The four loss modes

1. **Full-overwrite regeneration** — Priorities section rebuilt only from today's signal, dropping yesterday's unresolved items.
2. **Single-source discovery** — only one file pattern scanned; project-level "Next Session" sections in `projects/{p}/todos.md` invisible.
3. **Conversation-only follow-ups** — "next session: do X" mentioned but never journaled die at `/clear`.
4. **Untagged items** — entries lacking `(project)` prefix can't route downstream.

The system here is my own session-wrap skill. `/wrap` runs a fixed sequence of numbered steps at the end of a coding session — journal what happened, then regenerate `ACTIVE-STATUS.md`, a dashboard of what is still open across projects. The step numbers below (5.65, 5.7, 9) are positions in that sequence, and v1.3.0 is a version of that skill, not of anything you can install.

## Design evolution: 2026-04-28 → 2026-04-30

The original v1.3.0 design did in-skill carry-forward merge of prior ACTIVE-STATUS Priorities. By 2026-04-28, Step 5.7 was replaced by `scripts/regenerate-active-status.js`, a Node generator with `.agents/locks/active-status.lock`. Two reasons drove the change:

1. **Parallel-wrap concurrency safety.** When two /wrap sessions race on the same dashboard, carry-forward merge can lose updates. The generator acquires a lock + treats `ACTIVE-STATUS.md` as durable-source-only output (never reads prior dashboard state).
2. **Single source of truth.** Carry-forward implicitly trusted the dashboard's prior content as state; durable-source-only reads journal + project todos.md + actives folders directly. The dashboard reflects them, not the other way around.

The carry-forward test case became design-obsolete with this shift; the remaining merge logic (multi-source scan, resolution drop, dedup, tag derivation) all moved into the generator's `collectPriorities` + `collectProjectFollowups` + `withProject` functions, covered by 20 unit tests in `scripts/regenerate-active-status.test.js` (all green as of 2026-04-30 close).

Both steps shipped as commits in my own tooling repo, which is private — so the design is the transferable part here, not the diff.

## The four-layer pipeline

```text
┌─────────────────────────────────────────────────────────────┐
│  Step 5.65 (NEW): Conversation Follow-Up Extraction         │
│   keywords → orphan_followups → batched persistence prompt  │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5.7 sub-step 1: 4-source merge                        │
│                                                             │
│  prior_priorities (ACTIVE-STATUS)                           │
│    ∪ today_next (journal ### Next, project-tagged)          │
│    ∪ file_followups (canonical fallback chain):             │
│        - projects/{p}/actives/*/todos.md (open checkboxes)  │
│        - projects/{p}/todos.md § ## Next Session            │
│        - projects/{p}/PROGRESS.md § ## Next Session         │
│    − resolved (now [x] or in journal Done)                  │
│    → dedup ≥85% fuzzy → cap 15                              │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 9: Persistence Audit                                  │
│   counts per source + potentially_lost + untagged_warnings  │
└─────────────────────────────────────────────────────────────┘
```

## Key invariants

- **Durable-source-only, not merge.** ACTIVE-STATUS regenerates from journals + project files directly. No carry-forward of prior dashboard state. Lock-protected for parallel-wrap safety.
- **Original merge intent preserved at the durable-source layer:** `prior_priorities ∪ today_signal ∪ file_sources − resolved`, with fuzzy ≥85% dedup and a cap to prevent unbounded growth.
- **Multi-source additive scan** — collect from every source that exists, not first-match. Each source has a documented purpose (per-task vs project-level vs legacy fallback).
- **Conversation extraction with persistence prompt** — keyword-triggered (`next session`, `follow-up`, `TODO:`, `come back to`, `defer`, EN+KR), one batched `AskUserQuestion`, options route orphans to journal Next / project todos.md / active task / Skip.
- **Soft enforcement, not hard block** — derive `(project)` tag from parent `## Session:` header automatically; warn on ambiguous; never block /wrap.
- **Audit-trail in final report** — Persistence Audit emits counts per source, lists potentially-lost (Skip choices) + untagged warnings. User gets visual confirmation nothing slipped through silently.

## What broke during implementation

Three things tripped the rollout:

- **Pre-commit hook flattened the merge commit** when `--no-ff` was specified on a clean fast-forward path. Git documents `--no-ff` as creating a merge commit [in all cases, even when the merge could instead be resolved as a fast-forward](https://git-scm.com/docs/git-merge) — the hook rewrote it anyway. Effect was cosmetic (linear history vs branch context lost) but worth knowing.
- **`.me.md` protection hook blocks creation** as well as edits. Workaround: use plain `index.md` for AI-authored task summaries; reserve `.me.md` for human-authored seed docs only. The lesson generalizes: a guard written as "never touch this file" usually also means "never bring it into existence," so check which verb your hook actually blocks before you rely on it.
- **Markdownlint [MD041](https://github.com/DavidAnson/markdownlint/blob/main/doc/md041.md)** counts the first non-frontmatter line; H2 before H1 fails. Plan files need H1 immediately after frontmatter. The rule does skip files whose front matter carries a `title` property, which is why blog-style docs pass and plan files do not. I wrote that rule up separately in [Markdownlint Pre-Commit: MD041 + MD001 Heading Gotchas](/posts/markdownlint-pre-commit-heading-rules).

## When this fits

This pattern fits any cross-session state dashboard (priorities lists, task trackers, follow-up surfaces) that regenerates each session, skills that summarize work across multiple persistent surfaces (journal + project files + actives folders), and any tool where conversation-only mentions need to survive context clears. It does not fit single-source state where overwrite is intentional (generated reports that should reflect only the latest snapshot), real-time dashboards where carry-forward would mask current state, or throwaway debug output.

## Practical takeaway

Cross-session state survives only when every loss mode has a defense. Durable-source-only regeneration kills the overwrite mode. Multi-source additive scanning kills the discovery mode. Keyword-triggered conversation extraction with a single batched prompt kills the conversation-only mode. Auto-derived project tags + soft warnings kill the untagged mode. The generator+lock pattern (vs in-skill merge) is what makes the architecture safe under parallel-wrap concurrency — and it's worth the extra Node script even for a one-user tool.

## References

- [git-merge documentation — `--ff` / `--no-ff`](https://git-scm.com/docs/git-merge)
- [markdownlint MD041 — first-line-heading](https://github.com/DavidAnson/markdownlint/blob/main/doc/md041.md)
