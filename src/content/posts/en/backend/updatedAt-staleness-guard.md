---
title: updatedAt Staleness Guard
description: 'When receiving asynchronous updates (webhooks, message queues), compare the'
date: 2026-02-13T00:00:00.000Z
updated: '2026-07-02'
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
source_content_hash: f8472d723499e53b67d9e646ada8c4740103bb523e991af8fdcc7ae9d6056c2e
expanded: true
---

I was debugging a calendar sync bug where a user's event kept reverting to its old title after they'd already updated it. The webhook from Google Calendar was arriving with stale data — data from before the user's edit — and our system was blindly overwriting the local record. The fix was a timestamp comparison that took ten lines of code, but the concept behind it applies to any system that processes asynchronous updates.

## The Problem

In any system with webhook-driven updates or bidirectional sync, async notifications can arrive **after** the local system has already processed a newer change. Here's how the race condition plays out:

```text
T0: User creates record → saved locally → async notification queued
T1: User updates record → saved locally (updatedAt = T1)
T2: T0's async notification arrives (carries data from T0)
T3: System applies T0 data → overwrites T1 changes ❌
```

This is a last-write-wins race condition, but the twist is that the "last write" (the webhook at T2) carries the **oldest** data. The user's change at T1 is correct, but the delayed webhook from T0 overwrites it. The result: the user sees their change disappear.

This problem shows up everywhere — webhook-driven sync, event-sourced systems, bidirectional sync between services, and any async pipeline where processing lag creates a window for local modifications.

## The Solution

The fix is to compare timestamps before applying field updates. When a webhook arrives, check whether the local record was modified more recently than the remote source's `updatedAt`. If the local record is newer, the webhook is carrying stale data — preserve the local values for protected fields:

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

The critical design choice here is **field-level protection, not record-level rejection**. You don't throw away the entire webhook payload. Only the fields you've identified as "protected" keep their local values — everything else can still be updated from the remote source. This gives you the safety of staleness detection without losing legitimate updates to non-protected fields.

## Decision Matrix

When a webhook arrives, the decision is straightforward:

| Condition                           | Action         | Reasoning                    |
| ----------------------------------- | -------------- | ---------------------------- |
| `local.updatedAt > remote.updated`  | Preserve local | Local modified more recently |
| `local.updatedAt <= remote.updated` | Accept remote  | Remote is newer or caught up |
| `remote.updated` is null            | Accept remote  | No timestamp to compare      |

If the remote source doesn't provide a timestamp, you can't compare — default to accepting the remote data. This keeps the guard from blocking legitimate updates from sources that don't track modification times.

## Key Design Decisions

**Why field-level, not record-level?** Rejecting the entire update throws away valid data. A webhook might carry stale title data but fresh attendee data. Field-level protection lets you keep what's fresh and discard what's stale.

**Why not use locking instead?** This guard protects against stale async overwrites — it's complementary to locking, not a replacement. Pessimistic or optimistic locking handles concurrent writes from multiple writers. The staleness guard handles delayed async notifications that arrive after the local state has moved forward.

**What about move-sensitive fields?** In calendar sync, this pattern extends beyond basic content fields. When a user moves an event between calendars, stale webhooks from the source calendar can carry `event.status='cancelled'`, which would overwrite the move result. Protecting `itemStatus`, `calendarId`, and `deletedAt` prevents these stale cancellation signals from undoing the move.

**Queue-side timestamp refresh:** After async API calls (like a Google Calendar move), explicitly update `block.updatedAt` before the response webhook arrives. This ensures `block.updatedAt > event.updated` for any subsequent webhooks, giving the staleness guard the right data to work with.

## The ORM Gotcha

This pattern requires accurate local timestamps, which brings up a subtle ORM issue. Many ORMs skip auto-timestamp decorators for bulk or raw update methods:

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

// ⚠️ .upsert() ALSO skips @UpdateDateColumn on the ON CONFLICT path.
// It writes `updated_at = EXCLUDED.updated_at` — the value carried on the
// entity — so a stale entity timestamp is written back verbatim on conflict.
entity.updatedAt = new Date(); // refresh BEFORE upsert
await repo.upsert(entity, ["uniqueCol"]);
```

If your `updatedAt` doesn't reflect the true last-modification time, the staleness guard makes the wrong decision. Always verify which ORM methods trigger auto-timestamps and which require manual assignment. In TypeORM, `.save()` triggers `@UpdateDateColumn` but `.update()` does not — a distinction that can silently break this entire pattern.

`.upsert()` turned out to be the sneakiest of the three. It doesn't just skip the auto-timestamp — on the ON CONFLICT path it emits `updated_at = EXCLUDED.updated_at`, meaning whatever timestamp the entity happens to be carrying gets written back verbatim. If that value is stale, the record's `updatedAt` never advances no matter how many times the upsert runs. I ran into this with re-edits of a single instance of a recurring event: each edit flowed through an upsert, the entity still carried the old timestamp, and `updatedAt` stayed frozen until the entity was refreshed right before the upsert — the same manual assignment `.update()` needs. The mechanism (at least in the TypeORM version I checked) is that `EntityManager.upsert` adds a column to the conflict-overwrite list only when the entity defines it; it does not inject `CURRENT_TIMESTAMP` when the column is already present.

## When NOT to Use This

Not every system needs a staleness guard. Skip it when:

- **Unidirectional sync** (source → local only) — there are no local modifications to protect
- **Idempotent operations** — if applying stale data has no side effects, the guard adds complexity for no benefit
- **Append-only systems** — no overwrites are possible
- **Real-time streams with guaranteed ordering** (e.g., Kafka partitions with a single consumer) — ordering is already handled by the transport

## Takeaway

When you process asynchronous updates, always compare the source's modification timestamp against your local record's timestamp before overwriting protected fields. The pattern is ten lines of code, works at the field level (not record level), and prevents the most common class of data corruption in webhook-driven systems. The one thing that will break it: an ORM that doesn't update `updatedAt` when you think it does — so verify your ORM's auto-timestamp behavior before trusting the guard.

## References

- [Google Calendar Events API Reference](https://developers.google.com/calendar/api/v3/reference/events)
- [Optimistic Concurrency Control — Wikipedia](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)
