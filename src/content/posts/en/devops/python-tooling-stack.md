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
  - url: 'https://astral.sh/uv/install.sh'
    title: install.sh
    type: verified
  - url: 'https://github.com/astral-sh/ruff-pre-commit'
    title: ruff pre commit
    type: official
  - url: 'https://github.com/pre-commit/mirrors-mypy'
    title: mirrors mypy
    type: official
  - url: 'https://docs.astral.sh/uv/'
    title: uv
    type: official
  - url: 'https://docs.astral.sh/ruff/'
    title: ruff
    type: official
  - url: 'https://docs.astral.sh/ty/'
    title: ty
    type: official
  - url: 'https://astral.sh/blog/ty'
    title: ty
    type: verified
  - url: 'https://asdf-vm.com/'
    title: asdf-vm.com
    type: verified
---

## The Problem

Python's tooling ecosystem is fragmented. A typical project needs separate tools
for version management (pyenv), package management (pip/poetry), linting
(flake8), formatting (black), import sorting (isort), and type checking (mypy).
Each has its own config format, update cycle, and quirks. The combined startup
overhead for new projects was high, and inconsistency across MOBA repositories
(ETL, Airflow, services) made onboarding and maintenance painful.

---

## Difficulties Encountered

- **Poetry + asdf conflicts** — Poetry manages its own virtual environments,
  which clashed with asdf-managed Python versions. Activating the wrong venv
  silently used the wrong Python binary, causing import errors.
- **Ruff rule selection overload** — Ruff implements 800+ lint rules from dozens
  of plugins. Choosing the right `select` set without drowning in false
  positives required iterating through several rounds of `--fix` and
  suppression.
- **ty beta gaps** — ty is beta software and occasionally disagrees with mypy on
  edge cases (e.g., `structlog` typing stubs). Had to decide whether to add
  `type: ignore` comments or wait for upstream fixes.
- **Pre-commit hook ordering** — Running ruff-format before ruff-check matters;
  reversing the order causes format-then-lint loops where fixing lint issues
  re-introduces formatting violations.

---

## The Stack

| Tool           | Purpose                     | Replaces               |
| -------------- | --------------------------- | ---------------------- |
| **asdf**       | Python version management   | pyenv, manual installs |
| **uv**         | Package management (fast)   | pip, pip-tools, poetry |
| **ruff**       | Linting + formatting        | Black + Flake8 + isort |
| **ty**         | Static type checking (fast) | mypy, Pyright          |
| **pre-commit** | Git hook management         | manual hooks           |

All tools except asdf are from **Astral** (Rust-based, fast, consistent).

## Why This Combination

### asdf + uv (Not Poetry)

| Aspect      | uv                    | Poetry                   |
| ----------- | --------------------- | ------------------------ |
| Speed       | 10-100x faster (Rust) | Slower (Python)          |
| Made by     | Astral (same as Ruff) | Sébastien Eustace        |
| Complexity  | Simple, pip-like      | More complex, all-in-one |
| asdf compat | Excellent             | Can conflict with venv   |

**Decision:** uv is simpler and faster. Poetry is overkill for ETL scripts. Same
ecosystem as Ruff (Astral) = consistent tooling philosophy.

### Ruff (Not Black + Flake8 + isort)

- Single tool replaces three
- 10-100x faster (Rust)
- Consistent configuration in `pyproject.toml`
- Auto-fix capabilities

### ty (Not mypy)

- 10-60x faster than mypy (Rust-based)
- Same ecosystem as uv and ruff (Astral)
- Beta status but production-ready (Astral uses it internally)
- Better IDE integration via LSP
- Install: `uv tool install ty@latest`

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

### .tool-versions

```text
python 3.11.7
```

## Type Checking Patterns

These patterns work with both ty and mypy.

### Assertions for None Checks

```python
def run(self) -> int:
    self.setup()

    # Assert for type narrowing
    assert self.args is not None, "JobArgs not initialized"
    assert self.config is not None, "Config not initialized"

    self.logger.info("Starting", dag_run_id=self.args.dag_run_id)
```

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

### boto3 Client kwargs

```python
from typing import Any

client_kwargs: dict[str, Any] = {"region_name": region}
if endpoint_url:
    client_kwargs["config"] = BotoConfig(s3={"addressing_style": "path"})
```

## Migration: mypy → ty

If migrating from mypy:

1. Install ty: `uv tool install ty@latest`
2. Run: `ty check .` (no config needed initially)
3. Update pre-commit hook
4. Remove mypy from requirements-dev.txt (optional, keep as fallback)

## When to Use

- Any new Python project in the MOBA ecosystem (ETL, Airflow, services)
- Greenfield Python projects where you can choose tooling from scratch
- Migrating existing projects off fragmented tooling (pip + black + flake8 +
  isort + mypy) to a unified Astral-based stack

---

## When NOT to Use

- **Existing projects locked to Poetry** — If a large team already depends on
  Poetry workflows and `poetry.lock`, migrating mid-sprint adds risk for little
  immediate benefit
- **Non-Python projects** — This stack is Python-specific; do not try to force
  ruff or ty on polyglot repos that are primarily another language
- **Projects requiring stable type checking** — ty is still beta; for
  compliance-critical codebases where type-check results must be reproducible
  and stable, stick with mypy until ty reaches 1.0
- **Single-file scripts** — For throwaway scripts or notebooks, the full
  pre-commit + ruff + ty setup is overkill; just run `ruff check` manually

---

## References

- [uv Documentation](https://docs.astral.sh/uv/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [ty Documentation](https://docs.astral.sh/ty/)
- [ty Announcement Blog](https://astral.sh/blog/ty)
- [asdf Documentation](https://asdf-vm.com/)
