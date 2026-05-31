---
title: Wrap Skill Follow-Up Persistence Architecture
description: 'When a session-state dashboard regenerates from a single source (today''s journal), unresolved follow-ups from prior sessions vanish silently on every rebuild. Compounded with single-source discovery and conversation-only mentions, follow-ups disappear three ways at once. The fix is a 4-layer architecture.'
date: 2026-04-25T00:00:00.000Z
updated: 2026-05-06
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
  - url: 'https://docs.github.com/en/actions/using-workflows'
    title: GitHub Actions — Using workflows
    type: official
  - url: 'https://github.com/brandonwie/3b/commit/46e23c05'
    title: 'feat(wrap): persist follow-ups across sessions'
    type: experience
  - url: 'https://github.com/brandonwie/3b/commit/28ab7012'
    title: 'feat(wrap): durable-source ACTIVE-STATUS generator with parsing fixes'
    type: experience
source_content_hash: 2aa4f7878531a0b3d3ac795e8923b134312ab6130ece1cd8d3e26c120068d980
---

When a session-state dashboard regenerates from a single source (e.g., today's journal), unresolved follow-ups from prior sessions vanish silently on every rebuild. Compounded with single-source discovery and conversation-only mentions, follow-ups disappear three ways at once. The fix is a 4-layer architecture that defends against each loss mode independently.

## The four loss modes

1. **Full-overwrite regeneration** — Priorities section rebuilt only from today's signal, dropping yesterday's unresolved items.
2. **Single-source discovery** — only one file pattern scanned; project-level "Next Session" sections in `projects/{p}/todos.md` invisible.
3. **Conversation-only follow-ups** — "next session: do X" mentioned but never journaled die at `/clear`.
4. **Untagged items** — entries lacking `(project)` prefix can't route downstream.

## Design evolution: 2026-04-28 → 2026-04-30

The original v1.3.0 design did in-skill carry-forward merge of prior ACTIVE-STATUS Priorities. By 2026-04-28, Step 5.7 was replaced by `scripts/regenerate-active-status.js`, a Node generator with `.agents/locks/active-status.lock`. Two reasons drove the change:

1. **Parallel-wrap concurrency safety.** When two /wrap sessions race on the same dashboard, carry-forward merge can lose updates. The generator acquires a lock + treats `ACTIVE-STATUS.md` as durable-source-only output (never reads prior dashboard state).
2. **Single source of truth.** Carry-forward implicitly trusted the dashboard's prior content as state; durable-source-only reads journal + project todos.md + actives folders directly. The dashboard reflects them, not the other way around.

Tests 1 (carry-forward) became design-obsolete with this shift; the remaining merge logic (multi-source scan, resolution drop, dedup, tag derivation) all moved into the generator's `collectPriorities` + `collectProjectFollowups` + `withProject` functions, covered by 20 unit tests in `scripts/regenerate-active-status.test.js` (all green as of 2026-04-30 close).

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

- **Pre-commit hook flattened the merge commit** when `--no-ff` was specified on a clean fast-forward path. Effect was cosmetic (linear history vs branch context lost) but worth knowing.
- **`.me.md` protection hook blocks creation** as well as edits. Workaround: use plain `index.md` for AI-authored task summaries; reserve `.me.md` for human-authored seed docs only. See related entry.
- **Markdownlint MD041** counts the first non-frontmatter line; H2 before H1 fails. Plan files need H1 immediately after frontmatter. See related entry.

## When this fits

This pattern fits any cross-session state dashboard (priorities lists, task trackers, follow-up surfaces) that regenerates each session, skills that summarize work across multiple persistent surfaces (journal + project files + actives folders), and any tool where conversation-only mentions need to survive context clears. It does not fit single-source state where overwrite is intentional (generated reports that should reflect only the latest snapshot), real-time dashboards where carry-forward would mask current state, or throwaway debug output.

## Practical takeaway

Cross-session state survives only when every loss mode has a defense. Durable-source-only regeneration kills the overwrite mode. Multi-source additive scanning kills the discovery mode. Keyword-triggered conversation extraction with a single batched prompt kills the conversation-only mode. Auto-derived project tags + soft warnings kill the untagged mode. The generator+lock pattern (vs in-skill merge) is what makes the architecture safe under parallel-wrap concurrency — and it's worth the extra Node script even for a one-user tool.

## References

- [GitHub Actions — Using workflows](https://docs.github.com/en/actions/using-workflows)
- [feat(wrap): persist follow-ups across sessions](https://github.com/brandonwie/3b/commit/46e23c05)
- [feat(wrap): durable-source ACTIVE-STATUS generator with parsing fixes](https://github.com/brandonwie/3b/commit/28ab7012)
