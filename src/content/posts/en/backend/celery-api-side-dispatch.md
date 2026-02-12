---
title: Celery API-Side Dispatch Pattern
description: >-
  Creating a send-only Celery client in an API service that dispatches tasks to
  a
date: 2026-02-03T00:00:00.000Z
updated: 2026-02-03T00:00:00.000Z
tags:
  - backend
  - celery
  - python
  - async
category: backend
draft: false
lang: en
references:
  - url: "https://docs.celeryq.dev/en/stable/userguide/calling.html#basics"
    title: Celery - Calling Tasks
    type: official
  - url: "https://docs.celeryq.dev/en/stable/userguide/routing.html"
    title: Celery - Routing Tasks
    type: official
---

The FastAPI service crashed on startup with `ModuleNotFoundError: No module
named 'psycopg2'`. I had not added psycopg2 to the API's dependencies because
the API uses asyncpg. The error came from importing a Celery task function to
call `.delay()` on it -- that import pulled in the entire worker dependency
tree.

In a microservices architecture where the API and worker are separate
services, importing worker task functions to dispatch them is a trap. The
standard Celery pattern (import the task, call `.delay()`) works in
monoliths. In a split architecture where the API is async (FastAPI + asyncpg)
and the worker is sync (Celery + psycopg2), importing the task function
drags in every dependency the worker needs.

## Why the Standard Pattern Breaks

Celery's recommended approach is to import the decorated task function and
call `.delay()` or `.apply_async()`:

```python
# This is what Celery docs suggest
from worker.tasks.llm import summarize_note

summarize_note.delay(note_id)
```

This works when the API and worker live in the same codebase with the same
dependencies. In a split architecture, that import triggers a chain:
`worker.tasks.llm` imports `worker.db`, which imports `psycopg2`, which is
not installed in the API container. The API crashes before handling a single
request.

## Options Explored

| Option                                      | Pros                               | Cons                                                           |
| ------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `.delay()` / `.apply_async()` (import task) | Type safety, IDE autocomplete      | Requires importing worker code; pulls sync deps into async API |
| `.send_task()` (string name, chosen)        | Fully decoupled; no worker imports | String-based names (typo-prone); no compile-time validation    |
| Shared task interface package               | Type safety + decoupling           | Extra package to maintain; versioning complexity               |

The shared interface package was appealing -- define task signatures in a
lightweight shared library that both API and worker depend on. But maintaining
a shared package between two services with different release cycles adds
versioning complexity. For a team of one or two, the overhead is not worth
the type safety benefit.

## The Solution: send_task()

`send_task()` dispatches a task by name without importing anything from the
worker. The API only needs a Celery client configured with the broker URL and
task routing:

```python
# API side: celery_client.py (send-only, no worker)
from celery import Celery
from app.config import settings

celery_app = Celery(
    "api_client",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

# Mirror the worker's task routing
celery_app.conf.update(
    task_serializer="json",
    task_routes={
        "worker.tasks.stt.*": {"queue": "stt"},
        "worker.tasks.llm.*": {"queue": "llm"},
        "worker.tasks.link.*": {"queue": "default"},
    },
)
```

Now dispatching a task from the API service looks like this:

```python
# In API service code:
from app.celery_client import celery_app

celery_app.send_task(
    "worker.tasks.llm.summarize_note",
    args=[str(note_id)],
)
```

No worker imports. No transitive dependencies. The API sends a message to the
broker with the task name and arguments, and the worker picks it up from the
correct queue.

## Task Routing Must Be Mirrored

One gotcha: the API client needs to know which queue each task routes to. If
routing is not mirrored on the API side, tasks land in the default queue and
never get picked up by specialized workers.

The `task_routes` configuration in the API client must match what the worker
expects. If the worker has an `stt` queue for speech-to-text tasks and an
`llm` queue for language model tasks, the API client must route to those same
queues.

## The Worker Side

The worker is a separate service with its own Celery app that discovers and
runs the actual task implementations:

```python
# Worker: celery_app.py (has actual task implementations)
celery_app = Celery("worker")
celery_app.autodiscover_tasks(["worker.tasks"])

# Worker: tasks/llm.py
@celery_app.task(name="worker.tasks.llm.summarize_note")
def summarize_note(note_id: str) -> dict:
    ...
```

The explicit `name` parameter on `@celery_app.task()` is important. It must
match the string used in `send_task()` on the API side. Without an explicit
name, Celery auto-generates one based on the module path, which may differ
between services.

## Mitigating String Fragility

The main risk with `send_task()` is typos. A misspelled task name silently
sends the task to a non-existent handler. It sits in the queue forever with
no error on the API side. Two practices help:

1. **Use constants for task names** instead of inline strings
2. **Integration tests** that dispatch tasks and verify they are received by
   the worker

## Sync vs Async Considerations

Celery tasks are synchronous. Workers need sync DB drivers (psycopg2, not
asyncpg). The API uses async (asyncpg) for FastAPI compatibility. If both
services need to access the same database models, ORM model files may need
duplication or a shared package with no driver-specific imports.

## When to Use This Pattern

This pattern fits microservices architectures where API and worker are
separate deployables with different dependency trees. It is the right choice
when the API is async (FastAPI/asyncpg) and the worker is sync
(Celery/psycopg2), and you need to dispatch background tasks without
importing worker code.

## When to Skip It

- **Monolith applications** -- If API and worker share the same codebase and
  dependencies, use `.delay()` or `.apply_async()` for type safety and IDE
  support.
- **Lightweight background tasks** -- If tasks are quick (under 1 second),
  consider `asyncio.create_task()` or FastAPI `BackgroundTasks` instead of
  adding Celery.
- **Event-driven architectures** -- If you already have Kafka, RabbitMQ
  direct, or SNS/SQS for inter-service communication, adding a Celery layer
  is redundant.
- **Single task type** -- If the API dispatches only one type of task, the
  overhead of Celery client setup and routing configuration may not be
  justified.

## Key Takeaway

Use `send_task()` to dispatch Celery tasks by name from a service that cannot
import the worker's code. Mirror the task routing configuration on both
sides. Accept the string fragility and mitigate it with constants and
integration tests. The alternative -- importing worker modules into the API
-- creates a dependency chain that defeats the purpose of splitting the
services in the first place.
