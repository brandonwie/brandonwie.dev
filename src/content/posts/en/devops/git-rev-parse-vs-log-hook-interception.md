---
title: '`git rev-parse HEAD` vs `git log -1` Divergence Under Watcher Hooks'
description: 'After a `gh pr merge` and a local pull, `git rev-parse HEAD` returned the correct merge commit while `git log -1` rendered the just-merged-away feature branch tip for several seconds. A graphify watcher rebuild fired during the checkout. The low-level read is authoritative; the log render can lag.'
date: 2026-05-05T00:00:00.000Z
updated: 2026-05-06
tags:
  - devops
  - git
  - watcher-hooks
  - debugging
  - graphify
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://git-scm.com/docs/git-rev-parse'
    title: git-rev-parse manual
    type: official
  - url: 'https://git-scm.com/docs/git-log'
    title: git-log manual
    type: official
source_content_hash: 2f0bd7cfb2181e5a4906488394ae95f86a89e63378e6467515b15b977436ffe0
---

After `gh pr merge` merged PR #138 and the local repo synced to `origin/main`, two ways of asking "what commit am I on?" disagreed:

```bash
$ git rev-parse HEAD
234ba9b42169d22162c964d235b28c68be993c8b   # ✓ correct merge commit

$ git rev-parse origin/main
234ba9b42169d22162c964d235b28c68be993c8b   # ✓ matches

$ git log -1 --pretty=format:'%H %s'
0227f2eed0c5b18762ce895a346751571677901c test(integrations): symmetric...
                                          # ✗ this is the FEATURE BRANCH tip
                                          #   that was just merged AWAY from
```

Both commands ran within seconds of each other, on the same shell, in the same repo. The divergence resolved on its own a few seconds later (and went away immediately after `git reset --hard origin/main`). The original observation was easy to dismiss as "I saw something weird," but it surfaced a meaningful gap between two read paths.

## What the watcher was doing

A graphify watcher rebuild fired during the `git checkout main && git pull` sequence, visible in the output stream:

```text
[graphify] Branch switched - rebuilding knowledge graph (code files)...
  AST extraction: 100/402 files (24%)
  ...
[graphify watch] Rebuild failed: Graph has 5196 nodes - too large for HTML viz.
```

The watcher likely held some state that interleaved with `git log`'s read of HEAD. `git rev-parse HEAD` is a thin wrapper over reading `.git/HEAD` directly — minimal interaction with hooks. `git log` does more (render commit, follow first-parent, format output) and may be more susceptible to hook side-effects on file descriptors or environment.

This is a hypothesis, not proven. The reproducer would require running graphify watcher + `git log` in tight enough succession to catch the race, which is hard to instrument. The watcher's own logs ("Rebuild failed: Graph has 5196 nodes — too large for HTML viz") are unrelated; there's no clean error from git or the watcher about a HEAD-state sync gap.

## Treat `rev-parse` as authoritative

The remediation is mechanical: when watcher hooks may be running, treat `git rev-parse HEAD` as authoritative for HEAD-sha queries:

```bash
# Authoritative HEAD check:
git rev-parse HEAD
git rev-parse origin/main

# If divergence with `git log` output, force resync:
git fetch origin main
git reset --hard origin/main
```

For automation that needs to reliably read HEAD state:

```bash
HEAD_SHA=$(git rev-parse HEAD)            # cheap, authoritative
HEAD_SUBJECT=$(git show -s --format=%s "$HEAD_SHA")  # explicit lookup by sha
```

Avoid `git log -1` for HEAD-state queries when hooks are active — prefer `git show -s --format=...` with an explicit sha. The two-step (read sha, then look up subject) is mechanically deterministic; it can't get the subject of a stale ref because the sha was already pinned.

## Why one is more reliable than the other

The asymmetry comes down to how much work each command does:

- **`git rev-parse` reads refs at the file level.** It's the cheapest and most reliable way to get a commit sha — no traversal, no rendering, no hook interaction beyond opening `.git/HEAD`.
- **`git log` does more work.** Following the first-parent chain, loading commit objects, formatting output. More surface area for a hook side-effect to manifest.
- **Watcher hooks (graphify, Serena, post-checkout) run in your shell's context.** They share file descriptors, the working directory, and the environment. Side effects are possible.
- **`git reset --hard origin/<branch>` is the reliable resync.** When authoritative state is `origin/<branch>` and local appears to lag, fetch + reset --hard. Don't try to debug the hook in the middle of the workflow.

## When this matters

Three contexts where this is worth the discipline:

- Automation that reads HEAD state immediately after a hook-triggering operation (checkout, pull, merge, reset).
- Debugging "why does git think I'm on the wrong commit?" issues when watchers are installed.
- CI pre-flight scripts that need to know HEAD sha before deciding what to dispatch.

It does not matter for interactive use without hooks installed (`git log` is fine), repos without graphify/Serena/custom watchers, or after watchers settle (a few seconds post-checkout, both commands agree).

## Practical takeaway

When a long-running git watcher hook fires during checkout or pull, brief divergence between `git rev-parse HEAD` and `git log -1` can occur. The low-level read wins. Pin the sha first with `rev-parse`, then look up the subject explicitly with `git show -s --format=%s "$SHA"`. If you've seen divergence and need to recover, `git fetch origin <branch> && git reset --hard origin/<branch>` is the deterministic path.

## References

- [git-rev-parse manual](https://git-scm.com/docs/git-rev-parse)
- [git-log manual](https://git-scm.com/docs/git-log)
