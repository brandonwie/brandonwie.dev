---
title: Checklist beats prose for LLM-robust skill preconditions
description: Compound preconditions written in prose form get silently misapplied under context pressure. Restructuring them as explicit checkbox checklists with one box per clause makes the precondition LLM-robust — and surfaces implicit clauses that turn out to be the actual bugs.
date: 2026-04-25T00:00:00.000Z
updated: 2026-05-06
tags:
  - general
  - skill-authoring
  - claude-code
  - llm-prompts
  - instructions
  - robustness
category: general
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/slash-commands
    title: Claude Code — Slash Commands
    type: official
  - url: 'https://www.anthropic.com/research/checklist-prompts'
    title: Anthropic — Prompting Best Practices for Long Instructions
    type: authoritative
source_content_hash: ca5171fb85830a6974d29fc960a42275cd1052e617e1c5f25b8ee5bdc5071cb8
---

Skills written for Claude Code are markdown text interpreted by the LLM each invocation. Compound preconditions written in prose form (`If A AND B → do X`) get silently misapplied under context pressure. There is no compiler, no type checker, and no test that catches a misread.

The symptom that surfaced this: a `/wrap` skill instruction wrote

> If `blog.published_at` is NOT null AND Level 2 changes were made → set `blog.needs_resync: true`

Across multiple sessions, six entries ended up with `needs_resync: true` despite `published_at: null`. The precondition was clear in the text and the LLM "knew" it, but the compound form invited skipping the first clause when the second clause was salient. Drift accumulated.

This is not a Claude-specific failure mode. Long instructions with implicit conjunctions are misapplied by humans too. Checklists exist in surgery and aviation precisely because compound preconditions get silently dropped under load.

## Restructure compound preconditions as checkboxes

The fix is to convert compound prose into **explicit checkbox checklists** with one box per clause, then add a single failure-mode line that names what happens when any box is unchecked.

Before (prose):

```text
**Level 3 — Blog resync flag (conditional):**
- If `blog.published_at` is NOT null AND Level 2 changes were made
  → set `blog.needs_resync: true`
```

After (checklist):

```text
**Level 3 — Blog resync flag (conditional):**

Before setting `blog.needs_resync: true`, verify ALL of these:

- [ ] `blog.publishable` is `true`
- [ ] `blog.ready` is `true`
- [ ] `blog.published_at` is NOT null
- [ ] Level 2 (content) changes were made in this session

If ANY box is unchecked, do NOT set the flag — the entry is in a state
where re-sync is meaningless or impossible.
```

The checklist forces the LLM to evaluate each precondition independently. The "If ANY box is unchecked" rule converts implicit-AND into explicit-fail-fast. New preconditions surfaced during the rewrite — `blog.ready: true` was missing from the original prose form because the setter "obviously" only fires when the entry is publishable. The implicit assumption had been silently broken.

## Why the bug lived in the instruction layer

Three things made this a hard bug to find:

- **Searching for code paths that wrote `needs_resync: true` on never-published entries turned up nothing.** There was no code, just a misread instruction. The fix had to be at the instruction layer.
- **The implicit clause was the bug.** The original prose form folded `blog.ready: true` implicitly. The rewrite forced the implicit assumption out into the open and revealed it had been missing all along.
- **Manual cleanup did not stop the recurrence.** A previous /wrap session manually cleared three stale flags. The pattern returned with six new flags within five days. Symptom-only repair confirms the bug is in the setter, not the data.

## When this fits

Use a checklist when:

- The skill instruction has a compound conditional precondition.
- The setter mutates state where the cost of error is high.
- The instruction has produced silent misapplication in practice.

Skip the checklist when the precondition is single-clause (one boolean check — prose is fine; a one-item checklist looks ceremonial), when the guidance is stylistic ("write in second person," "use Mermaid not ASCII" — prose with examples reads better), or when the cost of misapplication is recoverable and cheap (e.g., a draft formatter that runs again on the next /wrap).

## Practical takeaway

Compound prose preconditions in skill markdown get silently misapplied under context pressure. Checkbox checklists are LLM-robust because they force evaluation of each clause independently. One precondition per checkbox — never `AND` inside a single checkbox. Add one explicit "If ANY box is unchecked" line; implicit short-circuiting is what fails. Pair the checklist with a defense-in-depth data-layer check (validator, reconciliation pass, schema constraint) when misapplication is expensive. And use the rewrite as an opportunity to surface implicit clauses — they are usually the bugs.

## References

- [Claude Code — Slash Commands](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/slash-commands)
- [Anthropic — Prompting Best Practices for Long Instructions](https://www.anthropic.com/research/checklist-prompts)
