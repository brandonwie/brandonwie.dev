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
references:
  - url: 'https://developers.google.com/workspace/calendar/api/concepts/sharing'
    title: Calendar sharing — Google Calendar
    type: official
---

Calendar API behaves unexpectedly. This causes data integrity issues if not
handled properly.

## The Problem

### Scenario

1. Recurring event: Days 1-10, User A owns it
2. User B invited starting from day 5
3. User B syncs calendar

### Google API Behavior

> "When a user who has free/busy permissions queries events.list(), it behaves
> as if singleEvent is true." — Google Calendar API Documentation

For User B:

- API returns instances (days 5-10)
- API **filters out parent event** (no access)
- Each instance has `recurringEventId` pointing to non-existent parent

### The Bug

```typescript
// ❌ BUG: Assumes missing parent = orphan
if (!parentBlock && !skipOrphanDetection) {
  orphansToDelete.push(block); // WRONG! Active event deleted!
}
```

**Result**: User B's legitimate events deleted as "orphans".

## The Fix: Status-Aware Orphan Detection

```typescript
// ✅ CORRECT: Check status before marking orphan
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

## The "Effective Parent" Pattern

When partial access users perform operations:

```text
True Root (days 1-4) ← User has NO access
  ↓ (originalId link MISSING)
TA Block (days 5-10) ← originalId = null, but HAS recurrence
  ↓ (originalId = TA.id)
T Block (day 7) ← originalId = TA.id ✅
```

The TA block becomes the "effective parent" for operations within the user's
access scope.

### Operations That Work

| Operation                | Status   | Why                               |
| ------------------------ | -------- | --------------------------------- |
| "This" (single instance) | ✅ Works | Creates T with originalId = TA.id |
| "All" (all occurrences)  | ✅ Works | Updates TA + T children           |
| Remove recurrence        | ✅ Works | Converts TA to single event       |
| Delete                   | ✅ Works | Cleans up T children              |

### Operations That Need Blocking

| Operation      | Status    | Why                       |
| -------------- | --------- | ------------------------- |
| "ThisAndAfter" | ❌ Broken | Needs true root's DTSTART |

```typescript
// Block ThisAndAfter for partial access
if (isPartialAccessBlock(requestedBlock)) {
  throw new ConflictException(
    "ThisAndAfter not supported for limited access events. " +
      'Use "This occurrence" or "All occurrences" instead.'
  );
}
```

## Detection Utilities

### T Block Detection

T blocks are exception instances in recurring series:

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

## Key Lessons

1. **Absence of parent ≠ orphan** - Check business state (itemStatus)
2. **Google API permission filtering is silent** - No error, just missing data
3. **Status vs. deletion are different** - itemStatus=Deleted ≠ deletedAt
4. **Document edge cases in code** - Prevents future regressions
5. **Centralize detection logic** - Prevents inconsistent checks
