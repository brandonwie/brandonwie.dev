---
title: 'Parallel Agents Without Collisions: Tasks, Worktrees, and Locks'
description: >-
  Parallel agent work usually looks like a Git problem. Two sessions edit the
  same repository, one lands first, the other gets a conflict, and everyone
  learns...
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
  - url: 'https://git-scm.com/docs/git-worktree'
    title: git-worktree documentation
    type: official
source_content_hash: cf1dc2ef047b922fe6f1e4760241c22f7b4305227ee1470d0d4535ada6f3a286
---

That advice is too small for the actual failure mode.

The harder problem is not that Git can merge files. Git is good at that. The
harder problem is that an agent session often cannot tell which work is already
owned, which files are handoff state, which branch it should be in, and whether a
different session is still writing the same task document. Without that state,
parallelism becomes a social convention. It works until the next session forgets
the convention.

3B's answer is to turn task ownership into files and gates.

## Start by making task state explicit

A 3B task does not start with "make a branch and code." It starts through
`task-starter`.

That matters because the first few minutes of a task are where many collisions
are introduced. If an agent skips context loading, it may re-open a finished
task. If it skips task typing, it may code before a bug is reproduced or before a
refactor has a regression baseline. If it skips branch setup, it may mix its
changes with a different session's untracked files. If it skips the handoff
docs, the next agent cannot tell where to resume.

The setup sequence is intentionally boring:

- Load project context and recent active status.
- Classify the task type.
- Run the type-specific gate, such as reproduce-first for a fix or baseline
  capture for performance work.
- Run forced retrieval before broad codebase reading.
- Decide whether an issue and branch are required.
- Create the canonical worktree.
- Write or preserve the task's `progress.md` and `todos.md` surfaces.

The important part is not the exact phase numbers. The important part is that
implementation is downstream of an explicit state transition. The task now has a
folder, a checklist, a progress record, a branch decision, and a known resume
point.

That is the difference between "an agent is working somewhere" and "this task is
owned here."

## Worktrees isolate edits, but they do not identify owners

3B uses Git worktrees because they solve a simple mechanical problem: two pieces
of work should not have to share one checkout.

The canonical helper creates worktrees under:

```text
<repo>/.worktrees/<branch-folder>/
```

For example, a branch named `docs/3b-architecture-blog-series-post-07` becomes a
flat folder named `.worktrees/docs-3b-architecture-blog-series-post-07`.

That flat shape is deliberate. Earlier 3B work used an agent-namespaced form,
roughly `.worktrees/<agent>/<branch>`. It looked useful because the path itself
said whether Claude, Codex, or another runtime created the checkout. But the
extra path segment did not carry enough value. Git already enforces one
worktree per branch, and no real shared-branch scenario appeared that needed an
agent directory level.

So ADR-035 flattened the path.

That simplified navigation and tooling, but it removed a convenient accident:
ownership was no longer visible from the path. A worktree path now tells you
where a checkout lives. It does not tell you who owns the session.

That is the key design turn. 3B stopped treating the filesystem path as an
ownership signal and moved ownership into explicit metadata.

## Ownership moved into frontmatter

The authoritative owner for a task session is `agent_origin`.

It lives in `progress.md` frontmatter and in lock manifests. A task can say:

```yaml
agent_origin: codex
worktree_path: .worktrees/docs-3b-architecture-blog-series-post-07
```

That small field does a lot of work. It lets a later session distinguish "this
task is owned by the same agent lane" from "this task belongs to another live
session." It also means ownership works the same way whether the task is running
from the main checkout, a flat worktree, or a future runtime that uses the same
contract.

This is a good example of a broader 3B pattern: move implicit runtime facts into
durable, inspectable files.

The path is still useful. It locates the checkout. It just does not have to carry
identity anymore.

## Locks protect the shared handoff surface

Worktrees isolate source edits, but they do not automatically protect every
shared file.

The most collision-prone files in 3B are not usually the draft files themselves.
They are the handoff files agents use to coordinate:

- `progress.md`
- `todos.md`
- `.agents/buffer.md`
- `ACTIVE-STATUS.md`

Those files are small, central, and frequently updated. They are exactly where a
parallel session can accidentally overwrite the current resume point or mark the
wrong checklist item complete.

3B protects that surface with advisory lock directories under `.agents/locks/`.
The lock path mirrors the target path. A lock for:

```text
projects/3b/actives/example/progress.md
```

lives under a matching `.agents/locks/.../progress.md.lock/` directory with a
manifest that records the agent, session, timestamp, target path, process id, and
worktree path.

The mechanism is intentionally plain: `mkdir` is the atomic operation. If the
directory already exists, the lock is held. The agent stops instead of editing
the same handoff document anyway.

This is not a replacement for Git. It is a pre-Git coordination layer for files
where "we can merge it later" is the wrong answer. A stale `Resume Here` block
can cost more than a merge conflict because it points the next session at the
wrong work.

## Every worktree must see the same lock space

There is one subtle worktree problem: each Git worktree has its own checked-out
copy of tracked files. `.agents/` is tracked content, not `.git/` state. If every
worktree kept a separate `.agents/locks/` directory, then each worktree would
think it had the lock space to itself.

That would make the lock protocol decorative.

The worktree helper fixes this by linking each worktree's `.agents/locks/` back
to the main checkout's `.agents/locks/`. The checkout is isolated, but the lock
space is shared.

This is the kind of detail that matters in agent systems. The visible design is
"use worktrees." The real design is "use worktrees, but route the concurrency
surface to one shared lock directory, and make sure broken symlinks are detected
with `lstat` rather than mistaken for missing paths."

Without that last step, the system can look correct while giving each session a
private lock universe.

## The protocol is scoped on purpose

3B does not lock every markdown file.

That would be noisy, and it would make ordinary drafting feel like a distributed
database. Most files can be handled by branch isolation and Git review. The lock
rule is scoped to the small set of files that carry cross-session state.

That scope is the design:

- Worktrees isolate implementation and drafting.
- `agent_origin` declares who owns the task lane.
- Lock directories protect shared handoff documents.
- `progress.md ## Resume Here` tells the next session what to do first.
- `ACTIVE-STATUS.md` projects task state for triage.

Each layer has a narrow job. None of them has to become the whole coordination
system.

## What I would copy

The reusable idea is not "use exactly this script."

The reusable idea is to separate three questions that are often collapsed:

1. Where is the checkout?
2. Who owns this task session?
3. Which shared files require collision protection?

If the checkout path answers all three, the system will eventually fight itself.
Paths are convenient, but they are weak metadata. They change when tooling gets
simpler. They are hard to query across agents. They are easy to misread after a
migration.

3B's flat worktree change forced the cleaner model. The checkout path became a
locator. `agent_origin` became the owner signal. Locks became a scoped
coordination mechanism for handoff state.

That is what makes parallel agents practical here. Not because collisions are
impossible, but because the system has a place to represent ownership before the
collision happens.
