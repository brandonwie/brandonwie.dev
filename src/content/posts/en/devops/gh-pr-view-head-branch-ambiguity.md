---
title: '`gh pr view` Head-Branch Ambiguity (False-Negative)'
description: 'Running `gh pr view --json number,state` on a branch with an open PR can return "no pull requests found" even when the PR exists and the branch is correctly tracked. The empty result means "gh''s branch resolution didn''t find one," not "no PR exists."'
date: 2026-05-05T00:00:00.000Z
updated: "2026-06-14"
tags:
  - devops
  - github-cli
  - gh
  - pr-management
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://cli.github.com/manual/gh_pr_view'
    title: gh pr view manual
    type: official
source_content_hash: a308c62b6abc5dab97a2535a4b10fc3a5f93240948ed8176c7dfd897de7a47fe
---

`gh pr view` (no PR number) is documented to find the PR for the current branch. It can fail silently in ways that look like "no PR exists" — and the failure mode burns a chunk of debugging time when it appears in a CI/CD pre-flight check. The original symptom:

```bash
gh pr view --json number,state,title,url --jq '.'
```

returns:

```text
no pull requests found for branch "..."
```

Even when `gh pr list --head <branch>` shows the PR is open. Resolution can fail for reasons that aren't immediately obvious:

- The local branch has commits not on the remote tracker that gh's resolution uses.
- The PR was opened from a different fork/org and gh resolves to a different remote.
- A recent `git fetch` race left the local view of refs out of sync.
- The branch was just pushed and gh's GraphQL cache hasn't propagated.

In the original case, the PR existed and the branch was correctly tracked (`origin/fix/tf57-google-integration-refresh`), but `gh pr view` returned empty. Following up with `gh pr create` failed immediately with `already exists: PR 138` — definitive proof the PR was open. The branch resolution had simply not found it.

## Use the explicit-branch form for existence checks

Two reliable forms beat the default branch-resolution path:

```bash
# By PR number (most reliable):
gh pr view 138 --json state,mergeable,...

# By explicit head branch (works across resolution edge cases):
gh pr list --head fix/tf57-google-integration-refresh \
           --json number,state,headRefName \
           --jq '.[0]'
```

The `gh pr list --head` form forces gh to do a server-side query keyed on the branch name string, which is invariant under local-state weirdness. If you need the PR's full state and you only have the branch name, chain them:

```bash
PR_NUM=$(gh pr list --head <branch> --json number --jq '.[0].number')
[ -n "$PR_NUM" ] && gh pr view "$PR_NUM" --json ...
```

## Why the default form is not safe for scripts

Three properties of `gh pr view` (no args) make it the wrong tool for "is there a PR?" pre-flight checks:

- **Don't trust `gh pr view` (no args) for existence checks.** Use `gh pr list --head <branch>` for the existence question, then `gh pr view <number>` for full state.
- **Empty/error output ≠ no PR.** It means "gh's branch resolution didn't find one" — which is a different proposition.
- **`gh pr create` is a destructive existence check.** It WILL tell you the PR already exists, but it'll also try to create one if no PR is found. Not safe for "is there a PR?" pre-flight in scripts.

## What made this hard to spot

Two things slowed diagnosis:

- **The error message is misleading.** "no pull requests found for branch X" reads as authoritative; you don't immediately think "gh resolved my branch wrong." The mental model "gh asked GitHub, GitHub said no" is wrong — gh is doing client-side resolution that can fail.
- **No way to debug without running `gh pr list --head`.** There's no `--verbose` mode that shows gh's resolution path, so you can't tell WHY it didn't find the PR — only that it didn't.

## When this matters

Use the workaround for:

- CI/CD pre-flight checks that need to know if a PR exists before taking action (open vs update vs skip).
- Automation skills (like `/crucio-ship`, `/pr-create`) that branch on PR existence.
- Any script where "no PR found" leads to creating one (the destructive-check problem).

It does not matter for interactive use — when you're running `gh pr view` on your own work, the resolution usually does what you want, and you can spot-check the result. After a fresh `git push -u origin <branch>` from the PR-opening session, gh's resolution is most likely to be correct.

## Practical takeaway

For automation that asks "does a PR exist for this branch?", use `gh pr list --head <branch>` and check whether the result array is non-empty. Reserve `gh pr view <number>` for full-state queries once you have the number. The default `gh pr view` (no args) form is fine interactively but produces false-negative "no PR" responses under conditions that are hard to reproduce — bad combination for a script.

## References

- [gh pr view manual](https://cli.github.com/manual/gh_pr_view)
