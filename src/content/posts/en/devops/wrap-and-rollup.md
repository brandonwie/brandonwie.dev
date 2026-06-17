---
title: 'The Session Engine: /wrap, Clean-Slate Rollups, and a Cross-Session Buffer'
description: >-
  Agent work does not fail only because the agent made a bad edit. It also fails
  because the next session cannot tell what happened.
date: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T00:00:00.000Z
expanded: true
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: en
references:
  - url: 'https://git-scm.com/docs/git'
    title: Git documentation
    type: official
source_content_hash: fc6760cc83db2f987a2d469df0045f3b77dca3bd1c31df26f90d59e382792f1b
---

The previous chat may contain the answer, but the next agent cannot safely treat
a chat transcript as system state. The transcript may be missing, compacted,
summarized, or simply too large to reread. A durable system needs a smaller
restart surface: what changed, what remains open, what should be done first,
and where the evidence lives.

That is what 3B's session engine is for.

## `/wrap` turns a conversation into files

The current architecture model describes `/wrap` as a multi-thousand-line
session-end procedure. That size is less important than the boundary it
represents:
session state is not considered preserved until it has been written to versioned
files.

At a high level, `/wrap` does five jobs.

First, it records what happened in journals. A session becomes a dated entry
under `journals/`, with enough detail to reconstruct decisions without
replaying the chat.

Second, it updates task state. Active tasks carry `progress.md`, `todos.md`, and
often review artifacts. The `progress.md ## Resume Here` block is the practical
handoff contract: last action, next action, files in flight, branch/worktree,
open decisions, and blockers.

Third, it promotes durable learning. If a session produced a transferable
lesson, `/wrap` can move it into `knowledge/` instead of leaving it buried in a
journal.

Fourth, it regenerates status surfaces. `ACTIVE-STATUS.md` is not hand-edited;
it is projected from durable sources so session-start triage can read the same
state a human would inspect.

Fifth, it clears temporary capture queues after ingestion. The buffer exists to
catch breadcrumbs during a session. It is not meant to become a second
knowledge base.

## The buffer is a queue, not memory

`.agents/buffer.md` is deliberately humble. It catches friction, follow-ups, and
session breadcrumbs that would otherwise vanish during tool work. The important
design choice is what happens next: `/wrap` reads it, extracts anything durable,
and clears it.

That prevents two common failures.

One failure is the invisible memory trap. If an agent says "I will remember
this," but the state lives only in the agent's context window, the next session
cannot audit it. The buffer keeps the note visible.

The other failure is permanent scratch. If every breadcrumb stays forever, the
system slowly becomes a junk drawer. Clearing the buffer after durable
promotion keeps it useful precisely because it is not authoritative.

## `Resume Here` is the restart API

The most important part of an active task is often not the checklist. It is the
first concrete action after restart.

3B standardizes that in `progress.md`:

- last action
- next action
- files in flight
- branch or worktree
- open decisions
- blockers

Those fields are intentionally boring. They avoid the two things that make
handoffs fail: narrative ambiguity and missing ownership. A new session can see
which worktree to use, which files were in motion, and whether the next step is
implementation, review, verification, or archive.

This is also why `/wrap` repairs touched progress files. The session engine
does not trust authors to remember every handoff field manually. It checks the
shape because restartability is a product requirement of the repo, not a nice
extra.

## Rollups are clean-slate

Most note systems keep summaries and eventually forget the raw material. 3B
does the opposite for journals.

Daily entries are permanent. They are the atomic evidence. Weekly, monthly, and
quarterly rollups are ephemeral aggregation layers. Once a higher layer absorbs
them, the intermediate rollup can be deleted. Yearly summaries are permanent
again because they are the durable top-level view.

That gives the journal tree a useful property: it can stay navigable without
pretending the summarized layer is more authoritative than the raw session log.
If a weekly summary was wrong, the dailies still exist. If a monthly summary has
absorbed the week, the weekly file has done its job.

The rollup strategy is not just cleanup. It is a retention policy that encodes
which artifacts are source material and which are rebuildable products.

## Why this matters for agents

Multi-agent systems make context loss worse because each runtime has different
transport physics. Claude, Codex, and AGY can all participate in 3B, but none of
them should be trusted to inherit the previous runtime's private memory.

Files are the common protocol.

That is why `/wrap` writes journals, task state, knowledge candidates, friction
signals, and regenerated dashboards. It is why `progress.md` carries a restart
contract. It is why the buffer is cleared only after ingestion. It is why rollups
keep immutable dailies while deleting absorbed summaries.

The shape is simple: preserve what future work needs, delete what has been
absorbed, and make the next session prove its state from files.

## What I would not copy blindly

I would not start by writing a multi-thousand-line wrap procedure.

That size is an artifact of accumulated failure modes: stale task docs,
forgotten follow-ups, friction that never became a rule, dirty checkout
collisions, review loops, active-status drift, and cross-agent differences. The
useful pattern is smaller:

1. Pick one durable journal surface.
2. Give every active task a restart block.
3. Keep a visible buffer for session breadcrumbs.
4. Promote durable learning out of the buffer.
5. Treat intermediate summaries as rebuildable.

The point is not that every team needs 3B's exact wrap machinery. The point is
that agent work needs a session engine. Without one, the handoff boundary is
whatever the last chat happened to remember.
