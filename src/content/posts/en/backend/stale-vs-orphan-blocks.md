---
title: Stale vs Orphan Records in Calendar Sync
description: >-
  Google Calendar sync leaves behind two kinds of leftover rows that look
  identical in the database and need opposite handling.
date: 2026-02-05T00:00:00.000Z
updated: '2026-08-02'
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
source_content_hash: a141b0cc19f2bcdf0251c122f515aa3ae911742b258b6dea3838f554db1fa844
expanded: true
---

A calendar sync I worked on had two bugs that looked like one. It was keeping
rows it should have deleted — ghost events, gone from Google but still visible
in the app — and deleting rows it should have kept, which cost users data on
shared calendars.

Both surfaced the same way: the local database disagreed with Google. So I
handled them in a single cleanup pass. That was the mistake. The two cases have
opposite detection logic, and running them in the wrong order leaves dangling
references behind.

Some vocabulary first, because the rest of the post leans on it. A sync like
this stores each Google Calendar event locally as a row I'll call an **event
record**. A recurring series gets one record for the series itself plus one
**instance record** per occurrence, and each instance points back at its series
through a parent-link column.

## Two Types of Cleanup

After a sync, the local database accumulates records that no longer reflect
reality. They fall into two categories that look similar and require
fundamentally different handling:

| Concept           | Definition                                              | Trigger                   |
| ----------------- | ------------------------------------------------------- | ------------------------- |
| **Stale record**  | Any local record NOT in the Google response             | Event deleted from Google |
| **Orphan record** | An instance record IN the response with no valid parent | Parent series deleted     |

The critical difference is **presence in the API response**:

```text
Google API Response
├── Contains event
│   ├── Has parent → Link (normal case)
│   └── No parent → Orphan (needs cleanup)
└── Does NOT contain event → Stale (needs cleanup)
```

Stale records are absent from the response entirely — the event was deleted from
Google, so it shouldn't exist locally either. Orphan records are present in the
response but point at a series record that is no longer there.

## Why Order Matters

This is the bug that made me realize these are two separate problems. I had
orphan detection running before stale cleanup, which set up a self-inflicted
race:

1. Orphan detection links instance records to their series record
2. Stale cleanup then deletes some of those series records
3. The instance records now hold parent-link values pointing at rows that no
   longer exist
4. Subsequent syncs fail trying to resolve those broken references

The correct order is stale cleanup first, then orphan detection. Stale cleanup
removes everything absent from the response. Only then can orphan detection
safely ask whether the remaining instance records still have a valid parent.

## Stale Record Cleanup

Stale cleanup runs during full sync only — no sync token, or a resync after a
410 GONE. Google's sync guide draws this line clearly: a full sync returns the
whole collection, while an incremental response carries only what changed. So
absence from a full response means the event was deleted; absence from an
incremental response means nothing at all.

```typescript
// Build the id set once (O(m)), then one O(1) membership check per record
const googleEventIds = new Set(googleEvents.map((e) => e.id));

const staleIds: string[] = [];
for (const record of existingRecords) {
  if (!googleEventIds.has(record.googleEventId)) {
    staleIds.push(record.id);
  }
}
```

The Set is what makes this usable. Rescanning the response for every local
record is O(n·m) — too slow once an account holds 100k+ records. Building the
Set once turns the whole pass into O(n + m).

Stale cleanup handles every record type: series, standalone events, and
instances alike. If it isn't in a full response, it's stale.

## Orphan Record Detection

Orphan detection runs on all syncs, incremental and full. It walks every
instance record in the response and decides one of three things: link it to its
series when the series is present locally, delete it when it is parentless and
cancelled, or leave it alone.

That last case is the one I got wrong. Not every parentless instance is an
orphan. A cancelled instance with no parent is genuinely orphaned — the
occurrence was cancelled and its series is gone. But a non-cancelled instance
with no parent can mean partial calendar access: someone shared a single
occurrence, so the user legitimately sees the instance without ever seeing the
series. Deleting those is data loss.

```typescript
// Only cancelled instances without a parent are true orphans
if (record.status === Status.Cancelled && !parentRecord) {
  orphansToDelete.push(record.id);
}
```

## Decision Table

| Scenario                                       | Pass             | Action                |
| ---------------------------------------------- | ---------------- | --------------------- |
| Record NOT in response                         | Stale cleanup    | Hard delete           |
| Instance in response, parent exists            | Orphan detection | Link to parent        |
| Instance in response, no parent, cancelled     | Orphan detection | Hard delete (orphan)  |
| Instance in response, no parent, not cancelled | Orphan detection | Keep (partial access) |

## Performance at Scale

For accounts with large calendars (100k+ records), three things mattered:

1. **Minimal SELECT** — fetch only the two fields the comparison needs (the
   local id and the Google event id), not whole records
2. **Set-based lookup** — one O(1) membership check per record instead of a
   scan of the response
3. **Batch DELETE** — chunk the deletes so a single statement stays under the
   database driver's bound-parameter ceiling

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
  await recordRepo.delete(staleIds.slice(i, i + BATCH_SIZE));
}
```

## When This Applies

Run stale cleanup during full syncs — initial sync, or a resync after a 410
GONE — where Google returns the complete event set. Run orphan detection on any
sync that processes recurring events, since a parent series can be modified or
deleted independently of its instances.

Skip stale cleanup during incremental syncs with a valid sync token. Google only
returns changed events there, and deletions arrive as explicit entries in the
response, so absence carries no signal to act on. Orphan detection is irrelevant
if the system doesn't model recurring events at all.

## Takeaway

"Rows that need cleanup" is not one category. Stale records are absent from the
API response — deleted at the source. Orphan records are present in the response
but missing their parent — structurally invalid. Handle them separately, in the
right order (stale first, orphan second), and respect the partial-access case
where a non-cancelled parentless instance is intentional rather than broken.

## References

- [Google Calendar API — Sync Events](https://developers.google.com/calendar/api/guides/sync)
