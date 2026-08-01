---
title: Python Tooling Stack
description: >-
  Consolidating fragmented Python tooling into five tools — asdf, uv, ruff, ty,
  and pre-commit — and why each one won.
date: 2026-01-27T00:00:00.000Z
updated: '2026-08-02'
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
source_content_hash: 269a8ae05596c621827bbc69511f9e34aff95874d9b756beb997a9bdfa62f2a4
expanded: true
---

Every new Python project started with the same tedious setup ritual: install pyenv for version management, pip or poetry for packages, black for formatting, flake8 for linting, isort for import sorting, and mypy for type checking. Each tool had its own config format, update cycle, and quirks. Across multiple repositories (ETL pipelines, Airflow DAGs, services), no two projects had the same tooling setup.

I consolidated everything into a five-tool stack that's fast, consistent, and mostly from a single ecosystem. Here's what it looks like and why each choice was made.

## The Stack

| Tool           | Purpose                     | Replaces               |
| -------------- | --------------------------- | ---------------------- |
| **asdf**       | Python version management   | pyenv, manual installs |
| **uv**         | Package management (fast)   | pip, pip-tools, poetry |
| **ruff**       | Linting + formatting        | Black + Flake8 + isort |
| **ty**         | Static type checking (fast) | mypy, Pyright          |
| **pre-commit** | Git hook management         | manual hooks           |

All tools except asdf are from **Astral** — Rust-based, fast, and designed to work together. This consistency matters more than you'd expect: same config philosophy, same release cadence, same quality bar.

## Why These Specific Tools

### asdf + uv (Not Poetry)

The first decision was package management. Poetry is the most popular choice, but it conflicted with asdf-managed Python versions in frustrating ways — Poetry manages its own virtual environments, which silently used the wrong Python binary when asdf's shims weren't aligned.

| Aspect      | uv                    | Poetry                   |
| ----------- | --------------------- | ------------------------ |
| Speed       | 10-100x faster (Rust) | Slower (Python)          |
| Made by     | Astral (same as Ruff) | Sébastien Eustace        |
| Complexity  | Simple, pip-like      | More complex, all-in-one |
| asdf compat | Excellent             | Can conflict with venv   |

uv is simpler and dramatically faster. For ETL scripts and Airflow DAGs, Poetry's advanced features (dependency groups, plugin system) are overkill. And since uv comes from the same Astral ecosystem as Ruff, the tooling philosophy is consistent.

### Ruff (Not Black + Flake8 + isort)

Ruff replaces three tools with one. It handles linting, formatting, and import sorting, all from a single configuration in `pyproject.toml`. It's 10-100x faster than the Python-based alternatives because it's written in Rust.

The main difficulty was rule selection — Ruff implements 800+ lint rules from dozens of plugins. Choosing the right `select` set without drowning in false positives required iterating through several rounds of `--fix` and suppression.

### ty (Not mypy)

ty is Astral's type checker — 10-60x faster than mypy, same Rust foundation. It's still beta, and occasionally disagrees with mypy on edge cases (like `structlog` typing stubs). For compliance-critical codebases, mypy is still safer. For everything else, ty's speed makes it practical to run on every commit.

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
uv run python -m cli daily-export
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

## Configuration

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

The ruff rule selection covers: errors (E), warnings (W), pyflakes (F), isort (I), naming (N), pyupgrade (UP), bugbear (B), comprehensions (C4), datetime (DTZ), and simplification (SIM). This set catches real issues without drowning you in style opinions.

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

**Hook ordering matters:** `ruff-format` must run before `ruff` (check). Reversing the order causes format-then-lint loops where fixing lint issues re-introduces formatting violations.

### .tool-versions

```text
python 3.11.7
```

## Type Checking Patterns

These patterns work with both ty and mypy and address common typing challenges in ETL code:

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

## Migrating from mypy to ty

If you're on mypy and want to try ty:

1. Install: `uv tool install ty@latest`
2. Run: `ty check .` (no config needed initially)
3. Update the pre-commit hook
4. Keep mypy in requirements-dev.txt as a fallback until ty stabilizes

## When to Use This Stack

- New Python projects where you can choose tooling from scratch
- Migrating existing projects off fragmented tooling (pip + black + flake8 + isort + mypy)
- Any Python application repository (APIs, CLIs, ETL pipelines, Airflow DAGs)

## When NOT to Use This Stack

- **Existing projects locked to Poetry** — If a large team already depends on Poetry workflows and `poetry.lock`, migrating mid-sprint adds risk for little immediate benefit
- **Non-Python projects** — This stack is Python-specific; don't force ruff or ty on polyglot repos
- **Projects requiring stable type checking** — ty is still beta; for compliance-critical codebases, stick with mypy until ty reaches 1.0
- **Single-file scripts** — For throwaway scripts or notebooks, the full pre-commit + ruff + ty setup is overkill; run `ruff check` manually

## Takeaway

The Astral ecosystem (uv + ruff + ty) replaces five separate Python tools with three that share the same Rust foundation, configuration philosophy, and speed profile. Combined with asdf for version management and pre-commit for automation, this stack takes about 10 minutes to set up and eliminates the "every repo is different" problem. The key gotcha is pre-commit hook ordering — always format before lint.

## References

- [uv Documentation](https://docs.astral.sh/uv/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [ty Documentation](https://docs.astral.sh/ty/)
- [ty Announcement Blog](https://astral.sh/blog/ty)
- [asdf Documentation](https://asdf-vm.com/)
