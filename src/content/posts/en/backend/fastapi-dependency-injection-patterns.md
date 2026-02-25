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
  - url: 'https://fastapi.tiangolo.com/tutorial/dependencies/'
    title: FastAPI Dependencies
    type: official
  - url: >-
      https://fastapi.tiangolo.com/python-types/#type-hints-with-metadata-annotations
    title: FastAPI Type Hints with Metadata Annotations
    type: official
---

and makes it easy to introduce inconsistencies (e.g., one router converting
`user.sub` to `UUID` while another passes the raw string). Without a centralized
dependency type, changing the auth provider means touching every router file.

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

- `Annotated[Type, Depends(func)]` embeds the dependency in the type itself,
  enabling reuse across routers
- When using `Annotated`, do NOT provide a default value (`= None`) — it
  overrides the `Depends` metadata and breaks injection
- Convert user identity at the router boundary (e.g., `UUID(current_user.sub)`)
  to avoid type mismatches deeper in the stack
- Session injection via `Depends(get_db_session)` ensures proper unit-of-work
  lifecycle per request

---

## The Solution

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

---

## Common Pitfall

```python
# BAD: Default value breaks Annotated dependency injection
async def endpoint(current_user: CurrentUser = None):
    ...  # FastAPI uses None instead of calling get_current_user

# GOOD: No default value
async def endpoint(current_user: CurrentUser):
    ...  # FastAPI extracts Depends from Annotated metadata
```

---

## When to Use

- Multiple routers share the same dependency (auth, DB session)
- You want IDE autocomplete on the injected type
- The dependency requires consistent type conversion at the boundary (e.g.,
  `str` to `UUID`)
- You plan to create variants (`AdminUser`, `OptionalUser`)

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

- Type safety: IDE autocomplete works with the concrete type
- Reusability: Define once in `deps.py`, use everywhere
- Clean routers: No repeated `Depends(get_current_user)` calls
- Composable: Can create `AdminUser`, `OptionalUser` variants
