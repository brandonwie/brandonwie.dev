---
title: uv.lock Best Practice
description: Whether to commit `uv.lock` to version control.
date: 2026-01-28T00:00:00.000Z
updated: 2026-02-02T00:00:00.000Z
tags:
  - devops
  - python
  - uv
category: devops
draft: false
lang: en
references:
  - url: "https://docs.astral.sh/uv/concepts/projects/sync/"
    title: sync
    type: official
  - url: "https://github.com/astral-sh/uv/issues/9797"
    title: "9797"
    type: official
---

I set up uv for a new project and immediately had a team debate: should we
commit `uv.lock` or add it to `.gitignore`? One developer argued it was like
`.venv` (ignore it), another said it was like `package-lock.json` (commit it).
We spent 30 minutes going back and forth before I checked the official docs.

The answer is clear: commit it.

## Why This Matters

Getting the lockfile decision wrong has real consequences. If you gitignore
`uv.lock`, every `uv sync` in CI resolves dependencies fresh. Builds pass for
weeks until a transitive dependency releases a breaking change. Then your CI
fails with no code change in the repo, and you spend time debugging a phantom
issue.

If you commit it but your team does not understand why, developers keep
regenerating it unnecessarily, producing noisy diffs and triggering pushback
from reviewers who think the lockfile is just noise.

The confusion is amplified because different ecosystems have different
conventions. In Node.js, `node_modules` is ignored but `package-lock.json` is
committed. In Python, `.venv` is ignored. Where does `uv.lock` fall?

## The Difficulties

**The .venv analogy was misleading.** Developers familiar with Python often
equate `uv.lock` with `.venv/` (which is gitignored). This leads to reflexively
adding `uv.lock` to `.gitignore`, which is wrong.

**The initial lockfile diff was intimidating.** The first `uv.lock` for a
project with many transitive dependencies can be hundreds of lines. The PR that
adds it looks large and triggers pushback from reviewers who have not seen a
lockfile before.

**CI divergence was silent.** Without a committed lockfile, CI resolves
dependencies fresh each run. This works until it does not. The failure mode is a
transitive dependency breaking months later with no code change to blame.

**Library vs application confusion added noise.** For libraries, committing a
lockfile is genuinely debatable. This makes teams think the question is also
debatable for applications. It is not.

## Options Explored

| Option                  | Pros                                              | Cons                                                           |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| **Commit `uv.lock`**    | Reproducible builds, drift detection, audit trail | Larger diffs on dependency updates, occasional merge conflicts |
| **Gitignore `uv.lock`** | Cleaner diffs, no merge conflicts on lock         | Non-reproducible builds, silent dependency drift, CI surprises |

The merge conflict concern sounds worse than it is. When two developers update
dependencies on different branches, the lockfile conflicts. But the resolution
is always the same: re-run `uv lock` and commit the result. It takes seconds.

## The Rule: Commit It

The [uv official documentation](https://docs.astral.sh/uv/concepts/projects/sync/)
is explicit:

> "The lockfile should be checked into version control, allowing for consistent
> and reproducible installations across machines."

This is not a recommendation. It is the intended workflow.

## Why Commit

| Benefit             | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| **Reproducibility** | Same dependency versions across all machines               |
| **CI/CD safety**    | `uv sync` errors if lockfile does not match pyproject.toml |
| **Drift detection** | Catches unintended dependency changes                      |
| **Audit trail**     | Git history shows when dependencies changed                |

The CI/CD safety point is particularly valuable. When the lockfile is committed,
`uv sync` will error if someone adds a dependency to `pyproject.toml` without
running `uv lock`. This catches mistakes at the PR level, not in production.

## When It Gets Debatable

| Project Type     | Recommendation                                |
| ---------------- | --------------------------------------------- |
| **Applications** | Always commit                                 |
| **Libraries**    | Debatable -- consumers generate own lockfiles |

For applications (APIs, CLIs, ETL pipelines, Airflow DAGs), there is no
debate. Commit the lockfile.

For libraries, the situation is different. A library's consumers generate their
own lockfiles, so committing the library's lockfile does not affect downstream
builds. Some library authors still commit it for reproducible development
environments, but it is a team preference rather than a best practice.

## Common Misconception

The most common mistake is thinking `uv.lock` is like `node_modules` or `.venv`.
It is not. Those are generated artifacts containing actual installed packages.
`uv.lock` is like `package-lock.json` or `poetry.lock` -- a resolution manifest
that records the exact versions to install.

The analogy table:

| File                | Type                | Commit? |
| ------------------- | ------------------- | ------- |
| `.venv/`            | Installed packages  | No      |
| `node_modules/`     | Installed packages  | No      |
| `uv.lock`           | Resolution manifest | Yes     |
| `package-lock.json` | Resolution manifest | Yes     |
| `poetry.lock`       | Resolution manifest | Yes     |

## Why This Works

Once the lockfile is committed, the dependency workflow becomes predictable:

1. Developer adds a package: `uv add pandas`
2. uv updates both `pyproject.toml` and `uv.lock`
3. PR shows the new dependency and its resolved versions
4. Reviewers can inspect exactly what changed
5. CI runs `uv sync` with the exact same versions
6. Production deploys with the exact same versions

No surprises. No "it worked yesterday" debugging sessions.

## Practical Takeaway

**Commit `uv.lock`** for every application project. Tell your team it is like
`package-lock.json`, not like `.venv`. When merge conflicts happen on the
lockfile, resolve them by running `uv lock` and committing the result.

**Skip committing** only for published pip-installable libraries (where
consumers generate their own locks), throwaway scripts, and projects that do not
use uv at all.

The 30-minute debate I had with my team could have been avoided by reading one
sentence in the docs. Now it is part of our project setup checklist: initialize
the project, run `uv lock`, commit `uv.lock`, move on.

---

## References

- [uv Locking and Syncing](https://docs.astral.sh/uv/concepts/projects/sync/)
- [GitHub Discussion](https://github.com/astral-sh/uv/issues/9797)
