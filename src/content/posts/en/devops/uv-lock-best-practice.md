---
title: uv.lock Best Practice
description: Whether to commit `uv.lock` to version control.
date: 2026-01-28T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - python
  - uv
category: devops
draft: false
lang: en
references:
  - url: 'https://docs.astral.sh/uv/concepts/projects/sync/'
    title: sync
    type: official
  - url: 'https://github.com/astral-sh/uv/issues/9797'
    title: '9797'
    type: official
source_content_hash: 062d2fa28d3fded6e7f158f6dad8607ba18293a99f15f28b64554d901aacb274
expanded: true
---

I was setting up uv for a new ETL project and paused at `.gitignore`: should `uv.lock` be committed or ignored? The instinct from Python-land is to ignore dependency artifacts — `.venv/` is always gitignored, and `uv.lock` feels similar. But `uv.lock` isn't a virtual environment. It's a lockfile, and the answer has real consequences for build reproducibility.

## Why This Gets Confusing

**Misleading analogy to `.venv`** — Developers familiar with Python often equate `uv.lock` with `.venv/` (which is gitignored). This leads to reflexively adding `uv.lock` to `.gitignore`, but they serve completely different purposes.

**Large diffs on first commit** — The initial `uv.lock` can be hundreds of lines for projects with many transitive dependencies. The first PR that adds it looks intimidating, triggering pushback from reviewers who don't understand why it's needed.

**CI/CD silent divergence** — Without a committed lockfile, `uv sync` in CI resolves dependencies fresh each run. Builds pass for weeks until a transitive dependency releases a breaking change, causing a mysterious failure with no code change in the repo.

**Library vs application confusion** — For libraries, the answer is genuinely debatable, which makes teams think it's also debatable for applications. It's not.

## The Options

| Option                  | Pros                                              | Cons                                                                   |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| **Commit `uv.lock`**    | Reproducible builds, drift detection, audit trail | Larger diffs when dependencies update, merge conflicts on lock changes |
| **Gitignore `uv.lock`** | Cleaner diffs, no merge conflicts on lock         | Non-reproducible builds, silent dependency drift, CI surprises         |

## The Rule: Commit It

For applications, always commit `uv.lock`. The reproducibility and safety benefits far outweigh the occasional merge conflict. Lock merge conflicts are trivially resolved by re-running `uv lock`.

Per [uv official documentation](https://docs.astral.sh/uv/concepts/projects/sync/):

> "The lockfile should be checked into version control, allowing for consistent and reproducible installations across machines."

## Why Commit

| Benefit             | Description                                               |
| ------------------- | --------------------------------------------------------- |
| **Reproducibility** | Same dependency versions across all machines              |
| **CI/CD safety**    | `uv sync` errors if lockfile doesn't match pyproject.toml |
| **Drift detection** | Catches unintended dependency changes                     |
| **Audit trail**     | Git history shows when dependencies changed               |

Without a committed lockfile, two developers running `uv sync` on the same day might get different dependency versions if a transitive dependency released between their installs. In CI, this means a build can break without any code change — one of the hardest failures to diagnose.

## The Correct Mental Model

`uv.lock` is NOT like `node_modules` or `.venv` (runtime artifacts that are regenerated locally). It IS like `package-lock.json` or `poetry.lock` (dependency resolution snapshots that ensure reproducibility). All of these should be committed:

- `uv.lock` (uv)
- `package-lock.json` (npm)
- `poetry.lock` (Poetry)
- `Cargo.lock` (Rust — for applications)

## When It's Debatable

| Project Type     | Recommendation                               |
| ---------------- | -------------------------------------------- |
| **Applications** | Always commit                                |
| **Libraries**    | Debatable — consumers generate own lockfiles |

For libraries, consumers generate their own lockfile based on the library's version constraints. Committing the library's lockfile doesn't affect consumers, but it does help the library's own CI be reproducible. The trade-off is less clear-cut.

## When to Use This

- All Python application repositories managed with uv (APIs, CLIs, ETL pipelines, Airflow DAGs)
- Monorepos where multiple services share a lockfile for consistent dependency versions
- Any project with CI/CD pipelines that should produce identical builds across environments

## When NOT to Use This

- **Published libraries** — If you're building a pip-installable library, consumers generate their own lockfiles; committing yours adds noise without benefit
- **Exploratory/throwaway scripts** — Single-file experiments or Jupyter notebooks that will never be deployed don't need lockfile discipline
- **Projects not using uv** — If the project uses Poetry or pip-tools, commit `poetry.lock` or `requirements.txt` respectively; don't mix lockfile strategies

## Takeaway

Commit `uv.lock` for every Python application project. It's the equivalent of `package-lock.json` — not `.venv`. The one-time cost of a large initial diff and occasional merge conflicts is vastly outweighed by reproducible builds, CI/CD safety, and dependency drift detection. When merge conflicts occur, resolve them by running `uv lock` — it regenerates the lockfile from `pyproject.toml`.

## References

- [uv Locking and Syncing](https://docs.astral.sh/uv/concepts/projects/sync/)
- [GitHub Discussion](https://github.com/astral-sh/uv/issues/9797)
