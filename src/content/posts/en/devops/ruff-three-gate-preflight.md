---
title: Ruff Three-Gate Pre-Flight
description: A push that turned into three CI cycles taught me Ruff in CI is three independent gates. A four-line shell function prevents the loop.
date: 2026-04-29T00:00:00.000Z
updated: 2026-04-29T00:00:00.000Z
tags:
  - devops
  - python
  - ci-cd
  - ruff
  - pre-flight
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://docs.astral.sh/ruff/linter/'
    title: Ruff linter docs
    type: official
  - url: 'https://docs.astral.sh/ruff/formatter/'
    title: Ruff formatter docs
    type: official
source_content_hash: 075be95fd90cbaed7958a43002050ddc7d08829ee017df3d9ccd85c55ffa853d
---

> Ruff in CI typically runs three independent checks: `ruff check` (lint),
> `ruff format --check` (formatter dry-run), and a lockfile / dependency
> integrity check. Each can fail in isolation. Running only `ruff check` locally
> catches lint errors but lets format failures through, costing a CI cycle per
> missed gate.

First push to PR #134, CI came back red on `ruff check` — an `I001` import
sorting violation. Easy fix, push again. Second cycle: `ruff check` was green,
but `ruff format --check` failed on the same files. Push the format fix. Third
cycle: format failed again — this time in `ml/`, a directory I had not touched
in this PR. Three CI cycles to learn that "ruff" in CI is actually three gates,
and the local pre-flight needs to mirror all of them.

## The Three Gates

A common Ruff CI configuration runs three steps that look related but gate
independently:

| Step       | Command                                         | Catches                                                 |
| ---------- | ----------------------------------------------- | ------------------------------------------------------- |
| Lint       | `ruff check {paths}`                            | I001 import sorting, F401 unused imports, B-rules, etc. |
| Format     | `ruff format --check {paths}`                   | Whitespace, line-length, arg-list wrapping              |
| Lock-check | `uv lock --check` (or pip-tools / poetry equiv) | `pyproject.toml` and lockfile drift                     |

Running `ruff check` locally and seeing "All checks passed!" feels like green
CI. It is not. The format check is a separate command; the lockfile check is a
separate tool. CI runs all three; one local pass plays only one.

## How the Failure Cycle Plays Out

Each missed gate eats one CI cycle:

1. Push commit. CI runs `ruff check`. Red. → fix.
2. Push fix. CI runs `ruff check` (green now) AND `ruff format --check`. Red on
   format. → fix.
3. Push fix. CI runs all three. Red on lock-check (or on format in a different
   directory you didn't touch but the suite does). → fix.

Each cycle costs CI minutes and wall-clock. On a quota-constrained runner,
three failed cycles can burn enough minutes to block other deploys waiting in
the queue.

## The Pre-Flight Pattern

Run **all three gates** locally before every push:

```bash
# Per-directory pre-flight (run for each Python tree the CI suite touches)
ruff check {dir}                 # Gate 1: lint
ruff format --check {dir}        # Gate 2: format dry-run

# Repo-wide pre-flight (catches gates the CI suite=all hits)
ruff check . --quiet
ruff format --check .
```

If any gate is red, fix and re-run. Push only when all gates report clean.

The repo-wide pass matters because CI `suite=all` typically scopes the checks
to the whole repo, while your local intuition is scoped to "the files I just
edited." Drift in unrelated directories — for example, a Markdown linter that
auto-rewraps `.agents/rules/*.md` between your edits and CI — will fail at CI
time even though `git diff` looks clean.

## Reusable Pre-Flight Script

A reusable shell function that loops over directories:

```bash
ruff_preflight() {
  local dirs=("$@")
  if [[ ${#dirs[@]} -eq 0 ]]; then
    dirs=(".")
  fi
  for d in "${dirs[@]}"; do
    echo "=== $d: lint ==="
    ruff check "$d" || return 1
    echo "=== $d: format ==="
    ruff format --check "$d" || return 1
  done
  echo "All ruff gates green."
}

# Usage
ruff_preflight apps/api ml
```

Or as a `Makefile` target:

```text
.PHONY: preflight
preflight:
	ruff check .
	ruff format --check .
	@echo "preflight ok"
```

Either form runs in a few seconds locally — far cheaper than a CI cycle.

## Key Points

- **Ruff's three gates are orthogonal.** Lint and format produce distinct diff
  sets. Lint flags unused imports; format flags line-wrap. They never overlap,
  so one passing tells you nothing about the other.
- **Auto-fix flags differ.** Lint has `ruff check --fix` (and `--unsafe-fixes`
  for the rest). Format has `ruff format` (no `--fix` flag — formatter is the
  fix). Mixing them up wastes time.
- **CI scope ≠ git diff scope.** A rebase that touches `apps/api/` may trigger
  format failures in `ml/` because the suite-wide format check doesn't care
  which files you changed. Pre-flight repo-wide.
- **Lockfile gate hides until format passes.** Failed lint blocks format blocks
  lock-check in most CI configs (sequential job dependency). You may not see
  the lockfile failure until the prior gates pass.
- **Format is non-negotiable.** Ruff's formatter is opinionated and stable.
  Local manual formatting will drift from `ruff format`; just run the
  formatter on every save (editor integration) and don't fight it.

## What Each Gate's Auto-Fix Actually Does

A subtle one: `ruff check --fix` does NOT trigger `ruff format`. They are
separate commands. Running `--fix` and assuming format follows is the most
common version of the three-cycle loop. The fix-flag table:

| Gate   | Fix command            | What it touches                            |
| ------ | ---------------------- | ------------------------------------------ |
| Lint   | `ruff check --fix`     | Auto-fixable lint violations only          |
| Lint   | `--unsafe-fixes`       | Adds rules where Ruff is uncertain         |
| Format | `ruff format`          | Whitespace, wrapping, quote style          |

`--unsafe-fixes` ships fixes for rules where Ruff is uncertain about behavior
preservation. For your own code, unsafe fixes are usually fine. For
pre-existing third-party files, prefer reviewing the diff before accepting.

## When Pre-Existing Main Breakage Compounds

If `main` is already red on a Ruff gate, your branch's clean diff still
triggers a hard block at CI time. The gate runs against the whole repo state,
not against your delta. Two paths:

- **Same PR.** Fix the pre-existing breakage in your PR with an explicit
  scope-creep commit (`fix(ml): ruff format pre-existing files`). Reviewer
  knows what's yours and what's cleanup.
- **Separate hotfix.** Land the cleanup as a tiny independent PR first; rebase
  your feature branch after.

Choosing depends on PR size and review urgency, but the option you should not
take is "skip the gate" — disabling Ruff in `pyproject.toml` removes the
safety net entirely, and the directory becomes a drift accumulator.

## When to Use

- Before every push to a PR with Python changes.
- After rebasing onto `main` (CI scope = full repo, your diff is partial).
- When you see "ruff" in CI output for the first time on a project.

## When NOT to Use

- Pure docs / non-Python changes — the gates won't fire.
- Inside a hot debugging loop on a single file — running repo-wide pre-flight
  every save is overkill; rely on editor integration.

## Anti-Patterns

| Anti-Pattern                                               | Why Wrong                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `ruff check --fix && git push`                             | Skips format gate; one CI cycle wasted                            |
| Running ruff only on changed files                         | Misses suite-wide checks; rebases trigger drift in unrelated dirs |
| Treating `ruff` and `ruff format` as one command           | They're orthogonal — different diff sets, different flags         |
| Adding `--no-verify` to push past failing pre-commit       | Hides the gate locally; CI still catches; longer feedback loop    |
| Disabling `ruff` in `pyproject.toml` to "skip the failure" | Disables the safety net; the file becomes a drift accumulator     |

## Takeaway

If your CI runs Ruff, your pre-flight needs to run all of Ruff's gates — not
just the one whose error message you remember. A three-line shell function
saves you the three-cycle loop. The cost is seconds per push; the savings is
CI minutes plus the context-switch tax of waiting for red builds.
