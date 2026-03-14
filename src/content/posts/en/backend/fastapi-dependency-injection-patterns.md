---
title: FastAPI Dependency Injection Patterns
description: 'How to use Annotated types with FastAPI Depends() for reusable, type-safe dependency injection across routers.'
date: 2026-02-03T00:00:00.000Z
updated: 2026-03-15T00:00:00.000Z
expanded: true
tags:
  - backend
  - fastapi
  - python
category: backend
draft: false
lang: en
references:
  - url: 'https://fastapi.tiangolo.com/tutorial/dependencies/'
    title: FastAPI Dependencies
    type: official
  - url: >-
      https://fastapi.tiangolo.com/python-types/#type-hints-with-metadata-annotations
    title: FastAPI Type Hints with Metadata Annotations
    type: official
source_content_hash: aa72f8cae19baa43392565cf81ff068fa987362a17c7a97e3af2ce872092dc62
---

I was reviewing a pull request when I noticed the same `Depends(get_current_user)` call copy-pasted across twelve different router files. Worse, one router was converting `user.sub` to a `UUID` while three others passed it as a raw string — a type mismatch that only surfaced as a database query failure deep in the stack. When we later switched auth providers, every single router file needed updating.

There's a cleaner way. FastAPI's `Annotated` type pattern lets you define a dependency once and reuse it everywhere with full type safety. This post walks through the pattern, the pitfall that silently breaks it, and when to use it.

---

## Difficulties Encountered

- **Default value silently breaks injection**: Adding `= None` to an
  `Annotated[..., Depends()]` parameter does not raise an error — FastAPI
  quietly uses `None` instead of calling the dependency function. This produced
  `NoneType` errors deep in the stack, far from the actual cause.
- **Type mismatch across routers**: Some routers used `current_user.sub` as a
  string, others as a `UUID`. The bug only surfaced when a downstream query
  failed on type, not at the router boundary where the conversion should happen.
- **Docs show both old and new patterns**: FastAPI docs cover both the legacy
  `param = Depends(func)` and the newer `Annotated` pattern, making it unclear
  which to adopt. The `Annotated` pattern only works with Python 3.9+ and
  `typing_extensions`.

---

## Key Points

Before diving into the solution, here's the mental model to keep in mind:

- **`Annotated[Type, Depends(func)]` embeds the dependency in the type itself**, enabling reuse across routers. Instead of repeating `Depends(get_current_user)` in every endpoint, you define a `CurrentUser` type alias once and use it everywhere.
- **When using `Annotated`, do NOT provide a default value (`= None`).** This is the most common pitfall — it silently overrides the `Depends` metadata and breaks injection without any error.
- **Convert user identity at the router boundary** (e.g., `UUID(current_user.sub)`) to avoid type mismatches deeper in the stack. If you leave this conversion to individual service methods, some will convert and others won't.
- **Session injection via `Depends(get_db_session)`** ensures proper unit-of-work lifecycle per request — each request gets its own database session that's automatically closed when the request ends.

---

## The Solution

The core idea is to create a reusable type alias that encapsulates both the dependency function and its return type. Define it once in a `deps.py` module, then import it in any router:

```python
from typing import Annotated
from fastapi import Depends

# Define reusable type alias (once, in deps.py)
CurrentUser = Annotated[
    KeycloakTokenClaims,
    Depends(get_current_user)
]

# Use in any router (clean, no Depends() boilerplate)
@router.get("/items")
async def list_items(
    current_user: CurrentUser,  # NO default value!
    session: AsyncSession = Depends(get_db_session),
) -> list[Item]:
    user_id = UUID(current_user.sub)  # Convert at boundary
    ...
```

Notice how the `CurrentUser` type carries the dependency with it — no `Depends()` call needed at the router level. The `session` parameter still uses the traditional pattern because database sessions are typically not shared across a `deps.py` type alias (they're per-request by nature).

The `UUID(current_user.sub)` conversion at line 9 is deliberate: it ensures every downstream function receives a proper `UUID` object, not a string that might or might not be a valid UUID.

---

## Common Pitfall

This is the single most important thing to remember about the `Annotated` pattern:

```python
# BAD: Default value breaks Annotated dependency injection
async def endpoint(current_user: CurrentUser = None):
    ...  # FastAPI uses None instead of calling get_current_user

# GOOD: No default value
async def endpoint(current_user: CurrentUser):
    ...  # FastAPI extracts Depends from Annotated metadata
```

The reason this is so dangerous is the failure mode: FastAPI doesn't raise an error. It doesn't log a warning. It silently uses `None` and your code fails somewhere else entirely — typically as an `AttributeError: 'NoneType' has no attribute 'sub'` deep in a service method, far from the router where the actual mistake lives.

---

## When to Use

- **Multiple routers share the same dependency** — authentication and database sessions are the most common cases. If three or more routers call the same `Depends()` function, it's time for an `Annotated` type alias.
- **You want IDE autocomplete on the injected type** — `CurrentUser` gives you autocomplete for `KeycloakTokenClaims` fields, while bare `Depends()` gives you `Any`.
- **The dependency requires consistent type conversion at the boundary** — e.g., `str` to `UUID`. Centralizing this in the type alias prevents inconsistencies.
- **You plan to create variants** — `AdminUser`, `OptionalUser`, `ServiceAccount` can all be defined as separate type aliases with different dependency functions.

## When NOT to Use

- **One-off dependencies**: If a dependency is used in a single endpoint, inline
  `Depends(func)` is simpler and more explicit than creating a type alias.
- **Optional dependencies with defaults**: The `Annotated` pattern conflicts
  with default values. If the dependency truly needs to be optional (e.g.,
  anonymous-allowed endpoints), use the traditional `param = Depends(func)`
  pattern with explicit `Optional[Type]`.
- **Non-FastAPI frameworks**: The `Annotated[..., Depends()]` pattern is
  FastAPI-specific. Other frameworks (Flask, Django) have different DI
  mechanisms.

---

## Why This Matters

The `Annotated` dependency pattern might seem like a small refactor, but it addresses real maintenance pain:

- **Type safety**: IDE autocomplete works with the concrete type (`KeycloakTokenClaims`), not a generic dependency placeholder. You catch type errors at the editor level, not at runtime.
- **Reusability**: Define once in `deps.py`, import everywhere. When you switch auth providers (say, from Keycloak to Auth0), you update one type alias instead of twenty router files.
- **Clean routers**: No repeated `Depends(get_current_user)` calls cluttering your function signatures. The dependency is embedded in the type itself.
- **Composable**: Need an admin-only endpoint? Create `AdminUser = Annotated[KeycloakTokenClaims, Depends(get_admin_user)]`. Need optional auth? Use the traditional `Depends()` pattern for that specific case.

---

## Practical Takeaways

The `Annotated[Type, Depends(func)]` pattern is the recommended approach for FastAPI dependency injection as of Python 3.9+. Adopt it when you have dependencies shared across multiple routers — which is almost always the case for authentication and database sessions.

The one rule to remember: **never add a default value to an `Annotated` dependency parameter.** Writing `current_user: CurrentUser = None` silently bypasses the dependency injection entirely. FastAPI won't warn you — it just uses `None` instead of calling your dependency function. This is the most common pitfall, and it produces errors far from the actual cause.

For new FastAPI projects, create a `deps.py` file early and define your shared dependencies as `Annotated` type aliases from the start. It's much easier than retrofitting the pattern across existing routers later.
