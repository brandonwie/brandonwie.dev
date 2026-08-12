---
title: 'The pre-commit hook race that put my files in someone else''s commit'
description: 'Two sessions committing to one repo, a slow pre-commit hook, and `fatal: cannot lock ref HEAD`. The loud failure is the easy one — the quiet failure hands your staged files to the other session''s commit under its message.'
date: 2026-05-14T00:00:00.000Z
updated: "2026-08-12"
tags:
  - devops
  - transferable
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://git-scm.com/docs/git-worktree'
    title: git-worktree — Manage multiple working trees
    type: official
source_content_hash: 3062f1df5dafa7a9eebc40bd3893a784c6f7d9f535ec73904a793b6bbbe23ef9
---

I had two agent sessions working in the same repository at once, and both tried
to commit at roughly the same moment. One of them died mid-commit with:

```text
fatal: cannot lock ref 'HEAD': is at <new-sha> but expected <prev-sha>
```

That error is annoying but honest — it tells you something went wrong. The
failure that actually cost me time was the quiet one, where the commit
"succeeds," the working tree goes clean, and my staged files turn out to be
sitting in a completely different commit under a message I never wrote.

## What the error is telling you

A `git commit` isn't instantaneous. It reads HEAD (say `<prev-sha>`), runs the
pre-commit hook, and only then writes the new commit and advances the ref. In a
repo with a heavy hook — linters, formatters, codegen — that hook can take a few
seconds. If a second session commits during that window, it advances HEAD to
`<new-sha>` first. When my hook finally returns and git goes to move the ref, the
ref isn't where the commit started, so git refuses to fast-forward the lock
atomically and aborts. That's the whole race: the pre-commit hook duration is the
window, and a concurrent committer is the other racer.

## The silent version is worse

The loud abort at least stops you. The bad case is when the parallel session is a
`/wrap`-style script that runs `git add -A` or `git add <session-dir>/` across the
whole staging area. Now the two problems compound: my files are staged, the
other session's `git add` scoops them up, and they land in **its** commit, under
**its** message. My intended commit message is gone, and the files are somewhere
else in the log.

Here's what that looked like when I hit it:

1. `git commit -m "feat: scaffold the new skill"` fails with
   `fatal: cannot lock ref 'HEAD'`.
2. `git status` shows a clean working tree — the files _look_ committed.
3. `git ls-files <path>` confirms they're tracked.
4. `git log -1 --stat` shows them in a commit whose message is about completely
   unrelated work — the parallel session's wrap commit.

The files functionally landed. The attribution and the commit-message intent did
not. The broad `git add` globs in wrap-style automation are the mechanism that
swept them up.

## The fix is structural, not "make the hook faster"

It's tempting to treat this as a performance problem and shave the hook down.
That shrinks the race window but never closes it — any shared, mutable HEAD can
still be advanced by another committer mid-hook. The real fix is to stop sharing
HEAD at all: give each long-running parallel session its own **git worktree**.

A worktree has its own HEAD, working tree, and index, so there's no shared
mutable state for `git commit` to race on. The path convention I use keeps them
tidy under the main repo:

```text
<main-repo>/.worktrees/<branch-slug>/
```

```bash
git -C <main> worktree add <main>/.worktrees/<branch-slug> \
  -b <branch-name> <base-branch>
```

Both sessions then commit independently, and when a worktree branch merges back,
everyone sees the result — but the commit itself never races.

## The hook window isn't the only window

The pre-commit race is a few seconds wide at most. There's a second race in the
same family that runs much longer, and I only caught it because I run a delta
guard in my own tooling that exists to catch exactly this kind of thing.

The guard captures a baseline of the repository state before I start editing,
then verifies that baseline again right before staging. The span between capture
and verify isn't a hook duration. It's the whole length of the edit, which can
run to minutes. With another session writing to the same repo, that window loses
in three ways:

| Failure               | What the other session did                       |
| --------------------- | ------------------------------------------------ |
| Unexpected path       | Created files that weren't in the baseline       |
| HEAD changed          | Committed, so the recorded SHA no longer matches |
| Session path conflict | Nothing. My own path was already dirty at capture |

I hit all three in one session, while a parallel session was writing files and
committing to the main branch alongside me.

The remedy was the same every time: re-capture a fresh baseline, and don't
override the guard. An override tells the tool to ignore evidence that the
repository moved underneath it, which is the one thing the guard exists to
notice. A fresh capture makes it correct again.

The third case has a wrinkle worth knowing if you build something similar. A
path that's already dirty when the baseline is taken has to be declared both as a
session-owned path and as a mixed path, and the identical set has to go to the
capture step and the verify step. Pass different sets to each and the verify
disagrees with the baseline it's checking against, which looks exactly like a
real conflict.

## If you've already been bitten

A few things that are worth knowing before you try to "fix" the history:

- **The index is shared too, not just HEAD.** A parallel session's mixed
  `git reset` can silently unstage your staged set. Check `git diff --cached`
  before retrying a commit, and re-stage by explicit path if needed.
- **Unmerged (`UU`) index entries block every commit.** `git commit` fails with
  "you have unmerged files" even when your pathspec does not touch the conflict.
  A parallel session's stash-pop or merge conflict can wedge every other session
  until it is resolved.
- **`UU` entries can self-resolve.** If another session owns the in-flight
  operation, check `git ls-files -u <path>` and the worktree for conflict markers
  before intervening. Resolving its conflict from your session can clobber its
  work.
- **Force-push and `--amend` are not recovery options here.** The commit did
  happen — just under the wrong message. Amending the parallel session's commit
  rewrites _their_ history. Don't.
- **Verify where the files actually went** with `git ls-files <expected-path>`
  and `git log -- <expected-path>`; the latter shows which commit they landed in.
- **There's no clean re-commit.** If your files are already tracked in the other
  commit, re-staging is a no-op (`nothing to commit, working tree clean`). The
  message asymmetry is now permanent in history. If attribution matters, the
  cleanest remediation is a follow-up commit with the intended message and scope
  and no file changes — a note in the log, essentially.

## When worktrees are the answer (and when they aren't)

Set them up when you're designing multi-agent or multi-window workflows that
share a repo, when you're diagnosing missing or mis-attributed commits, or when
you're onboarding a task you expect to run concurrently with another session. The
cheapest time to do it is before the work starts, not after the race.

You don't need them for single-agent serial work — there's no race window — and
this isn't the explanation for an actual `git push --force` mishap, which is a
history rewrite, a different failure mode entirely.

## The takeaway

`cannot lock ref 'HEAD'` reads like a timing hiccup, but it's really a sign that
two committers share one HEAD. Faster hooks treat the symptom. Worktrees remove
the sharing, which is the only thing that actually ends the race, including the
silent variant where your work quietly ships under someone else's name. The
wider version of the same problem is any tool that captures repository state and
verifies it later: its window is as long as your edit, and when it trips, the fix
is a fresh baseline rather than an override.

## References

- [git-worktree — Manage multiple working trees](https://git-scm.com/docs/git-worktree)
