---
title: Celery API-Side Dispatch Pattern
description: >-
  Creating a send-only Celery client in an API service that dispatches tasks to
  a
date: 2026-02-03T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - celery
  - python
  - async
category: backend
draft: false
lang: en
references:
  - url: 'https://docs.celeryq.dev/en/stable/userguide/calling.html#basics'
    title: Celery - Calling Tasks
    type: official
  - url: 'https://docs.celeryq.dev/en/stable/userguide/routing.html'
    title: Celery - Routing Tasks
    type: official
source_content_hash: b1135b17ad35c3a9b9e281bf1381ed6d707897700b0d993dad581edfc9f260a7
expanded: true
---

I was setting up a microservices architecture with a FastAPI service handling HTTP requests and a separate Celery worker running ML inference tasks. The natural first attempt was to import the Celery task function and call `.delay()`:

```python
from worker.tasks.llm import summarize_note
summarize_note.delay(note_id)
```

The API service crashed at startup. Importing `summarize_note` pulled in `psycopg2`, `transformers`, and a chain of heavy sync dependencies that had no business being in an async FastAPI container. The standard Celery pattern couples the caller to the worker's entire dependency tree.

## The Problem

In a microservices setup where the API (FastAPI, async) and the worker (Celery, sync) are separate services with different dependencies, the API needs to dispatch tasks without importing worker code. Celery's standard `.delay()` and `.apply_async()` patterns require importing the decorated task function, which transitively imports all worker dependencies into the API service.

This coupling isn't obvious until you hit the import error. The task function itself might be a simple 10-line function, but its module imports the ORM, the ML libraries, the sync database driver — everything the worker needs. Importing one function means installing the worker's entire `requirements.txt` in the API container.

## The Solution: `send_task()`

Celery's `send_task()` method dispatches tasks by string name, with no import required:

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

Dispatching a task from the API becomes:

```python
from app.celery_client import celery_app

celery_app.send_task(
    "worker.tasks.llm.summarize_note",
    args=[str(note_id)],
)
```

The API only needs the Celery library and a broker URL. No worker code, no sync dependencies, no import chain.

## The Worker Side

The worker service has the actual task implementations with the `@task` decorator:

```python
# Worker: celery_app.py (has actual task implementations)
celery_app = Celery("worker")
celery_app.autodiscover_tasks(["worker.tasks"])

# Worker: tasks/llm.py
@celery_app.task(name="worker.tasks.llm.summarize_note")
def summarize_note(note_id: str) -> dict:
    ...
```

The explicit `name=` parameter in the task decorator is important — it ensures the task name matches what the API sends via `send_task()`. Without it, Celery generates a name from the module path, which might not match across services.

## The Gotchas

**Task routing must be duplicated.** The API client needs to know which queue each task routes to. If routing isn't mirrored on the API side, tasks land in the default queue and never get picked up by specialized workers. This is a maintenance burden — routing changes need to be updated in two places.

**String-based task names are fragile.** A typo in the task name silently sends the task to a non-existent handler. It sits in the queue forever with no error on the API side. Mitigate this by defining task names as constants and verifying routing with integration tests.

**Async/sync model duplication.** If both the API (asyncpg) and worker (psycopg2) need to access the same database models, ORM model files may need duplication or a shared package with no driver-specific imports. This is the cost of having incompatible dependency trees.

## Options I Considered

| Option                                      | Pros                                                        | Cons                                                                   |
| ------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.delay()` / `.apply_async()` (import task) | Type safety, IDE autocomplete, decorated function signature | Requires importing worker code; pulls sync dependencies into async API |
| `.send_task()` (string name, chosen)        | Fully decoupled; no worker imports needed                   | String-based names (typo-prone); no compile-time validation            |
| Shared task interface package               | Type safety + decoupling                                    | Extra package to maintain; versioning complexity between services      |

I chose `send_task()` because the dependency trees are incompatible. The string-based fragility is a real trade-off, but it's manageable with constants and integration tests.

## When NOT to Use This Pattern

- **Monolith applications** — if API and worker share the same codebase and dependencies, use `.delay()` for type safety and IDE support
- **Lightweight background tasks** — if tasks are under 1 second, consider `asyncio.create_task()` or FastAPI `BackgroundTasks` instead of adding Celery
- **Existing message infrastructure** — if you already have Kafka, RabbitMQ, or SNS/SQS for inter-service communication, adding a Celery layer is redundant
- **Single task type** — if the API only dispatches one type of task, the overhead of Celery client setup and routing configuration may not be justified

## Takeaway

When your API and worker services have incompatible dependency trees (async vs sync), use `celery_app.send_task("task.name", args=[...])` instead of importing the task function. The API creates a send-only Celery client with mirrored routing config, and the worker has the actual task implementations. The trade-off is string-based task names instead of type-safe imports — mitigate with constants and integration tests.

## References

- [Celery — Calling Tasks](https://docs.celeryq.dev/en/stable/userguide/calling.html#basics)
- [Celery — Routing Tasks](https://docs.celeryq.dev/en/stable/userguide/routing.html)
