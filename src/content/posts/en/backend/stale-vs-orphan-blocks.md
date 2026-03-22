---
title: Stale vs Orphan Blocks in Calendar Sync
description: 'When syncing calendar data from Google Calendar API, two distinct cleanup'
date: 2026-02-05T00:00:00.000Z
updated: '2026-03-22'
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
source_content_hash: 636f491942fa63855e71c52d15dafedd5a7065181825f5c4759626a3c57e8f21
expanded: true
---

Our calendar sync was deleting blocks it shouldn't have been keeping, and keeping blocks it should have been deleting. Both problems looked the same on the surface — "extra blocks in the database" — but they had completely different root causes. Conflating them into a single cleanup pass caused cascading bugs: dangling references, ghost events, and data loss on shared calendars.

The fix required understanding that there are two distinct types of blocks that need cleanup, each with different detection logic and different handling rules.

## Two Types of Cleanup

After syncing events from Google Calendar API, the local database accumulates blocks that no longer reflect reality. These fall into two categories that look similar but require fundamentally different handling:

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

Stale blocks are absent from the response entirely — the event was deleted from Google, so it shouldn't exist locally. Orphan blocks are present in the response but reference a parent that no longer exists — a recurring event instance whose series was deleted or modified.

## Why Order Matters

This was the bug that made me realize these are two separate problems. We were running orphan detection before stale cleanup, which created a race condition:

1. Orphan detection links T blocks to their parent blocks
2. Stale cleanup then deletes some of those parent blocks
3. The T blocks now have dangling `originalId` references to deleted parents
4. Subsequent syncs fail trying to resolve those broken references

The correct order is stale cleanup first, then orphan detection. Stale cleanup removes blocks that are absent from the response. Only after that's done can orphan detection safely check whether remaining T blocks have valid parents.

## Stale Block Cleanup

Stale cleanup runs during full sync only — when there's no syncToken or after a 410 resync. During full sync, Google returns ALL current events. If a local block isn't in that response, the event was deleted from Google.

```typescript
// O(n) comparison using Set-based lookup
const googleGcalIds = new Set(googleEvents.map((e) => e.id));

for (const block of existingBlocks) {
  if (!googleGcalIds.has(block.gcalId)) {
    staleBlockIds.push(block.id);
  }
}
```

The Set-based lookup is important. A naive approach comparing each existing block against the full Google response is O(n*m) — too slow for users with 100k+ blocks. Converting to a Set gives O(1) lookups per block.

Stale cleanup handles all block types: parent series, standalone events, and T blocks. If any block isn't in the response, it's stale.

## Orphan Block Detection

Orphan detection runs on all syncs — both incremental and full. A T block (recurring instance) may appear in the Google response, but its parent series may no longer exist in the database.

The key nuance: not every parentless T block is an orphan. A cancelled T block without a parent is genuinely orphaned — the instance was cancelled and its series is gone. But a non-cancelled T block without a parent might represent partial calendar access. The user can see the instance (someone shared the specific occurrence) but not the entire series. Deleting these causes data loss for shared calendars.

```typescript
// Only CANCELLED instances without parents are true orphans
if (block.itemStatus === BlockStatus.Deleted && !parentBlock) {
  orphansToDelete.push(block.id);
}
```

## Decision Table

| Scenario                                      | Handler         | Action                |
| --------------------------------------------- | --------------- | --------------------- |
| Block NOT in response                         | Stale Cleanup   | Hard delete           |
| T block IN response, parent exists            | POST-PROCESSING | Link to parent        |
| T block IN response, no parent, CANCELLED     | POST-PROCESSING | Hard delete (orphan)  |
| T block IN response, no parent, NOT cancelled | POST-PROCESSING | Keep (partial access) |

## Performance at Scale

For users with large calendars (100k+ blocks), three optimizations are necessary:

1. **Minimal SELECT** — only fetch the fields needed for comparison (id, gcalId), not the full block object
2. **Set-based lookup** — O(1) comparison instead of O(n) search per block
3. **Batch DELETE** — respect PostgreSQL parameter limits by deleting in chunks

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
  await blockRepo.delete(staleIds.slice(i, i + BATCH_SIZE));
}
```

## When This Applies

Run stale cleanup during full syncs (initial sync or resync after 410 GONE) where Google returns the complete event set. Run orphan detection on any sync that processes recurring events, since parent series can be modified or deleted independently of their instances.

Skip stale cleanup during incremental syncs with a valid syncToken — Google only returns changed events, so absence from the response doesn't mean deletion. Orphan detection is irrelevant if the system doesn't support recurring events.

## Takeaway

"Blocks that need cleanup" is not a single category. Stale blocks are absent from the API response — deleted from the source. Orphan blocks are present in the response but missing their parent — structurally invalid. Handle them separately, in the right order (stale first, orphan second), and respect the partial-access edge case where a non-cancelled T block without a parent is intentional, not broken.

## References

- [Google Calendar API — Sync Events](https://developers.google.com/calendar/api/guides/sync)
