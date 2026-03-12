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
  - url: 'https://docs.celeryq.dev/en/stable/userguide/calling.html#basics'
    title: Celery - Calling Tasks
    type: official
  - url: 'https://docs.celeryq.dev/en/stable/userguide/routing.html'
    title: Celery - Routing Tasks
    type: official
source_content_hash: b1135b17ad35c3a9b9e281bf1381ed6d707897700b0d993dad581edfc9f260a7
---

separate worker service, without importing the worker's task modules.

---

## The Problem

In a microservices architecture where the API (FastAPI, async) and the worker
(Celery, sync) are separate services with different dependencies, the API needs
to dispatch tasks to the worker without importing worker code. Using the
standard `.delay()` or `.apply_async()` pattern requires importing the decorated
task function, which pulls in the worker's sync dependencies (psycopg2, ML
libraries, etc.) into the async API service — causing import errors and
dependency bloat.

## Difficulties Encountered

- **Import coupling by default** — Celery's standard `.delay()` pattern requires
  importing the task function, which transitively imports all worker
  dependencies. This is not obvious until the API service fails at startup with
  missing module errors.
- **Task routing must be duplicated** — The API client needs to know which queue
  each task routes to, but this configuration lives in the worker. If routing is
  not mirrored on the API side, tasks land in the default queue and never get
  picked up by specialized workers.
- **String-based task names are fragile** — `send_task()` uses string names like
  `"worker.tasks.llm.summarize_note"`. A typo silently sends the task to a
  non-existent handler; it sits in the queue forever with no error on the API
  side.
- **Async/sync model duplication** — The API uses asyncpg while the worker uses
  psycopg2. If both need to access the same database models, ORM model files may
  need duplication or a shared package with no driver-specific imports.

---

## Key Points

- API and Worker are separate services with different dependencies (async vs
  sync)
- API only needs `celery_app.send_task("task.name", args=[...])` — no task
  import required
- Task routing configuration should be duplicated between API client and Worker
  to ensure correct queue assignment
- `send_task()` uses task name strings, decoupling API from Worker code

## The Solution

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

```python
# In API service code:
from app.celery_client import celery_app

celery_app.send_task(
    "worker.tasks.llm.summarize_note",
    args=[str(note_id)],
)
```

## Options Considered

| Option                                      | Pros                                                        | Cons                                                                   |
| ------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.delay()` / `.apply_async()` (import task) | Type safety, IDE autocomplete, decorated function signature | Requires importing worker code; pulls sync dependencies into async API |
| `.send_task()` (string name, chosen)        | Fully decoupled; no worker imports needed                   | String-based names (typo-prone); no compile-time validation            |
| Shared task interface package               | Type safety + decoupling                                    | Extra package to maintain; versioning complexity between services      |

## Why This Approach

Chose `send_task()` because the API and Worker have incompatible dependency
trees (async vs sync). Importing worker task modules into the API would require
installing psycopg2, ML libraries, and other heavy sync dependencies in the API
container. The string-based fragility is mitigated by using constants for task
names and integration tests that verify task routing.

## Worker Side (Separate Service)

```python
# Worker: celery_app.py (has actual task implementations)
celery_app = Celery("worker")
celery_app.autodiscover_tasks(["worker.tasks"])

# Worker: tasks/llm.py
@celery_app.task(name="worker.tasks.llm.summarize_note")
def summarize_note(note_id: str) -> dict:
    ...
```

## Sync vs Async Considerations

- Celery tasks are synchronous — workers need sync DB drivers (psycopg2, not
  asyncpg)
- API uses async (asyncpg) for FastAPI compatibility
- Model duplication may be needed between API and Worker when they can't share
  async/sync models

---

## When to Use

- Microservices architecture where API and worker are separate deployables with
  different dependency trees
- API service is async (FastAPI/asyncpg) and worker is sync (Celery/psycopg2)
- You need to dispatch background tasks from the API without importing worker
  code

## When NOT to Use

- **Monolith applications** — If API and worker share the same codebase and
  dependencies, use `.delay()` or `.apply_async()` for type safety and IDE
  support
- **Lightweight background tasks** — If tasks are simple and quick (under 1
  second), consider `asyncio.create_task()` or FastAPI `BackgroundTasks` instead
  of adding Celery
- **Event-driven architectures** — If you already have Kafka, RabbitMQ direct,
  or SNS/SQS for inter-service communication, adding a Celery layer is redundant
- **Single task type** — If the API only dispatches one type of task, the
  overhead of Celery client setup and routing configuration may not be justified
