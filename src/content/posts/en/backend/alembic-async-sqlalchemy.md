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
  - url: "https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html"
    title: SQLAlchemy Async I/O Extension
    type: official
---

I ran `alembic init`, pointed it at my async PostgreSQL database, ran
`alembic revision --autogenerate`, and got... an empty migration file. No
tables. No errors. The migration file had zero operations in it.

Getting Alembic to work with SQLAlchemy's async engine (asyncpg, aiosqlite)
requires a specific bridging pattern that is buried in a cookbook page rather
than the main tutorial. The default `env.py` that `alembic init` generates
assumes a synchronous engine, and it fails in two different ways depending on
what you get wrong first.

## Why This Is Tricky

Alembic's generated `env.py` uses `engine_from_config()`, which does not
support async drivers like asyncpg. No error at import time -- it only fails
when you run a migration. Swapping in `async_engine_from_config()` is the
first step, but there is a second problem lurking.

The autogenerate feature scans `Base.metadata` to discover your tables. If
you forget to import your model modules before accessing `Base.metadata`, the
metadata object is empty. Alembic dutifully generates a migration with no
operations. The error message gives no hint about missing imports -- it looks
like everything worked, but the migration does nothing.

On top of that, the `run_sync` bridging pattern (wrapping a synchronous
callable inside `connection.run_sync()`) is documented in an Alembic cookbook
page, not in the main tutorial. It is easy to miss entirely.

## The Async Bridging Pattern

The core idea is straightforward: create an async engine, get a connection,
then use `connection.run_sync()` to run the standard synchronous migration
logic inside that async connection.

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

There are three things to notice here.

First, `do_run_migrations` is a plain synchronous function. It receives a
synchronous connection object from `run_sync` and uses it to configure and
execute migrations the same way Alembic always has.

Second, `run_async_migrations` creates the async engine with `NullPool` and
calls `connection.run_sync(do_run_migrations)`. This bridges the async/sync
boundary -- the async connection runs the synchronous callable in a way that
Alembic's migration runner can work with.

Third, `run_migrations_online` is the entry point. It uses `asyncio.run()` to
drive the entire async chain from the synchronous context that Alembic
expects.

## The alembic.ini Configuration

The connection URL must use the async driver:

```ini
[alembic]
script_location = alembic

# Use async driver in URL
sqlalchemy.url = postgresql+asyncpg://user:pass@host/db
```

Note `postgresql+asyncpg` instead of `postgresql+psycopg2`. If you are using
SQLite for development, use `sqlite+aiosqlite`.

## Why NullPool

Migrations are short-lived operations. Connection pooling adds overhead with
no benefit -- each migration run creates one connection, runs DDL statements,
and exits. The default pool class works for long-running applications but
causes connection leaks or warnings in short-lived scripts. `NullPool`
creates a fresh connection each time and closes it immediately after use.

## The Model Import Gotcha

This is the most common silent failure. Models must be imported before
accessing `Base.metadata`, otherwise autogenerate will not detect any tables:

```python
# Models MUST be imported before accessing Base.metadata
# Otherwise autogenerate won't detect tables

from app.models.user import User    # noqa: F401
from app.models.note import Note    # noqa: F401

# NOW this contains all table metadata
target_metadata = Base.metadata
```

Without the imports, `Base.metadata.tables` is empty and
`alembic revision --autogenerate` generates an empty migration. The `# noqa:
F401` comments suppress linter warnings about unused imports -- these imports
exist for their side effects (registering table metadata), not because the
symbols are used directly.

## Common Commands

Once `env.py` is configured, the standard Alembic workflow works:

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

## When to Use This Pattern

This pattern applies to any project using SQLAlchemy 2.0+ with an async
engine (asyncpg, aiosqlite) that needs Alembic migrations. FastAPI projects
are the most common case, but any async framework where the ORM layer is async
will need this.

## When to Skip It

- **Synchronous SQLAlchemy projects** -- Standard `env.py` works fine. Adding
  the async bridging pattern is unnecessary complexity.
- **Non-SQLAlchemy ORMs** -- Tortoise ORM, SQLModel (if using its own
  migration tool), or Django ORM have their own migration systems.
- **Schema-less databases** -- MongoDB, DynamoDB, and other NoSQL stores do
  not use Alembic.
- **One-off scripts or notebooks** -- If you only need to create tables once
  (e.g., `Base.metadata.create_all()`), Alembic is overkill.

## Key Takeaways

The async Alembic setup has two failure modes that produce zero error messages:
missing model imports (empty migrations) and wrong pool class (connection
warnings). Both are silent. Get the `env.py` bridging pattern right, import
your models before `Base.metadata`, use `NullPool`, and Alembic works with
async SQLAlchemy the same way it always has with sync.
