---
title: Python Tooling Stack
description: Standard Python development tooling for all MOBA projects.
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-28T00:00:00.000Z
tags:
  - devops
  - python
  - tooling
category: devops
draft: false
lang: en
references:
  - url: "https://astral.sh/uv/install.sh"
    title: install.sh
    type: verified
  - url: "https://github.com/astral-sh/ruff-pre-commit"
    title: ruff pre commit
    type: official
  - url: "https://github.com/pre-commit/mirrors-mypy"
    title: mirrors mypy
    type: official
  - url: "https://docs.astral.sh/uv/"
    title: uv
    type: official
  - url: "https://docs.astral.sh/ruff/"
    title: ruff
    type: official
  - url: "https://docs.astral.sh/ty/"
    title: ty
    type: official
  - url: "https://astral.sh/blog/ty"
    title: ty
    type: verified
  - url: "https://asdf-vm.com/"
    title: asdf-vm.com
    type: verified
---

I was spending more time configuring Python tools than writing Python code.
Every new project meant re-fighting the same battles: pyenv vs asdf, pip vs
Poetry, flake8 vs pylint, black vs autopep8. Across multiple MOBA repositories
(ETL, Airflow, services), nothing was consistent, and onboarding new developers
meant walking them through a different setup every time.

I needed a single, opinionated stack that worked everywhere.

## Why This Matters

Python's tooling ecosystem is famously fragmented. A typical project needs
separate tools for version management (pyenv), package management (pip/Poetry),
linting (flake8), formatting (black), import sorting (isort), and type checking
(mypy). Each has its own configuration format, update cycle, and quirks.

The combined startup overhead for new projects was high. Worse, inconsistency
across repositories made maintenance painful. A lint rule that passed in one
repo would fail in another. Dependency resolution took forever in CI. And every
developer had a slightly different local setup that "worked on my machine."

## The Difficulties

Before landing on this stack, I hit several walls.

**Poetry and asdf did not play well together.** Poetry manages its own virtual
environments, which clashed with asdf-managed Python versions. Activating the
wrong venv silently used the wrong Python binary, causing import errors that
were maddening to debug.

**Ruff rule selection was overwhelming.** Ruff implements 800+ lint rules from
dozens of plugins. Choosing the right `select` set without drowning in false
positives required iterating through several rounds of `--fix` and suppression.

**ty had beta gaps.** ty is beta software and occasionally disagrees with mypy
on edge cases (e.g., `structlog` typing stubs). I had to decide whether to add
`type: ignore` comments or wait for upstream fixes.

**Pre-commit hook ordering matters.** Running ruff-format before ruff-check is
required. Reversing the order causes format-then-lint loops where fixing lint
issues re-introduces formatting violations.

## The Stack

Here is the full tooling stack I settled on:

| Tool           | Purpose                     | Replaces               |
| -------------- | --------------------------- | ---------------------- |
| **asdf**       | Python version management   | pyenv, manual installs |
| **uv**         | Package management (fast)   | pip, pip-tools, poetry |
| **ruff**       | Linting + formatting        | Black + Flake8 + isort |
| **ty**         | Static type checking (fast) | mypy, Pyright          |
| **pre-commit** | Git hook management         | manual hooks           |

All tools except asdf are from **Astral** (Rust-based, fast, consistent). That
consistency is the key selling point: one ecosystem, one philosophy, one place
to report issues.

## Why This Combination

### asdf + uv (Not Poetry)

| Aspect      | uv                    | Poetry                   |
| ----------- | --------------------- | ------------------------ |
| Speed       | 10-100x faster (Rust) | Slower (Python)          |
| Made by     | Astral (same as Ruff) | Sebastien Eustace        |
| Complexity  | Simple, pip-like      | More complex, all-in-one |
| asdf compat | Excellent             | Can conflict with venv   |

uv is simpler and faster. Poetry is overkill for ETL scripts and data
pipelines. Because uv comes from the same ecosystem as Ruff (Astral), the
tooling philosophy is consistent across the board.

### Ruff (Not Black + Flake8 + isort)

A single tool replaces three separate ones. It is 10-100x faster because it is
written in Rust, provides consistent configuration in `pyproject.toml`, and
has auto-fix capabilities built in. No more coordinating versions between
three different linters.

### ty (Not mypy)

ty is 10-60x faster than mypy (also Rust-based) and lives in the same Astral
ecosystem as uv and Ruff. It is beta but production-ready: Astral uses it
internally. The IDE integration via LSP is a bonus.

Install it with: `uv tool install ty@latest`

## Setup

### 1. Install Tools

```bash
# asdf (version manager)
brew install asdf

# Add Python plugin
asdf plugin add python

# Install Python
asdf install python 3.11.7
asdf local python 3.11.7  # creates .tool-versions

# uv (package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# ty (type checker)
uv tool install ty@latest
```

### 2. Project Setup

```bash
# Create venv and install deps
uv venv
uv pip install -r requirements.txt -r requirements-dev.txt

# Or use sync (reads pyproject.toml)
uv sync

# Install pre-commit hooks
uv run pre-commit install
```

### 3. Daily Workflow

```bash
# Run commands in venv
uv run python -m cli amplitude-etl
uv run pre-commit run --all-files
uv run pytest

# Add a package
uv add pandas

# Format + lint
uv run ruff format .
uv run ruff check --fix .

# Type check
ty check common/ jobs/
```

The key pattern is `uv run` for everything. It ensures you are always in the
correct virtual environment without manual activation.

## Configuration Files

### pyproject.toml

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "W", "F", "I", "N", "UP", "B", "C4", "DTZ", "SIM"]

# ty configuration (when needed)
[tool.ty]
python-version = "3.11"
```

The `select` list is curated from experience. `E` and `W` cover pycodestyle
errors and warnings, `F` is pyflakes, `I` is isort, `N` is naming conventions,
`UP` catches Python upgrade opportunities, `B` is bugbear for common pitfalls,
`C4` simplifies comprehensions, `DTZ` enforces timezone-aware datetimes, and
`SIM` suggests simplifications. This set catches real bugs without drowning you
in noise.

### .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.14.14
    hooks:
      - id: ruff-format
      - id: ruff
        args: [--fix]

  # Option 1: ty (Astral - recommended)
  - repo: local
    hooks:
      - id: ty
        name: ty type check
        entry: ty check
        language: system
        types: [python]
        pass_filenames: false

  # Option 2: mypy (if ty not ready for your project)
  # - repo: https://github.com/pre-commit/mirrors-mypy
  #   rev: v1.8.0
  #   hooks:
  #     - id: mypy
```

Notice that `ruff-format` runs before `ruff` (lint). This ordering is
important. If you reverse it, lint fixes can break formatting, and the next
commit triggers the same cycle again.

### .tool-versions

```text
python 3.11.7
```

This file lives at the project root. When any developer enters the directory,
asdf automatically switches to the correct Python version. No more "works on my
machine" issues.

## Type Checking Patterns

These patterns work with both ty and mypy, so they are safe regardless of which
checker you use.

### Assertions for None Checks

```python
def run(self) -> int:
    self.setup()

    # Assert for type narrowing
    assert self.args is not None, "JobArgs not initialized"
    assert self.config is not None, "Config not initialized"

    self.logger.info("Starting", dag_run_id=self.args.dag_run_id)
```

Assertions are the cleanest way to narrow optional types. The type checker
understands `assert x is not None` as proof that `x` is not `None` from that
point forward.

### structlog Type Casting

```python
from typing import cast
from structlog.typing import Processor

def get_logger(name: str, **context: Any) -> structlog.BoundLogger:
    logger = structlog.get_logger(name)
    if context:
        logger = logger.bind(**context)
    return cast(structlog.BoundLogger, logger)
```

structlog's typing stubs are incomplete, so `cast` is needed to avoid false
positives. This is one of those pragmatic choices: you know the runtime type is
correct, the stubs just do not express it.

### boto3 Client kwargs

```python
from typing import Any

client_kwargs: dict[str, Any] = {"region_name": region}
if endpoint_url:
    client_kwargs["config"] = BotoConfig(s3={"addressing_style": "path"})
```

boto3's types are notoriously loose. Using `dict[str, Any]` for kwargs is the
practical choice until the boto3-stubs package matures.

## Migration: mypy to ty

If you are migrating from mypy, the process is straightforward:

1. Install ty: `uv tool install ty@latest`
2. Run: `ty check .` (no config needed initially)
3. Update the pre-commit hook
4. Remove mypy from requirements-dev.txt (optional, keep as fallback)

ty and mypy will disagree on some edge cases. When they do, check if the
disagreement is a ty bug or a mypy false positive. In most cases, ty is
stricter in ways that catch real issues.

## Why This Works

The entire stack reduces to five tools, four of which share the same Rust-based
ecosystem. Configuration lives in two files (`pyproject.toml` and
`.pre-commit-config.yaml`). New projects take minutes to set up, not hours.

More importantly, every MOBA repository now has the same tooling. A developer
who works on the ETL pipeline in the morning and the Airflow DAGs in the
afternoon uses the same commands, the same lint rules, and the same type checker
in both.

## Practical Takeaway

**Use this stack when** starting any new Python project, especially if you
manage multiple repositories. The Astral ecosystem (uv + Ruff + ty) eliminates
the fragmentation that makes Python tooling painful.

**Skip it when** your team is deeply invested in Poetry and has no appetite for
migration, or when you are writing throwaway scripts that do not need lint/type
discipline. Also hold off on ty for compliance-critical codebases until it
reaches 1.0 -- stick with mypy there.

The biggest win is not speed (though 10-100x is nice). It is consistency. One
stack, one config pattern, one set of rules across every project.

---

## References

- [uv Documentation](https://docs.astral.sh/uv/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [ty Documentation](https://docs.astral.sh/ty/)
- [ty Announcement Blog](https://astral.sh/blog/ty)
- [asdf Documentation](https://asdf-vm.com/)
