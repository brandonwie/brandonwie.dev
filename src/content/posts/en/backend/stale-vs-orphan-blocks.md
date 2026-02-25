---
title: Stale vs Orphan Blocks in Calendar Sync
description: 'When syncing calendar data from Google Calendar API, two distinct cleanup'
date: 2026-02-05T00:00:00.000Z
updated: 2026-02-13T00:00:00.000Z
tags:
  - backend
  - sync
  - google-calendar
category: backend
draft: false
lang: en
references:
  - url: 'https://developers.google.com/calendar/api/guides/sync'
    title: Google Calendar API - Sync Events
    type: official
---

scenarios exist that require different handling strategies.

---

## The Problem

After syncing events from Google Calendar API, the local database can accumulate
blocks that no longer reflect reality: events deleted from Google still exist
locally, and recurring event instances may reference parents that no longer
exist. Without distinguishing these two cleanup scenarios and handling them in
the correct order, the sync produces dangling references, ghost events, and data
corruption.

---

## Difficulties Encountered

- **Confusing stale with orphan** — Both result in "blocks that should be
  deleted," but they have fundamentally different detection logic (absence from
  response vs presence without valid parent). Treating them identically caused
  missed deletions and false positives
- **Order-of-operations bug** — Running orphan detection before stale cleanup
  caused T blocks to be linked to parents that stale cleanup then deleted,
  creating dangling `originalId` references that broke subsequent syncs
- **Partial-access edge case** — A cancelled T block without a parent is an
  orphan, but a non-cancelled T block without a parent might represent partial
  calendar access (user can see the instance but not the series). Deleting these
  caused data loss for shared calendars
- **Performance at scale** — Naive O(n\*m) comparison between existing blocks
  and Google response was too slow for users with 100k+ blocks; had to switch to
  Set-based O(1) lookups and batched deletes

---

## Definitions

| Concept          | Definition                                                    | Trigger                   |
| ---------------- | ------------------------------------------------------------- | ------------------------- |
| **Stale Block**  | ANY calendar block NOT in Google response                     | Event deleted from Google |
| **Orphan Block** | T block (recurring instance) IN response without valid parent | Parent deleted/modified   |

---

## Key Distinction

The critical difference is **presence in API response**:

```text
Google API Response
├── Contains event
│   ├── Has parent → Link (normal case)
│   └── No parent → Orphan (needs cleanup)
└── Does NOT contain event → Stale (needs cleanup)
```

---

## Stale Block Cleanup

**When**: Full sync only (no syncToken or resync after 410)

**Why**: During full sync, Google returns ALL current events. Absence means the
event was deleted from Google.

**Implementation**:

```typescript
// O(n) comparison using Set-based lookup
const googleGcalIds = new Set(googleEvents.map((e) => e.id));

for (const block of existingBlocks) {
  if (!googleGcalIds.has(block.gcalId)) {
    staleBlockIds.push(block.id);
  }
}
```

**Important**: Stale cleanup handles ALL block types (parent, standalone, AND T
blocks). If a T block is not in the response, it was deleted from Google.

---

## Orphan Block Detection

**When**: All syncs (incremental and full)

**Why**: A T block (recurring instance) may be returned by Google but its parent
block may no longer exist or be valid.

**Conditions for orphan**:

1. T block IS in Google response
2. Parent block NOT found in DB
3. T block status is CANCELLED

**Implementation**:

```typescript
// Only CANCELLED instances without parents are true orphans
if (block.itemStatus === BlockStatus.Deleted && !parentBlock) {
  orphansToDelete.push(block.id);
}
```

---

## Order Matters

Stale cleanup MUST run BEFORE orphan detection (POST-PROCESSING):

1. Stale cleanup deletes blocks NOT in Google response
2. POST-PROCESSING links T blocks IN response to parents
3. If reversed: POST-PROCESSING would link T blocks to parents that stale
   cleanup then deletes → dangling originalId references

---

## Decision Table

| Scenario                                      | Handler         | Action                |
| --------------------------------------------- | --------------- | --------------------- |
| Block NOT in response                         | Stale Cleanup   | Hard delete           |
| T block IN response, parent exists            | POST-PROCESSING | Link to parent        |
| T block IN response, no parent, CANCELLED     | POST-PROCESSING | Hard delete (orphan)  |
| T block IN response, no parent, NOT cancelled | POST-PROCESSING | Keep (partial access) |

---

## Performance Considerations

For users with 100k+ blocks:

1. **Minimal SELECT** - Only fetch required fields (id, gcalId)
2. **Set-based lookup** - O(1) comparison instead of O(n) search
3. **Batch DELETE** - Respect PostgreSQL parameter limits (~32k)

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
  await blockRepo.delete(staleIds.slice(i, i + BATCH_SIZE));
}
```

---

## When to Use

- **Full sync (re-sync after 410 or initial sync)** — Stale cleanup is essential
  because Google returns the complete event set; any local block not in that set
  is definitively deleted
- **Any sync that processes recurring events** — Orphan detection is needed
  whenever T blocks are present, since parent series can be modified or deleted
  independently of their instances
- **High-volume calendars (100k+ blocks)** — The Set-based lookup and batched
  delete patterns become critical at scale

---

## When NOT to Use

- **Incremental sync with valid syncToken** — Stale cleanup should NOT run
  during incremental syncs because Google only returns changed events, not all
  events. Absence from an incremental response does not mean deletion
- **Read-only calendar views** — If the application only displays calendar data
  without persisting a local copy, there are no local blocks to clean up
- **Non-recurring event systems** — Orphan detection is irrelevant if the system
  does not support recurring events (no T blocks, no parent-child relationships)
