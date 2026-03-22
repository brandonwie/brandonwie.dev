---
title: Partial Access Recurring Events
description: 'When users are invited to recurring events from the middle of a series, Google'
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - google-calendar
  - data-integrity
  - edge-cases
category: icalendar
draft: false
lang: en
expanded: true
references:
  - url: 'https://developers.google.com/workspace/calendar/api/concepts/sharing'
    title: Calendar sharing — Google Calendar
    type: official
source_content_hash: d29f7528c60d87b01e6396a20820f74dea224ea589c5bde97ca544457ebbd37f
---

I watched a user lose a week of calendar events because our sync logic assumed something that turns out to be wrong: if a recurring event has no parent, it must be an orphan. That assumption holds most of the time. But when Google Calendar silently filters out events a user does not have permission to see, "no parent" does not mean "orphan." It means the user was invited to the series partway through.

---

## The Scenario

Picture this. A recurring event runs from day 1 through day 10. User A owns it. On day 5, User A invites User B to the remaining occurrences. When User B syncs their calendar, here is what happens:

1. The Google Calendar API returns instances for days 5 through 10
2. The API **filters out the parent event** -- User B has no access to it
3. Each returned instance still has a `recurringEventId` pointing to the parent

That `recurringEventId` reference is a dangling pointer. The parent event is not missing from Google's side; it exists, but User B cannot see it. The API does not return an error. It does not set a "partial access" flag. It silently omits the parent and gives you the instances as if everything is normal.

> "When a user who has free/busy permissions queries events.list(), it behaves as if singleEvent is true." -- Google Calendar API Documentation

---

## The Bug

Our orphan detection logic was straightforward and seemed correct:

```typescript
// BUG: Assumes missing parent = orphan
if (!parentBlock && !skipOrphanDetection) {
  orphansToDelete.push(block); // WRONG! Active event deleted!
}
```

If a recurring event instance had no parent in our database, we treated it as an orphan and deleted it. For most cases -- a series gets deleted, instances linger -- that is the right behavior.

But for partial-access users, this logic deleted legitimate events. User B's days 5 through 10 had no parent in our system because we could not sync the parent. The cleanup routine swept through and removed them all.

---

## The Fix: Check Status Before Deleting

The key insight is that orphans and partial-access instances differ in one observable way: their status. A cancelled instance with no parent is an orphan. An active instance with no parent is likely partial access.

```typescript
// CORRECT: Check status before marking orphan
if (!parentBlock && !skipOrphanDetection) {
  if (block.itemStatus === BlockStatus.Deleted) {
    // Truly cancelled, no parent = orphan
    orphansToDelete.push(block);
  } else {
    // Active block, no parent = likely partial access
    // Preserve as standalone event
    Sentry.captureMessage("Partial access detected", {
      extra: { blockId: block.id }
    });
  }
}
```

The fix adds one condition. Instead of deleting every parentless instance, we check whether the instance is still active. If it is active, we preserve it and log it to Sentry so we can monitor how often this occurs.

---

## Understanding the "Effective Parent" Pattern

Partial access creates an interesting data structure in your system. The user cannot see the true root event, but they still have a recurring series with its own hierarchy.

```text
True Root (days 1-4)  <-- User has NO access
  | (originalId link MISSING)
TA Block (days 5-10)  <-- originalId = null, but HAS recurrence
  | (originalId = TA.id)
T Block (day 7)       <-- originalId = TA.id
```

The TA block becomes what I call the "effective parent." It is not the original parent of the series, but it functions as one within the user's access scope. The T block (an exception instance, like a modified single occurrence on day 7) correctly points to the TA block, not to the true root.

This pattern matters because most recurring event operations still work. The effective parent has the recurrence rule. It has the base event data. Children point to it.

### Operations That Work

| Operation                | Status   | Why                               |
| ------------------------ | -------- | --------------------------------- |
| "This" (single instance) | Works | Creates T with originalId = TA.id |
| "All" (all occurrences)  | Works | Updates TA + T children           |
| Remove recurrence        | Works | Converts TA to single event       |
| Delete                   | Works | Cleans up T children              |

### Operations That Need Blocking

| Operation      | Status  | Why                       |
| -------------- | ------- | ------------------------- |
| "ThisAndAfter" | Broken  | Needs true root's DTSTART |

"ThisAndAfter" is the one operation that breaks. It needs to split the series at a point, which requires knowing the original start date from the true root. Since the user cannot access the true root, this operation produces incorrect results.

The solution is to block it explicitly:

```typescript
// Block ThisAndAfter for partial access
if (isPartialAccessBlock(requestedBlock)) {
  throw new ConflictException(
    "ThisAndAfter not supported for limited access events. " +
      'Use "This occurrence" or "All occurrences" instead.'
  );
}
```

A clear error message is better than silently corrupting data.

---

## Detection Utilities

To handle partial access consistently across the codebase, I centralized the detection logic into two utility functions.

### T Block Detection

T blocks are exception instances in a recurring series -- a single occurrence that was modified independently. They have no recurrence rule of their own and point to a parent via `originalId`.

```typescript
function isTBlock(block: {
  recurrence: string[] | null;
  originalId: number | null;
  googleEventData?: { recurringEventId?: string | null } | null;
}): boolean {
  // T block = no recurrence, has parent
  if (block.recurrence !== null || block.originalId === null) {
    return false;
  }

  const recurringEventId = block.googleEventData?.recurringEventId;
  if (!recurringEventId) return false;

  // Pattern: base_YYYYMMDDTHHmmssZ or base_YYYYMMDD
  return /^[A-Z0-9]{26}_(\d{8}T\d{6}Z|\d{8})$/.test(recurringEventId);
}
```

### Partial Access Block Detection

A partial-access TA block looks different from a normal TA block. It has no `originalId` (because the true root is invisible), but it does have a recurrence rule. The `recurringEventId` from Google follows a distinctive pattern.

```typescript
function isPartialAccessBlock(block: {
  originalId: number | null;
  recurrence: string[] | null;
  googleEventData?: { recurringEventId?: string | null } | null;
}): boolean {
  // Partial access TA: no parent, but has recurrence
  if (block.originalId !== null || !block.recurrence) {
    return false;
  }

  const recurringEventId = block.googleEventData?.recurringEventId;
  if (!recurringEventId) return false;

  return /_R\d{8}T\d{6}Z$/.test(recurringEventId);
}
```

The regex `/_R\d{8}T\d{6}Z$/` matches Google's specific naming convention for partial-access recurring event IDs. That trailing `_R` followed by a timestamp is the fingerprint.

---

## Takeaway

Google Calendar's permission filtering is silent. When a user has limited access to a recurring series, the API omits events they cannot see without any indication that data is missing. If your sync logic equates "no parent" with "orphan," you will delete legitimate events for partial-access users.

The fix is a one-line status check, but the design principle is broader: **absence of data is not the same as evidence of deletion.** Check the business state of an entity before removing it. Log the ambiguous cases so you can monitor them. And block operations that require data the user cannot access rather than letting them produce silently wrong results.

Five lessons from this bug:

1. **Absence of parent does not equal orphan** -- check business state (itemStatus) first
2. **Google API permission filtering is silent** -- no error, no flag, just missing data
3. **Status and deletion are different things** -- `itemStatus=Deleted` is not the same as `deletedAt`
4. **Document edge cases in code** -- comments on why the status check exists prevent future regressions
5. **Centralize detection logic** -- one function for T block detection, one for partial access, used everywhere
