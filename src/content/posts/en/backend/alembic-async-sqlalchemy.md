---
title: Alembic with Async SQLAlchemy
description: Configuring Alembic migrations to work with SQLAlchemy's async engine
date: 2026-02-03T00:00:00.000Z
updated: 2026-02-03T00:00:00.000Z
tags:
  - backend
  - alembic
  - sqlalchemy
  - python
  - database
category: backend
draft: false
lang: en
references:
  - url: >-
      https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic
    title: Alembic - Using asyncio with Alembic
    type: official
  - url: 'https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html'
    title: SQLAlchemy Async I/O Extension
    type: official
---

(asyncpg/aiosqlite).

---

## The Problem

Setting up Alembic for a project using SQLAlchemy's async engine (asyncpg) is
not straightforward. Alembic's default `env.py` assumes a synchronous engine, so
`alembic init` output does not work out of the box with
`async_engine_from_config()`. Without the correct bridging pattern, migrations
either fail at runtime or autogenerate produces empty migration files.

## Difficulties Encountered

- **Default env.py is sync-only** — Alembic's generated `env.py` uses
  `engine_from_config()`, which does not support asyncpg. No error at import
  time; it fails only when you run a migration.
- **Empty autogenerate migrations** — Forgetting to import model modules before
  accessing `Base.metadata` silently produces migrations with no operations. The
  error message gives no hint about missing imports.
- **run_sync bridging is non-obvious** — The pattern of wrapping a sync callable
  inside `connection.run_sync()` is documented in a cookbook page, not in the
  main Alembic tutorial, so it is easy to miss.
- **Connection pooling confusion** — The default pool class works for
  long-running apps but causes connection leaks or warnings in short-lived
  migration scripts, leading to misleading debugging.

---

## Key Points

- Alembic's `env.py` needs `async_engine_from_config()` from
  `sqlalchemy.ext.asyncio`
- Use `connection.run_sync(do_run_migrations)` to bridge async engine with sync
  migration runner
- Import all models before `target_metadata = Base.metadata` to ensure
  autogenerate finds all tables
- Use `NullPool` for migration connections (short-lived, no pooling needed)

## The Solution

```python
# alembic/env.py
import asyncio
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

# Import Base and all models
from app.db import Base
from app.models.user import User    # noqa: F401
from app.models.note import Note    # noqa: F401

target_metadata = Base.metadata

def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(
            config.config_ini_section, {}
        ),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def run_migrations_online():
    asyncio.run(run_async_migrations())
```

## alembic.ini Configuration

```ini
[alembic]
script_location = alembic

# Use async driver in URL
sqlalchemy.url = postgresql+asyncpg://user:pass@host/db
```

## Common Commands

```bash
# Create a new migration
alembic revision --autogenerate -m "add users table"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1

# Show current revision
alembic current
```

## Why NullPool

Migrations are short-lived operations. Connection pooling adds overhead with no
benefit — each migration run creates one connection, runs DDL statements, and
exits. `NullPool` creates a fresh connection each time and closes it immediately
after use.

## Gotcha: Model Imports

```python
# Models MUST be imported before accessing Base.metadata
# Otherwise autogenerate won't detect tables

from app.models.user import User    # noqa: F401
from app.models.note import Note    # noqa: F401

# NOW this contains all table metadata
target_metadata = Base.metadata
```

Without the imports, `Base.metadata.tables` is empty and
`alembic revision --autogenerate` generates an empty migration.

---

## When to Use

- Any project using SQLAlchemy 2.0+ async engine (asyncpg, aiosqlite) that needs
  Alembic migrations
- FastAPI or other async frameworks where the ORM layer is async
- Projects where autogenerate is desired for migration creation

## When NOT to Use

- **Synchronous SQLAlchemy projects** — Standard `env.py` works fine; adding the
  async bridging pattern is unnecessary complexity
- **Non-SQLAlchemy ORMs** — Tortoise ORM, SQLModel (if using its own migration
  tool), or Django ORM have their own migration systems
- **Schema-less databases** — MongoDB, DynamoDB, and other NoSQL stores do not
  use Alembic
- **One-off scripts or notebooks** — If you only need to create tables once
  (e.g., `Base.metadata.create_all()`), Alembic is overkill
