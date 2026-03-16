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
  - url: 'https://docs.astral.sh/uv/concepts/projects/sync/'
    title: sync
    type: official
  - url: 'https://github.com/astral-sh/uv/issues/9797'
    title: '9797'
    type: official
source_content_hash: 062d2fa28d3fded6e7f158f6dad8607ba18293a99f15f28b64554d901aacb274
---

## The Problem

When setting up uv for a new project, the question arises: should `uv.lock` be
committed to version control or gitignored? Getting this wrong leads to
unreproducible builds (if gitignored) or noisy diffs (if developers are unsure
and keep regenerating it). The confusion is amplified because different
ecosystems have different conventions (`node_modules` is ignored,
`package-lock.json` is committed).

---

## Difficulties Encountered

- **Misleading analogy to `.venv`** — Developers familiar with Python often
  equate `uv.lock` with `.venv/` (which is gitignored). This leads to
  reflexively adding `uv.lock` to `.gitignore`.
- **Large diffs on first commit** — The initial `uv.lock` can be hundreds of
  lines for projects with many transitive dependencies, making the first PR that
  adds it look intimidating and triggering pushback from reviewers.
- **CI/CD silent divergence** — Without a committed lockfile, `uv sync` in CI
  resolves dependencies fresh each run. Builds pass for weeks until a transitive
  dependency releases a breaking change, causing a failure with no code change
  in the repo.
- **Library vs application confusion** — For libraries, the answer is genuinely
  debatable, which makes teams think it is also debatable for applications (it
  is not).

---

## Options Considered

| Option                  | Pros                                              | Cons                                                                   |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| **Commit `uv.lock`**    | Reproducible builds, drift detection, audit trail | Larger diffs when dependencies update, merge conflicts on lock changes |
| **Gitignore `uv.lock`** | Cleaner diffs, no merge conflicts on lock         | Non-reproducible builds, silent dependency drift, CI surprises         |

## Why This Approach

Commit `uv.lock` for all application projects. The reproducibility and safety
benefits far outweigh the occasional merge conflict. Lock merge conflicts are
trivially resolved by re-running `uv lock`.

---

## The Rule: Commit It

Per
[uv official documentation](https://docs.astral.sh/uv/concepts/projects/sync/):

> "The lockfile should be checked into version control, allowing for consistent
> and reproducible installations across machines."

## Why Commit

| Benefit             | Description                                               |
| ------------------- | --------------------------------------------------------- |
| **Reproducibility** | Same dependency versions across all machines              |
| **CI/CD safety**    | `uv sync` errors if lockfile doesn't match pyproject.toml |
| **Drift detection** | Catches unintended dependency changes                     |
| **Audit trail**     | Git history shows when dependencies changed               |

## When Debatable

| Project Type     | Recommendation                               |
| ---------------- | -------------------------------------------- |
| **Applications** | ✅ Always commit                             |
| **Libraries**    | Debatable - consumers generate own lockfiles |

For application projects, always commit `uv.lock`.

## Common Misconception

Some teams gitignore `uv.lock` thinking it's like `node_modules` or `.venv`.
It's not - it's like `package-lock.json` or `poetry.lock`, which should be
committed.

---

## When to Use

- All Python application repositories managed with uv (APIs, CLIs, ETL
  pipelines, Airflow DAGs)
- Monorepos where multiple services share a lockfile for consistent dependency
  versions
- Any project with CI/CD pipelines that should produce identical builds across
  environments

---

## When NOT to Use

- **Published libraries** — If you are building a pip-installable library,
  consumers generate their own lockfiles; committing yours adds noise without
  benefit
- **Exploratory/throwaway scripts** — Single-file experiments or Jupyter
  notebooks that will never be deployed do not need lockfile discipline
- **Projects not using uv** — If the project uses Poetry or pip-tools, commit
  `poetry.lock` or `requirements.txt` respectively; do not mix lockfile
  strategies

---

## References

- [uv Locking and Syncing](https://docs.astral.sh/uv/concepts/projects/sync/)
- [GitHub Discussion](https://github.com/astral-sh/uv/issues/9797)
