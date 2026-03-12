---
title: Alembic with Async SQLAlchemy
description: Configuring Alembic migrations to work with SQLAlchemy's async engine
date: 2026-02-03T00:00:00.000Z
updated: 2026-03-09T00:00:00.000Z
tags:
  - backend
  - alembic
  - sqlalchemy
  - python
  - database
category: backend
draft: false
lang: en
expanded: true
source_content_hash: 0c00c0d49d76b48c48ecc6de60bbcc3a0a38eb2a1d0a5f236a1a9b30e0827153
references:
  - url: >-
      https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic
    title: Alembic - Using asyncio with Alembic
    type: official
  - url: "https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html"
    title: SQLAlchemy Async I/O Extension
    type: official
---

You run `alembic init`, swap your database URL to use `asyncpg`, run
`alembic upgrade head`, and get a cryptic error about synchronous engines. The
default `env.py` that Alembic generates does not work with async drivers. Here is
the bridging pattern you need, plus every pitfall I hit along the way.

## The Problem

Alembic assumes a synchronous database engine. Its generated `env.py` calls
`engine_from_config()`, which does not support async drivers like asyncpg or
aiosqlite. Without the correct bridging pattern, migrations either fail at
runtime or — worse — autogenerate produces empty migration files with no
indication of what went wrong.

The fix lives in an Alembic cookbook page, not the main tutorial. If you follow
the getting-started guide and plug in an async URL, you will hit a wall.

## The Pitfalls

Each of these cost me debugging time. None of them produce helpful error
messages.

**Default env.py is sync-only.** Alembic's generated `env.py` uses
`engine_from_config()`, which does not support asyncpg. No error at import
time — it fails only when you run a migration.

**Empty autogenerate migrations.** Forgetting to import model modules before
accessing `Base.metadata` silently produces migrations with no operations.
Alembic does not warn you that `Base.metadata.tables` is empty.

**run_sync bridging is non-obvious.** The pattern of wrapping a sync callable
inside `connection.run_sync()` is the key to making this work, but it is buried
in a cookbook page rather than the main docs.

**Connection pooling confusion.** The default pool class works for long-running
apps but causes connection leaks or warnings in short-lived migration scripts.
This leads to misleading debugging sessions where the pool, not your migration
logic, is the problem.

**PostgreSQL enum extension is DDL-only.** `ALTER TYPE ... ADD VALUE` cannot run
inside a transaction block. Alembic wraps migrations in transactions by default,
so adding a value to an existing enum type fails with a "cannot be executed
inside a transaction block" error. You must use `op.execute()` with
`autocommit` isolation or run the statement outside the transaction context. The
downgrade path is even worse: PostgreSQL does not support removing values from an
existing enum type. You need to create a new type without the value, migrate all
columns to the new type, and drop the old one.

## The Solution

Replace Alembic's default `env.py` with this async-aware version:

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

Three things happen here that differ from the default:

1. `async_engine_from_config()` replaces `engine_from_config()`
2. `connection.run_sync()` bridges the async connection to Alembic's sync
   migration runner
3. `NullPool` replaces the default connection pool

### alembic.ini Configuration

```ini
[alembic]
script_location = alembic

# Use async driver in URL
sqlalchemy.url = postgresql+asyncpg://user:pass@host/db
```

## Why NullPool

Migrations are short-lived operations. Connection pooling adds overhead with no
benefit — each migration run creates one connection, runs DDL statements, and
exits. `NullPool` creates a fresh connection each time and closes it immediately
after use. No leaked connections, no pool-related warnings.

## Gotcha: Model Imports

This is the most common source of "empty migration" confusion:

```python
# Models MUST be imported before accessing Base.metadata
# Otherwise autogenerate won't detect tables

from app.models.user import User    # noqa: F401
from app.models.note import Note    # noqa: F401

# NOW this contains all table metadata
target_metadata = Base.metadata
```

Without the imports, `Base.metadata.tables` is empty and
`alembic revision --autogenerate` generates an empty migration. The `# noqa`
comments are intentional — linters flag these as unused imports, but they are
side-effect imports that register models with SQLAlchemy's metadata registry.

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

## The Pattern in One Sentence

Replace `engine_from_config` with `async_engine_from_config`, wrap your sync
migration runner in `connection.run_sync()`, use `NullPool`, and import every
model before touching `Base.metadata`. That is the entire recipe — everything
else is debugging the consequences of missing one of those four steps.
