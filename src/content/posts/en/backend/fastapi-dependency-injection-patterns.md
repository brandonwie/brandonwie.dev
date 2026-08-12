---
title: FastAPI Dependency Injection Patterns
description: 'How to use Annotated types with FastAPI Depends() for reusable, type-safe dependency injection across routers.'
date: 2026-02-03T00:00:00.000Z
updated: '2026-08-12'
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
source_content_hash: a9465eed90f62db05441240e28d7238a9f5089d5f96e08f463dd719fbde3e47b
---

While consolidating authentication in a personal project, I found the same `Depends(get_current_user)` call repeated in router after router. Some passed `user.sub` through as a raw string; others converted it to a `UUID`. Nothing complained at the router boundary. The mismatch only surfaced as a database query failing on type, deep in the stack.

The fix wasn't more validation. It was moving the dependency into one reusable type alias so every router receives the same thing the same way. FastAPI's `Annotated` type pattern makes that possible with full type safety. It also has one silent failure mode that's worth knowing about before you adopt it.

---

## Difficulties Encountered

- **A `Union` wrapper silently breaks injection**: writing
  `Optional[CurrentUser] = None` (or `CurrentUser | None = None`) raises no
  error. FastAPI never calls the dependency function, the parameter simply
  arrives as `None`, and you get `NoneType` errors deep in the stack, far from
  the actual cause.
- **I wrote down the wrong cause**: my note from that session blamed the default
  value. Re-testing it for this post, a bare `current_user: CurrentUser = None`
  injects fine; the `Optional[...]` wrapper is what actually breaks injection.
  More on that below.
- **Type mismatch across routers**: Some routers used `current_user.sub` as a
  string, others as a `UUID`. The bug only surfaced when a downstream query
  failed on type, not at the router boundary where the conversion should happen.
- **Docs show both old and new patterns**: FastAPI docs cover both the legacy
  `param = Depends(func)` and the newer `Annotated` pattern, so it isn't obvious
  which one to adopt. `Annotated` lives in `typing` from Python 3.9 on (earlier
  versions need `typing_extensions`), and FastAPI has read it since 0.95.0.

---

## Key Points

- **`Annotated[Type, Depends(func)]` embeds the dependency in the type itself**, so one alias can be reused across routers. Instead of repeating `Depends(get_current_user)` in every endpoint, you define a `CurrentUser` type alias once and use it everywhere.
- **Never wrap the alias in `Optional[...]` or `| None`.** Once the outermost form of the annotation is a `Union`, FastAPI stops looking for `Annotated` metadata and the `Depends` is discarded without a word. If a dependency can legitimately return nothing, put the `Optional` *inside* the alias.
- **Convert user identity at the router boundary** (e.g., `UUID(current_user.sub)`) to avoid type mismatches deeper in the stack. If you leave this conversion to individual service methods, some will convert and others won't.
- **Session injection via `Depends(get_db_session)`** ensures proper unit-of-work lifecycle per request: each request gets its own database session, closed automatically when the request ends.

---

## The Solution

Create one type alias that carries both the dependency function and its return type. Define it once in a `deps.py` module, then import it in any router:

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
    current_user: CurrentUser,  # bare alias — no Optional[...] wrapper
    session: AsyncSession = Depends(get_db_session),
) -> list[Item]:
    user_id = UUID(current_user.sub)  # Convert at boundary
    ...
```

The `CurrentUser` type carries the dependency with it, so no `Depends()` call is needed at the router level. The `session` parameter still uses the traditional pattern because database sessions are typically not shared across a `deps.py` type alias (they're per-request by nature).

The `UUID(current_user.sub)` conversion is deliberate: it ensures every downstream function receives a proper `UUID` object, not a string that might or might not be a valid UUID.

---

## Common Pitfall

Three forms that look similar, only two of which actually inject:

```python
# BAD: the Union wrapper hides the Depends metadata — injection never runs
async def endpoint(current_user: Optional[CurrentUser] = None):
    ...  # current_user is None; get_current_user was never called

# GOOD: bare alias — FastAPI reads Depends from the Annotated metadata
async def endpoint(current_user: CurrentUser):
    ...

# GOOD: genuinely optional — Optional goes INSIDE the alias
OptionalUser = Annotated[
    Optional[KeycloakTokenClaims],
    Depends(get_optional_user),
]

async def endpoint(current_user: OptionalUser):
    ...  # get_optional_user runs and may return None
```

The first form is dangerous because of how it fails. FastAPI doesn't raise an error and doesn't log a warning. `Optional[CurrentUser]` is `Union[Annotated[...], None]`, and FastAPI only inspects `Annotated` metadata when `Annotated` is the outermost form, so it never sees the `Depends` at all. It falls back to treating the parameter as ordinary request data (an optional query parameter on some versions, a request-body field on others), and a plain `GET` supplies neither, so the `None` default wins. Your code then fails somewhere else entirely, usually as an `AttributeError: 'NoneType' has no attribute 'sub'` deep in a service method, far from the router where the actual mistake lives.

### A correction

My note from that session recorded the cause as "adding `= None` breaks `Annotated` injection." Writing this post, I went back and tested it, and that is not what happens. A bare `current_user: CurrentUser = None` still calls the dependency on every FastAPI version I tried (0.95.0, 0.100.0, 0.110.0, 0.115.0, 0.128.0, and 0.141.1), and the default is simply never used. It's dead code, not a trap.

The only form I could get to reproduce the silent bypass is the `Union` wrapper. The symptom I debugged was real; the cause I wrote down was not. I did not find either behavior spelled out in the FastAPI docs, so treat this as observed rather than specified. It held on every version above.

---

## When to Use

- **Multiple routers share the same dependency.** Authentication and database sessions are the most common cases. If three or more routers call the same `Depends()` function, it's time for an `Annotated` type alias.
- **You want IDE autocomplete on the injected type.** `CurrentUser` gives you autocomplete for `KeycloakTokenClaims` fields, while bare `Depends()` gives you `Any`.
- **The dependency requires consistent type conversion at the boundary**, such as `str` to `UUID`. Centralizing this in the type alias prevents inconsistencies.
- **You plan to create variants.** `AdminUser`, `OptionalUser`, and `ServiceAccount` can all be defined as separate type aliases with different dependency functions.

## When NOT to Use

- **One-off dependencies**: If a dependency is used in a single endpoint, inline
  `Depends(func)` is simpler and more explicit than creating a type alias.
- **Optional dependencies, if the nesting feels fussy**: `Annotated` handles
  them, but only with `Optional` inside the alias and a dependency function that
  returns `None` for anonymous callers. The traditional
  `user: Optional[Type] = Depends(func)` form is still fully supported and reads
  more plainly for a one-off anonymous-allowed endpoint. In that form the
  `Depends` comes from the default value, so the `Union` never hides anything.
- **Non-FastAPI frameworks**: The `Annotated[..., Depends()]` pattern is
  FastAPI-specific. Other frameworks (Flask, Django) have different DI
  mechanisms.

---

## Why This Matters

The `Annotated` dependency pattern might seem like a small refactor, but it addresses real maintenance pain:

- **Type safety**: IDE autocomplete works with the concrete type (`KeycloakTokenClaims`), not a generic dependency placeholder. You catch type errors at the editor level, not at runtime.
- **Reusability**: Define once in `deps.py`, import everywhere. When you switch auth providers (say, from Keycloak to Auth0), you update one type alias instead of every router file.
- **Clean routers**: No repeated `Depends(get_current_user)` calls cluttering your function signatures. The dependency is embedded in the type itself.
- **Composable**: Need an admin-only endpoint? Create `AdminUser = Annotated[KeycloakTokenClaims, Depends(get_admin_user)]`. Need optional auth? `OptionalUser = Annotated[Optional[KeycloakTokenClaims], Depends(get_optional_user)]`.

---

## Practical Takeaways

The `Annotated[Type, Depends(func)]` pattern is FastAPI's recommended form for dependency injection on Python 3.9+. Adopt it when you have dependencies shared across multiple routers, which is almost always the case for authentication and database sessions.

The one rule to remember: **keep `Annotated` on the outside.** Writing `current_user: Optional[CurrentUser] = None` bypasses dependency injection entirely, because FastAPI only reads `Depends` metadata when `Annotated` is the outermost form. It won't warn you. The parameter just arrives as `None`, and the error shows up far from the actual cause. If the dependency really is optional, move the `Optional` inside the alias.

For new FastAPI projects, create a `deps.py` file early and define your shared dependencies as `Annotated` type aliases from the start. It's much easier than retrofitting the pattern across existing routers later.
