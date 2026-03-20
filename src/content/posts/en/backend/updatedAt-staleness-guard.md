---
title: updatedAt Staleness Guard
description: 'When receiving asynchronous updates (webhooks, message queues), compare the'
date: 2026-02-13T00:00:00.000Z
updated: 2026-03-03T00:00:00.000Z
tags:
  - backend
  - sync
  - webhooks
  - race-condition
category: backend
draft: false
lang: en
references:
  - url: 'https://developers.google.com/calendar/api/v3/reference/events'
    title: Google Calendar Events API Reference
    type: official
  - url: 'https://en.wikipedia.org/wiki/Optimistic_concurrency_control'
    title: Optimistic Concurrency Control
    type: authoritative
source_content_hash: e293c3fcf03bf3569645d17db1c21878718f4eb2caab379a06cdf1e63e8a33be
---

source's "last modified" timestamp against the local record's timestamp. If the
local record is newer, the async update carries stale data — reject the
overwrite for protected fields.

## The Problem

In systems with bidirectional sync or webhook-driven updates, async
notifications can arrive **after** the local system has already processed a
newer change. Blindly applying the webhook data overwrites correct local state
with stale remote data.

```text
T0: User creates record → saved locally → async notification queued
T1: User updates record → saved locally (updatedAt = T1)
T2: T0's async notification arrives (carries data from T0)
T3: System applies T0 data → overwrites T1 changes ❌
```

This is a **last-write-wins race condition** where the last write (T2's webhook)
is actually the oldest data.

## The Solution

Compare timestamps before applying field updates:

```typescript
// Generic pattern
const remoteUpdatedAt = parseTimestamp(asyncPayload.updatedAt);
const localUpdatedAt = localRecord.updatedAt;

if (localUpdatedAt > remoteUpdatedAt) {
  // Local is newer — preserve local values for protected fields
  for (const field of PROTECTED_FIELDS) {
    incomingData[field] = localRecord[field];
  }
} else {
  // Remote is newer — accept remote values
  // (default behavior, no action needed)
}
```

## Key Points

- **Field-level, not record-level** — You don't reject the entire update. Only
  protected fields are preserved; other fields can still be updated from the
  remote source
- **Requires accurate local timestamps** — The local `updatedAt` must reflect
  the true last-modification time. ORM methods like `update()` may skip
  auto-timestamp decorators (e.g., TypeORM's `@UpdateDateColumn` is NOT
  triggered by `.update()`)
- **Null remote timestamp = accept remote** — If the async source doesn't
  provide a timestamp, you can't compare. Default to accepting remote data
- **Not a replacement for locking** — This guards against stale async
  overwrites, not concurrent writes. For concurrent writes, use pessimistic or
  optimistic locking
- **Extended to move-sensitive fields** — Beyond recurrence, this pattern
  protects `itemStatus`, `calendarId`, and `deletedAt` during calendar moves
  where stale webhooks carry `event.status='cancelled'`
- **Queue-side timestamp refresh** — After async API calls (e.g., Google
  Calendar move), explicitly update `block.updatedAt` to ensure
  `block.updatedAt > event.updated` for subsequent webhooks

## Decision Matrix

| Condition                           | Action         | Reasoning                    |
| ----------------------------------- | -------------- | ---------------------------- |
| `local.updatedAt > remote.updated`  | Preserve local | Local modified more recently |
| `local.updatedAt <= remote.updated` | Accept remote  | Remote is newer or caught up |
| `remote.updated` is null            | Accept remote  | No timestamp to compare      |

## When to Use

- **Webhook-driven sync** where webhooks can arrive out of order or be delayed
- **Event-sourced systems** where consumers process events after source data has
  changed
- **Bidirectional sync** where both sides can modify the same record
  independently
- **Any async pipeline** where processing lag creates a window for local
  modifications
- **Calendar move operations** where webhook arrival can overwrite move results
  with stale data from the source calendar

## When NOT to Use

- **Unidirectional sync** (source → local only) — No local modifications to
  protect
- **Idempotent operations** — If applying stale data has no side effects
- **Append-only systems** — No overwrites possible
- **Real-time streams** with guaranteed ordering (e.g., Kafka partitions with
  single consumer)

## ORM Gotcha: Manual Timestamp Updates

ORMs often skip auto-timestamp decorators for bulk/raw update methods:

```typescript
// TypeORM example
// ❌ .update() does NOT trigger @UpdateDateColumn
await repo.update(id, { field: newValue });

// ✅ Must manually set updatedAt
await repo.update(id, {
  field: newValue,
  updatedAt: new Date() // CRITICAL for staleness guard
});

// ✅ .save() DOES trigger @UpdateDateColumn
await repo.save(entity);
```

Always verify which ORM methods trigger auto-timestamps and which require manual
assignment.
