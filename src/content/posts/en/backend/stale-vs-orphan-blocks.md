---
title: Stale vs Orphan Blocks in Calendar Sync
description: "When syncing calendar data from Google Calendar API, two distinct cleanup"
date: 2026-02-05T00:00:00.000Z
updated: 2026-02-05T00:00:00.000Z
tags:
  - backend
  - sync
  - google-calendar
category: backend
draft: false
lang: en
references:
  - url: "https://developers.google.com/calendar/api/guides/sync"
    title: Google Calendar API - Sync Events
    type: official
---

I had ghost events showing up in users' calendars -- events that had been
deleted from Google but still appeared in our app. At the same time, recurring
event instances were referencing parent events that no longer existed, breaking
the sync entirely. Both problems looked like "stale data," but they required
completely different fixes.

When syncing calendar data from the Google Calendar API, the local database
accumulates blocks that no longer reflect reality. Events deleted from Google
still exist locally. Recurring event instances reference parents that no longer
exist. Without distinguishing these two cleanup scenarios and handling them in
the correct order, the sync produces dangling references, ghost events, and data
corruption.

## The Core Distinction

The two problems look similar on the surface -- both produce "blocks that should
be deleted." But they have fundamentally different detection logic.

| Concept          | Definition                                                    | Trigger                   |
| ---------------- | ------------------------------------------------------------- | ------------------------- |
| **Stale Block**  | ANY calendar block NOT in Google response                     | Event deleted from Google |
| **Orphan Block** | T block (recurring instance) IN response without valid parent | Parent deleted/modified   |

The critical difference is **presence in the API response**:

```text
Google API Response
├── Contains event
│   ├── Has parent → Link (normal case)
│   └── No parent → Orphan (needs cleanup)
└── Does NOT contain event → Stale (needs cleanup)
```

I initially treated them identically, which caused missed deletions and false
positives. Stale blocks are absent from the response. Orphan blocks are present
in the response but parentless. That distinction drives everything else.

## The Difficulties

Several edge cases made this harder than expected.

Running orphan detection before stale cleanup caused an order-of-operations bug.
T blocks would be linked to parents that stale cleanup then deleted, creating
dangling `originalId` references that broke subsequent syncs.

There was also a partial-access edge case. A cancelled T block without a parent
is an orphan. But a non-cancelled T block without a parent might represent
partial calendar access -- the user can see the instance but not the series.
Deleting these caused data loss for shared calendars.

At scale (100k+ blocks), the naive O(n\*m) comparison between existing blocks and
the Google response was too slow. Switching to Set-based O(1) lookups and
batched deletes fixed the performance problem.

## Stale Block Cleanup

Stale cleanup runs during full sync only (no syncToken or resync after a 410
error). During full sync, Google returns ALL current events, so absence means
the event was deleted.

```typescript
// O(n) comparison using Set-based lookup
const googleGcalIds = new Set(googleEvents.map((e) => e.id));

for (const block of existingBlocks) {
  if (!googleGcalIds.has(block.gcalId)) {
    staleBlockIds.push(block.id);
  }
}
```

Stale cleanup handles ALL block types -- parent, standalone, and T blocks. If a
T block is not in the response, it was deleted from Google, period.

## Orphan Block Detection

Orphan detection runs on all syncs (incremental and full). A T block (recurring
instance) may be returned by Google, but its parent block may no longer exist or
be valid.

The conditions for an orphan are: the T block IS in the Google response, the
parent block is NOT found in the database, and the T block status is CANCELLED.

```typescript
// Only CANCELLED instances without parents are true orphans
if (block.itemStatus === BlockStatus.Deleted && !parentBlock) {
  orphansToDelete.push(block.id);
}
```

Non-cancelled T blocks without parents are kept because they might represent
partial calendar access.

## Order Matters

This is the part that bit me. Stale cleanup MUST run BEFORE orphan detection:

1. Stale cleanup deletes blocks NOT in Google response
2. Post-processing links T blocks IN response to parents
3. If reversed: post-processing would link T blocks to parents that stale
   cleanup then deletes, creating dangling `originalId` references

The full decision table:

| Scenario                                      | Handler         | Action                |
| --------------------------------------------- | --------------- | --------------------- |
| Block NOT in response                         | Stale Cleanup   | Hard delete           |
| T block IN response, parent exists            | Post-Processing | Link to parent        |
| T block IN response, no parent, CANCELLED     | Post-Processing | Hard delete (orphan)  |
| T block IN response, no parent, NOT cancelled | Post-Processing | Keep (partial access) |

## Performance at Scale

For users with 100k+ blocks, three optimizations are essential:

1. **Minimal SELECT** -- Only fetch required fields (id, gcalId)
2. **Set-based lookup** -- O(1) comparison instead of O(n) search
3. **Batch DELETE** -- Respect PostgreSQL parameter limits (~32k)

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
  await blockRepo.delete(staleIds.slice(i, i + BATCH_SIZE));
}
```

## Practical Takeaway

Use stale cleanup during full syncs (re-sync after 410 or initial sync) where
Google returns the complete event set. Use orphan detection on any sync that
processes recurring events, since parent series can be modified or deleted
independently of their instances.

Do not run stale cleanup during incremental syncs with a valid syncToken. Google
only returns changed events in incremental responses, not all events. Absence
from an incremental response does not mean deletion -- it means the event did
not change. Getting this wrong deletes data that should still exist.

If your system does not support recurring events (no T blocks, no parent-child
relationships), orphan detection is irrelevant. Skip it entirely.
