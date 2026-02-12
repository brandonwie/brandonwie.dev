---
title: FastAPI Dependency Injection Patterns
description: >-
  Repeating `Depends(get_current_user)` in every route handler creates
  boilerplate
date: 2026-02-03T00:00:00.000Z
updated: 2026-02-03T00:00:00.000Z
tags:
  - backend
  - fastapi
  - python
category: backend
draft: false
lang: en
references:
  - url: "https://fastapi.tiangolo.com/tutorial/dependencies/"
    title: FastAPI Dependencies
    type: official
  - url: >-
      https://fastapi.tiangolo.com/python-types/#type-hints-with-metadata-annotations
    title: FastAPI Type Hints with Metadata Annotations
    type: official
---

I had six routers that all needed the current user from Keycloak. Each one
repeated `Depends(get_current_user)`, and three of them handled the user ID
differently -- some passed `user.sub` as a raw string, others converted it to
`UUID`. The inconsistency did not show up until a downstream database query
failed on a type mismatch.

The fix was not to add more validation. It was to centralize the dependency
into a reusable type alias so every router gets the same thing, the same way.

## Why This Matters

Repeating `Depends(get_current_user)` in every route handler creates two
problems. First, it is boilerplate. Every new endpoint needs the same three
lines. Second, and more dangerous, it makes inconsistencies easy to introduce.
Without a centralized dependency type, changing the auth provider means
touching every router file.

In a growing codebase with multiple developers, "copy this pattern from the
other router" is how type mismatches and subtle bugs accumulate.

## The Solution: Annotated Type Aliases

Python's `Annotated` type (3.9+) lets you embed `Depends()` metadata directly
into a type alias. Define it once, use it everywhere.

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

The `CurrentUser` alias carries both the type information (for IDE
autocomplete) and the dependency metadata (for FastAPI's injector). Any router
that uses `current_user: CurrentUser` automatically gets the Keycloak token
without importing or repeating `Depends(get_current_user)`.

## The Pitfall That Bit Me

This is the trap that cost me an hour of debugging:

```python
# BAD: Default value breaks Annotated dependency injection
async def endpoint(current_user: CurrentUser = None):
    ...  # FastAPI uses None instead of calling get_current_user

# GOOD: No default value
async def endpoint(current_user: CurrentUser):
    ...  # FastAPI extracts Depends from Annotated metadata
```

Adding `= None` to an `Annotated[..., Depends()]` parameter does not raise an
error. FastAPI silently uses `None` instead of calling the dependency function.
The result is `NoneType` errors deep in the stack, far from the actual cause.

This happens because Python evaluates default values before FastAPI inspects
the `Annotated` metadata. The default takes precedence, and the `Depends()`
metadata is never read.

## Why This Is Hard to Discover

**FastAPI docs show both patterns.** The official documentation covers both the
legacy `param = Depends(func)` and the newer `Annotated` pattern. When you are
learning, it is unclear which to adopt. The `Annotated` pattern only works with
Python 3.9+ and `typing_extensions`, which adds to the confusion.

**The old pattern allows defaults.** With the legacy style, `param =
Depends(func)` is the standard way to declare a dependency. It looks like a
default value. So when you switch to `Annotated`, the instinct is to add
`= None` for optional parameters. That instinct is wrong here.

**Type mismatches surface late.** Some routers used `current_user.sub` as a
string, others as a `UUID`. The bug only appeared when a downstream query
failed on type, not at the router boundary where the conversion should happen.

## Composability

Once you have the base pattern, creating variants is straightforward:

```python
# Base: required authenticated user
CurrentUser = Annotated[
    KeycloakTokenClaims,
    Depends(get_current_user)
]

# Variant: admin-only
AdminUser = Annotated[
    KeycloakTokenClaims,
    Depends(get_admin_user)
]

# Each router uses the appropriate type
@router.get("/admin/users")
async def list_users(admin: AdminUser): ...

@router.get("/items")
async def list_items(user: CurrentUser): ...
```

## Practical Takeaway

**When to use `Annotated` type aliases:**

- Multiple routers share the same dependency (auth, DB session)
- You want IDE autocomplete on the injected type
- The dependency requires consistent type conversion at the boundary (e.g.,
  `str` to `UUID`)
- You plan to create variants (`AdminUser`, `OptionalUser`)

**When to keep inline `Depends()`:**

- **One-off dependencies**: If a dependency is used in a single endpoint,
  inline `Depends(func)` is simpler and more explicit than creating a type
  alias.
- **Optional dependencies with defaults**: The `Annotated` pattern conflicts
  with default values. If the dependency truly needs to be optional (e.g.,
  anonymous-allowed endpoints), use the traditional `param = Depends(func)`
  pattern with explicit `Optional[Type]`.
- **Non-FastAPI frameworks**: The `Annotated[..., Depends()]` pattern is
  FastAPI-specific. Other frameworks (Flask, Django) have different DI
  mechanisms.

The core rule: define dependencies as `Annotated` types in a shared `deps.py`,
convert user identity at the router boundary, and never add a default value to
an `Annotated` dependency parameter.
