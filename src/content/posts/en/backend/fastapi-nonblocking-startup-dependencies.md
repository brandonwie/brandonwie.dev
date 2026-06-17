---
title: FastAPI Non-blocking Startup Dependencies
description: 'FastAPI lifespan code runs before the application accepts requests. If startup awaits an optional dependency such as Kafka, Cloud Run cold starts can fail health checks and E2E probes even when the API would happily serve routes without it.'
date: 2026-04-29T00:00:00.000Z
updated: 2026-05-06
tags:
  - backend
  - python
  - fastapi
  - kafka
  - cloud-run
  - transferable
category: backend
draft: false
lang: en
expanded: true
references:
  - url: 'https://fastapi.tiangolo.com/advanced/events/'
    title: FastAPI Lifespan Events
    type: official
  - url: 'https://docs.python.org/3/library/asyncio-task.html'
    title: Python asyncio Coroutines and Tasks
    type: official
source_content_hash: de981162f6c789fe8af46da7f97fe49f1ac1df25cf901e5c092c5f352bd83e71
---

FastAPI lifespan code runs before the application starts accepting requests. If startup awaits an optional dependency such as Kafka, Cloud Run cold starts can fail user-facing health checks and E2E probes even when the API could safely serve routes without that dependency. The misleading signal: a Kafka producer failure during startup looks like a service startup failure, even though the actual contract was narrower — note creation should not wait for Kafka when events are best-effort observability.

The transferable lesson is the distinction between dependencies that gate correctness (database, auth) and dependencies that gate observability (event bus, audit fan-out, cache warmer). The first must block startup. The second must not.

## Background producers, foreground requests

Start optional producers as background tasks during lifespan and keep the task handle on `app.state` for shutdown cleanup. The request path treats event publishing as fire-and-forget, logging failures without failing the business operation.

```python
app.state.kafka_init_task = asyncio.create_task(start_kafka_producer())

with suppress(asyncio.CancelledError):
    app.state.kafka_init_task.cancel()
    await app.state.kafka_init_task
await stop_kafka_producer()
```

Two things make this work. First, `asyncio.create_task` schedules the producer initialization without blocking the lifespan continuation — the app finishes coming up while the producer connects in the background. Second, the cancel-then-await shutdown sequence is needed because `stop_kafka_producer()` may also need to run cleanly, and we want to handle the case where init is still in flight when shutdown fires.

## Test it with latency, not connectivity

A direct socket-based test would have been flaky — Kafka availability varies across CI environments, and a connection-refused error doesn't reliably reproduce the original startup-stall symptom. The regression check that actually catches the bug is latency-based: a slow `start_kafka_producer()` stub must not delay lifespan completion past the service startup budget.

This shape of test is generally more robust for "did we accidentally make this blocking again" than testing the dependency directly. The actual failure mode is "lifespan held the event loop too long," not "the dependency failed" — so the test should target the loop-holding behavior.

## When this fits

Use this pattern when a dependency is useful for telemetry, audit fan-out, cache warming, or event propagation but is not required for the API to accept core traffic. The safety invariant: a request path that does not need the dependency must not be blocked by it being down.

Do not background a dependency that is required for correctness, persistence, or authorization. If the app cannot safely serve without it, fail startup loudly and let the platform restart or page. Backgrounding a correctness-critical dependency turns startup-time failures into harder-to-diagnose runtime failures, which is strictly worse.

## Practical takeaway

Optional dependencies belong in `asyncio.create_task` during lifespan, with the task handle stashed on `app.state` for shutdown. Test with a slow stub — the failure mode you care about is "blocking the event loop too long," and a latency-bounded assertion catches that more reliably than a connectivity check. The line between "block on this" and "background this" is whether the request path can safely return without it.

## References

- [FastAPI Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [Python asyncio Coroutines and Tasks](https://docs.python.org/3/library/asyncio-task.html)
