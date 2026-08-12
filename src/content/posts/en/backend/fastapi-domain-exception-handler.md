---
title: FastAPI domain-exception handler — stopping 500s on your 404s
description: >-
  Domain exceptions raised in the service layer come back as 500s until FastAPI
  is told otherwise. What I found registering one handler for the whole
  hierarchy, and the four gotchas a review pass surfaced afterwards.
date: 2026-04-15T00:00:00.000Z
updated: '2026-08-12'
tags:
  - backend
  - fastapi
  - python
  - exception-handling
  - http-status-codes
  - architecture
category: backend
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://fastapi.tiangolo.com/tutorial/handling-errors/#install-custom-exception-handlers
    title: Install custom exception handlers — FastAPI
    type: official
  - url: 'https://www.starlette.io/exceptions/'
    title: Exceptions — Starlette
    type: official
  - url: 'https://docs.python.org/3/using/cmdline.html#cmdoption-O'
    title: The -O option — Python command line reference
    type: official
  - url: 'https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement'
    title: The assert statement — Python language reference
    type: official
  - url: 'https://docs.python.org/3/reference/datamodel.html#type.__subclasses__'
    title: type.__subclasses__() — Python data model
    type: official
  - url: 'https://docs.python.org/3/library/sys.html#sys.exc_info'
    title: sys.exc_info() — Python standard library
    type: official
  - url: 'https://docs.python.org/3/library/logging.html#logging.Logger.debug'
    title: Logger.debug and the exc_info argument — Python standard library
    type: official
  - url: >-
      https://fastapi.tiangolo.com/tutorial/handling-errors/#use-the-requestvalidationerror-body
    title: Use the RequestValidationError body — FastAPI
    type: official
  - url: 'https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/'
    title: "Parse, don't validate — Alexis King"
    type: authoritative
source_content_hash: 6ebf53d54f9c1884af927f8cc9499f52123b6a5a890a57823e47a0f79dd3ef45
---

A `GET` for a note that did not exist came back as `500 Internal Server Error`
instead of `404 Not Found`. The service layer raised `NotFoundError` right where
it should have, and the router was a single pass-through line. Neither file was
wrong. The exception hierarchy had simply never been registered with FastAPI, so
the framework treated it as an unhandled crash.

This is what I found while fixing that in crucio, a personal project of mine,
plus four things a later review pass turned up that I would not have thought of
on my own. The fix itself is about ten lines; most of this post is about what
sits around it.

## The setup that looks right

The shape is the one most layered-architecture guides recommend. Domain
exceptions live in one module and describe problems in the language of the
domain, with no knowledge of HTTP:

```python
# core/exceptions.py
class CrucioException(Exception):
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

class NotFoundError(CrucioException): ...
class ValidationError(CrucioException): ...
class AuthenticationError(CrucioException): ...
class AuthorizationError(CrucioException): ...
class StorageError(CrucioException): ...
class ProcessingError(CrucioException): ...
```

The base class carries `message` and `details` so that whatever eventually
serializes the error has something structured to work with. Everything else is
an empty subclass whose only job is to be a distinguishable type.

The service raises those types when a business rule fails, without status codes
and without importing anything from the web framework:

```python
# features/notes/service.py
async def get_note(self, note_id: UUID, user_id: UUID) -> NoteResponse:
    note = await self.repository.get_by_id(note_id=note_id, user_id=user_id)
    if not note:
        raise NotFoundError(f"Note {note_id} not found")
    return NoteResponse.model_validate(note)
```

And the router stays thin, which is the whole point of putting the logic in a
service:

```python
# features/notes/router.py
@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(note_id: UUID, current_user: CurrentUser, ...):
    return await service.get_note(note_id=note_id, ...)
```

Read those three files together and the design looks finished: the service is
HTTP-agnostic, the router is a pass-through, and nothing is duplicated. But if
`NotFoundError` is raised, the client still gets a 500 instead of a 404.

## Why FastAPI answers 500

Nothing connects a class named `NotFoundError` to the status code 404.
`CrucioException` is an ordinary `Exception` subclass, and an exception that
propagates out of an endpoint with nothing registered to catch it is, by
definition, an unhandled server error. Starlette's middleware stack (which
FastAPI sits on top of) puts `ServerErrorMiddleware` at the outermost layer
precisely to turn anything that escapes into a 500 response, with
`ExceptionMiddleware` inside it to dispatch the exceptions somebody *did*
register a handler for. Skip the registration and every domain exception in the
codebase falls through to the outer layer.

The wrong number in the response matters less than what that number does to
everything downstream of it. Error monitoring pages on 5xx and ignores 4xx,
which is the correct default, so a missing resource turns into an alert that
looks exactly like a real fault until somebody opens it. Misclassified 500s cost
attention that should go elsewhere, and they bury genuine 500s in noise. API
consumers get the same confusion in a different form: "internal server error"
when the honest answer is "that resource is not here."

This ships easily because the obvious tests stay green. Unit tests on the
service assert that `NotFoundError` is raised, and it is. HTTP integration tests
on the happy path assert a 200 body, and they get one. Only a test that drives
the not-found path *through HTTP* sees the 500, and that is exactly the test
people skip, because a 404 feels too boring to be worth asserting on.

## Three ways to close the gap

Once the cause was clear, there were three plausible fixes. Ranking them was
mostly a question of where I wanted the translation from domain vocabulary to
transport vocabulary to live.

| Approach                                | Where translation lives | Boilerplate per feature | Main risk                         |
| --------------------------------------- | ----------------------- | ----------------------- | --------------------------------- |
| A: one global handler                   | App edge, one place     | None                    | Unmapped subclass falls to 500    |
| B: per-router catch-and-reraise         | Every router            | Every endpoint          | One forgotten router = silent 500 |
| C: raise `HTTPException` in the service | Service layer           | None                    | Service is coupled to HTTP        |

### Option A: one handler for the whole hierarchy

Register a single handler against the *base* class and dispatch on the concrete
subclass inside it. Starlette walks the exception's MRO when looking for a
handler, so one registration covers every descendant:

```python
# main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from crucio.core.exceptions import (
    CrucioException,
    NotFoundError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    StorageError,
    ProcessingError,
)

app = FastAPI()

_EXCEPTION_STATUS_MAP: dict[type[CrucioException], int] = {
    NotFoundError: 404,
    ValidationError: 422,
    AuthenticationError: 401,
    AuthorizationError: 403,
    StorageError: 500,
    ProcessingError: 500,
}

@app.exception_handler(CrucioException)
async def crucio_exception_handler(request: Request, exc: CrucioException):
    status_code = _EXCEPTION_STATUS_MAP.get(type(exc), 500)
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": exc.message,
            "type": type(exc).__name__,
            "details": exc.details,
        },
    )
```

What I like about this: services keep raising domain exceptions without a
thought for transport, routers stay free of error-handling clutter, and a new
exception type costs one row in a dictionary. What I do not like: that row is
easy to forget, and forgetting it reproduces the original bug for the new type
only, which is a much quieter version of the same failure. The knowledge entry I
wrote at the time suggested guarding this with an `assert` at startup. Review had
opinions about that, which is most of the second half of this post.

### Option B: catch and re-raise in each router

```python
# features/audit/router.py
try:
    return await service.get_event(event_id)
except AuditNotFoundError:
    raise HTTPException(status_code=404, detail="Audit event not found")
except AuditServiceError:
    raise HTTPException(status_code=503, detail="Audit service error")
```

This is the most explicit option, and explicitness is a real virtue: the mapping
is visible at the call site and there is no registration to forget. The cost is
that the same three lines get copied into every router that can raise the same
exception. The failure mode is gradual rather than dramatic. A new endpoint
reuses an existing service, nobody copies the `try/except`, and that one endpoint
quietly returns 500 while its neighbours return 404.

### Option C: raise `HTTPException` in the service

```python
async def get_note(self, note_id: UUID) -> NoteResponse:
    note = await self.repository.get_by_id(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return NoteResponse.model_validate(note)
```

Zero ceremony, and the mapping could not be more obvious. The trade is that the
service now knows about HTTP. Call that same service from a background worker or
a CLI command, and it raises a web-framework exception into a context with no web
framework to interpret it. Unit tests get slightly worse too: asserting on
`HTTPException.status_code` tests the transport rather than the rule.

I went with A. B and C are not wrong. For a small app that will never grow a
non-HTTP entry point, C is genuinely fine, and B is defensible if you value
explicitness over repetition. I picked A because the thing I wanted to protect
was the service layer's independence, and A is the only one of the three that
keeps it.

## Errors at the boundary

The principle underneath Option A is that translation belongs at the edge:
domain code states domain problems, and the boundary converts them into whatever
error vocabulary the transport speaks. The same shape shows up under different
names in other frameworks, such as `@ControllerAdvice` in Spring Boot and the
custom exception handler in Django REST Framework. When a pattern gets
reinvented that often, it is usually doing something real rather than papering
over a framework quirk.

It reminds me of Alexis King's *Parse, don't validate*, pointed in the outbound
direction. Both are arguments for concentrating the conversion between an
outside representation and an internal one at a single, well-defined boundary
rather than letting it smear across the middle of the system. The analogy only
goes so far. Hers is about types and the information you gain during parsing;
mine is about mapping error classes to integers. The instinct is the same one.

## Finding it in a codebase you did not write

If you want to check whether an existing FastAPI app has this bug, two greps
answer the question:

```bash
# Domain exceptions defined...
grep -rn "class.*Exception(CrucioException)" core/
# ...and any handler registered anywhere?
grep -rn "add_exception_handler\|@app.exception_handler" .
```

Several matches from the first and none from the second means every one of those
exception types is currently a 500.

## What review surfaced after the fix

The minimal Option A above is correct, and I would have shipped it as-is. The
change went through two validation rounds with AI reviewers (the Claude Code
review action and GitHub Copilot), and four of their findings were things I had
not considered. Three of the four were flagged independently by more than one
reviewer at the same location, which I have started treating as a useful signal:
two models with different pre-training are unlikely to hallucinate the identical
false positive in the identical place.

### 1. `assert` disappears under `-O`

The startup guard I had sketched used an assertion to check that every subclass
appears in the status map:

```python
# WRONG — stripped by Python `-O`
_MISSING = set(CrucioException.__subclasses__()) - set(_EXCEPTION_STATUS_MAP)
assert not _MISSING, f"Missing: {_MISSING}"
```

Python's language reference is blunt about what happens when optimization is
requested: "The current code generator emits no code for an assert statement when
optimization is requested at compile time." Running under `-O`, or with
`PYTHONOPTIMIZE=1` set in the environment, deletes the guard at bytecode
compilation. That environment variable is a plausible thing to find in a
production container image, added at some point for a small memory saving. The
guard then becomes a no-op in exactly the environment it was written to protect.

```python
# CORRECT — unconditional
_MISSING = set(CrucioException.__subclasses__()) - set(_EXCEPTION_STATUS_MAP)
if _MISSING:
    raise RuntimeError(f"Missing: {sorted(cls.__name__ for cls in _MISSING)}")
```

The rule I took from this: `assert` is for tests and for invariants I only care
about while developing. Anything that must hold in production gets an explicit
`if` and a real exception.

### 2. `__subclasses__()` only sees its own children

The guard was also checking less than I thought. The data model documentation
describes `type.__subclasses__()` as returning a list of weak references to a
class's *immediate* subclasses, which leaves grandchildren out. So a
second-generation exception slips past:

```python
class QuotaExceededError(StorageError):
    """429 Too Many Requests, semantically."""
```

`CrucioException.__subclasses__()` returns the six direct children and stops.
`QuotaExceededError` is absent, so the guard is satisfied. At runtime
`_EXCEPTION_STATUS_MAP.get(type(exc), 500)` misses for the same reason, because
`type(exc)` is `QuotaExceededError` and nobody ever added it to the map. The
guard and the handler share one blind spot, so the check meant to catch the bug
is blind to exactly the case that causes it.

```python
def _all_subclasses(cls: type) -> set[type]:
    """Direct children, grandchildren, and so on."""
    collected: set[type] = set()
    for sub in cls.__subclasses__():
        collected.add(sub)
        collected |= _all_subclasses(sub)
    return collected

_MISSING = _all_subclasses(CrucioException) - set(_EXCEPTION_STATUS_MAP)
```

If a companion unit test asserts the same coverage, it needs the same recursive
helper, or it inherits the blind spot too.

### 3. `exc_info=True` depends on ambient state

Logging stack traces for 5xx and not for 4xx seems like a one-liner:

```python
# LESS RELIABLE — implicit
log(..., exc_info=status_code >= 500)
```

`exc_info=True` tells the logging module to fetch the current exception via
`sys.exc_info()`, which returns whatever exception is being handled, or three
`None`s when nothing is being handled anywhere on the stack. This works today
because Starlette's `ExceptionMiddleware` calls the handler from inside its own
`except` block, so there *is* a current exception. That relies on a framework
internal rather than on a documented guarantee. A future refactor that dispatches
handlers through a task or a shield would break traceback capture without
breaking anything visible.

```python
# MORE RELIABLE — explicit
log(
    ...,
    exc_info=(type(exc), exc, exc.__traceback__) if status_code >= 500 else False,
)
```

The tuple form reads the traceback off the exception object that was handed to
the handler. It depends on nothing ambient, and the logging module accepts it
directly.

### 4. The guard depends on import order

This one is the most uncomfortable, because the fix is partial. `_all_subclasses`
can only find classes Python has already imported at the moment it runs. If
exception subclasses live in feature modules (say
`features/billing/exceptions.py` defining `QuotaExceededError(StorageError)`),
the guard is only meaningful when those modules were imported first:

```python
# main.py — order matters
from crucio.api.v1.router import api_router   # transitively loads all features
from crucio.core.exception_handlers import register_exception_handlers  # guard runs here
```

Reorder those two lines, or add a subclass in a module the startup import chain
never reaches, and the guard passes while covering nothing. There is no way to
make an import-time check immune to import order, so the honest answer is
defence in depth: keep the boot guard as a fast signal, and add a CI test called
`test_all_crucio_exception_subclasses_are_mapped` that uses the same recursive
helper. Pytest's collection imports the whole test dependency graph, so the test
sees subclasses that module loading alone would miss. The guard fails fast; the
test is the one that is actually correct.

### 5. 422 has two body shapes, and that is a contract smell

Not a defect, but worth writing down. FastAPI already uses 422 for
`RequestValidationError`, whose body is a list of per-field objects shaped like
`{"detail": [{"loc": [...], "msg": ..., "type": ...}]}`. Mapping a domain
`ValidationError` to 422 as well means the same status code can also return the
envelope above, where `detail` is a plain string.

Both are honestly "unprocessable entity" from the client's side, so sharing the
code is semantically right. The problem is for a consumer pattern-matching on the
body: it has to branch on whether `detail` is a list (schema error) or a string
(semantic error). Three ways out, in the order I would consider them:

1. Document the dual shape prominently in the OpenAPI description and live with
   it. Keeping one envelope across the whole exception hierarchy is worth more
   than making one status code uniform.
2. Map `ValidationError` to 400 and leave 422 to FastAPI alone. Cleaner
   separation, but less precise semantics, since 400 says very little.
3. Reserve `ValidationError` for conflict-like cases and map it to 409, with a
   different domain exception for input-shape problems. More types to maintain.

I took the first. It is the option that admits the smell rather than trading it
for a different one, and the documentation cost is a paragraph.

## When this fits, and when it does not

The pattern earns its keep in any FastAPI application that has a domain exception
hierarchy at all, and it matters most before a public API ships, when the
difference between 404 and 500 becomes somebody else's error-handling logic. The
ongoing maintenance is one line per new exception type, plus the guard and test
to make sure that line does not get forgotten.

It is not worth the ceremony for library code with no HTTP surface. Raise the
domain exceptions there and let the caller decide what they mean. It is also not
worth it in a prototype where 500-for-everything is an accurate description of
the reliability anyway. And some APIs deliberately return the same code for
missing and forbidden resources so that a probe cannot distinguish them. That is
a real security pattern, and it wants a deliberate map entry rather than an
accidental one.

One more thing worth doing at the same time, if the codebase has been around a
while: check whether some features are already doing Option B by hand. Mixed
conventions propagate, because the fastest way to write a new router is to copy
the one next to it. Standardising on the global handler and removing per-router
`try/except` blocks as you touch them is cheaper than leaving both patterns in
place and hoping the next person picks the right one.

## Practical takeaway

Defining a domain exception hierarchy is necessary but not sufficient. The
hierarchy is inert until something at the app edge maps it to the transport's
error semantics, and the failure stays silent in exactly the tests most likely to
be written. The whole pattern is one handler on the base class plus one
dictionary from type to status code, guarded at startup by an `if` rather than an
`assert`, and recursing rather than looking one level down.

## References

- [Install custom exception handlers — FastAPI](https://fastapi.tiangolo.com/tutorial/handling-errors/#install-custom-exception-handlers):
  registering a handler with `@app.exception_handler(...)`, the mechanism the
  whole post rests on
- [Exceptions — Starlette](https://www.starlette.io/exceptions/): the middleware
  stack that turns unhandled exceptions into 500s, and where registered handlers
  are dispatched from
- [The `-O` option — Python command line reference](https://docs.python.org/3/using/cmdline.html#cmdoption-O):
  and its `PYTHONOPTIMIZE` environment-variable equivalent
- [The `assert` statement — Python language reference](https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement):
  states that no code is emitted for `assert` when optimization is requested
- [`type.__subclasses__()` — Python data model](https://docs.python.org/3/reference/datamodel.html#type.__subclasses__):
  immediate subclasses only, which is why the recursive helper exists
- [`sys.exc_info()` — Python standard library](https://docs.python.org/3/library/sys.html#sys.exc_info):
  returns the exception currently being handled, or three `None`s when there is
  none
- [`Logger.debug` and the `exc_info` argument — Python standard library](https://docs.python.org/3/library/logging.html#logging.Logger.debug):
  the argument accepts an exception tuple, not just a boolean
- [Use the `RequestValidationError` body — FastAPI](https://fastapi.tiangolo.com/tutorial/handling-errors/#use-the-requestvalidationerror-body):
  the list-shaped 422 body that a domain `ValidationError` ends up sharing a
  status code with
- [*Parse, don't validate* — Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/):
  the boundary-translation argument this pattern rhymes with
