---
title: 'Three Gates and an Audit Log: HITL for an Agent Harness'
description: 'The first version of an agent workflow usually has one safety rule: ask before'
date: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T00:00:00.000Z
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: en
references:
  - url: 'https://git-scm.com/docs/githooks'
    title: Git hooks documentation
    type: official
source_content_hash: d11d6acaf6cd044fb36bd255e7504a2fa39c9df106e73d517ddacf12cb38dab3
---

doing something risky.

That rule is better than nothing, but it does not scale. "Risky" is vague. The
agent may not recognize the risky surface. The human may approve one thing while
the actual staged diff has become another thing. A later session may inherit the
rule but not the reason behind it. Eventually the system relies on taste,
memory, and a few scary comments in configuration files.

3B treats governance as architecture.

It uses three gates: one for concurrency, one for pre-mutation human review, and
one for periodic audit review. The gates are not the same kind of mechanism, and
that is the point. Each owns a different failure mode.

## Gate A: do not clobber live handoff state

Gate A is the concurrency gate.

It is not about whether a change is philosophically risky. It is about whether a
parallel session is already writing the small set of files that coordinate work:
`progress.md`, `todos.md`, the buffer, and generated status surfaces.

Before a task moves into branch/worktree setup, the task flow checks dirty
handoff paths and acquires a lock on the task's `progress.md`. Before an agent
edits the same class of handoff document, it must hold the corresponding lock.
If the lock is already held, the edit stops.

This solves a narrow but painful problem. It prevents two sessions from both
rewriting the resume point, both marking the checklist, or both deciding that a
task is ready for the next phase.

Gate A is deliberately mechanical. It does not ask whether the content is wise.
It asks whether this session is allowed to mutate shared state right now.

## Gate B: explain before changing the control plane

Gate B is the human-in-the-loop mutation gate.

It fires on layer-changing surfaces: rules, skills, agent personas, prompts,
ADRs, selected JSON policy stores, and related control-plane files. These are
not ordinary documentation pages. They change how future agents behave.

Gate B requires an explain-before-act payload for non-trivial mutations. The
payload names the intent, affected files, alternatives considered, and risk
fields. The stop gate depends on the mutation type. Some edits are AUTO:
warn-and-proceed. Some require CONFIRM. Higher-blast edits require
DOUBLE_CONFIRM, which means the human sees the intent and then sees the diff
preview before the second approval.

That distinction matters. A typo fix should not cost the same ceremony as a
universal rule edit. But a rule that changes all three agent runtimes should not
be treated like a typo just because it is Markdown.

The contract also has a doc-only carveout. Small prose-only markdown changes can
provisionally bypass the full gate, but the staged diff is rechecked before
commit. If the actual diff touches routing fields, exceeds size thresholds, or
includes non-markdown files, it escalates.

This prevents a common governance failure: the agent says "just docs," then the
final staged tree says something else.

## The sidecar ties approval to the staged tree

Gate B does not rely only on a chat message.

The chosen ADR-031 design writes a structured sidecar:

```text
.agents/gate-b/explain-<staged-tree-hash>.yaml
```

The hash binding is the important part. The approval payload is associated with
the staged tree that will be committed, after formatting and restaging have
happened. That is why the pre-commit validator runs after lint-staged: the final
check needs to validate the final staged content, not an earlier version.

This is a small but serious boundary. Human approval is not just "the user said
yes somewhere in the conversation." It is approval of a described mutation
against a specific staged tree.

## Gate C: review the system's behavior over time

Gate C is not another pre-write blocker.

It is a periodic review surface. It aggregates audit streams and sync health so
the system can see patterns that one session would miss: recurring gate fires,
stale layer drift, doc-audit findings, sync-doctor failures, or governance rules
that create too much ceremony.

This is where the gates become maintainable. A gate that only blocks is easy to
add and hard to tune. A gate with an audit trail can be reviewed. If it catches
real problems, keep it. If it mostly interrupts harmless edits, narrow it. If it
goes quiet for months, consider whether it has earned its context budget.

Governance has to be governed too.

## ADRs store the reason, not just the rule

The gates rely on a decision system underneath them.

3B uses ADRs for architecture-level decisions and Rule-6 README files for
working-folder decisions. ADRs are treated as immutable once accepted. If a
decision changes, the system supersedes it with a new ADR rather than rewriting
history.

That sounds formal, but it solves a practical agent problem. Future sessions do
not only need to know what the rule says. They need to know why the rule exists,
which options were rejected, what the rollback path was, and what tradeoff the
human accepted.

Gate B reinforces this by treating ADR amendments as high-ceremony work. Editing
an accepted decision record is not just another markdown patch; it changes the
historical basis future agents use to reason.

## The self-referential edge is intentional

The strangest part of Gate B is that Gate B governs edits to itself.

That is not a philosophical joke. It is an operational requirement. If the rule
that defines the approval ceremony could be edited without the ceremony, the
control plane would have a hole exactly where it matters most.

So the architecture-wide HITL rule marks itself and related gate-defining files
as self-reinforcing surfaces. Those edits require higher ceremony, including
extra blast-radius checks.

But self-reinforcement can become noisy. The current design learned that lesson:
the self-reinforce scope was narrowed after telemetry showed too many edits
hitting the highest ceremony tier. That is the healthy loop. The system does not
pretend the first gate shape is perfect. It measures the cost, reviews the
evidence, and narrows the rule.

## What I would copy

The reusable pattern is not "make humans approve everything."

The reusable pattern is to split governance by failure mode:

1. Concurrency gate: am I allowed to write this shared state file right now?
2. Mutation gate: does this control-plane change need human approval before it
   lands?
3. Review gate: are the gates themselves producing useful signal over time?

Those are different questions. They deserve different mechanisms.

3B's gate system is still lightweight: markdown rules, shell helpers, sidecar
YAML, pre-commit validation, and append-only logs. The important part is the
shape of the contract. Risk is named before mutation. Approval is bound to the
staged tree. Historical rationale is stored in ADRs. The gate rules govern
themselves.

That is what makes the harness more than a pile of prompts. It has a control
plane, and the control plane leaves evidence.
