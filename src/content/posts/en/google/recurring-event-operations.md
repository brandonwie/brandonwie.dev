---
title: Google Calendar Recurring Event Operations
description: 'Implementation patterns for `all`, `this`, and `thisAndFollowing` recurring'
date: 2026-01-23T00:00:00.000Z
updated: 2026-02-20T00:00:00.000Z
tags:
  - google-api
  - calendar
  - recurring-events
  - work
category: google
draft: false
lang: en
references:
  - url: >-
      https://developers.google.com/workspace/calendar/api/guides/recurringevents
    title: Recurring events — Google Calendar
    type: official
---

event updates.

## Block Relationships

```text
Parent Block (originalId = null)
  • Has recurrence rule (RRULE)
  • Root of the series
        │
        │ originalId points to parent
        ▼
Exception (`this`)              Sub-series (`thisAndAfter`)
• originalId = parent.id        • originalId = parent.id
• recurrence = null             • recurrence = [RRULE]
• Single occurrence override    • New branch of series
```

### Partial Invitation Edge Cases (discovered 2026-02-20)

When a user is invited to only part of a recurring series, Google creates blocks
that look like exceptions or sub-series but behave differently:

| Type           | gcalId pattern       | originalId         | recurrence | Behavior                          |
| -------------- | -------------------- | ------------------ | ---------- | --------------------------------- |
| "TA-as-parent" | `{parentId}_R{date}` | self-ref or `null` | `!= null`  | Acts as root parent for that user |
| "T-as-single"  | `{parentId}_{date}`  | `null`             | `null`     | Acts as regular single block      |

**"TA-as-parent"** (14,935 in production): User invited to "this and following"
portion only. Has TA-style gcalId but `originalId` is self-referencing. T blocks
for this user point to this block as their parent.

**"T-as-single"** (529,801 in production): User invited to a single occurrence
only. Has exception-style gcalId but no `originalId` or `recurrence`. Never
enters recurring event processing pipelines.

### Block Type Identification (Code-Level)

Block types are determined by field combinations, NOT gcalId pattern alone:

| Type            | originalId | recurrence |
| --------------- | ---------- | ---------- |
| Parent          | `null`     | `!= null`  |
| TA (sub-series) | → parent   | `!= null`  |
| T (exception)   | → parent   | `null`     |
| "TA-as-parent"  | self-ref   | `!= null`  |
| "T-as-single"   | `null`     | `null`     |

**Key insight for analytics/expansion:** `expandBlocks()` stamps
`instance.blockId = expanding block's ID`. For TA blocks, this is the TA ID, not
the root parent. When matching T blocks to instances (e.g., removing cancelled
occurrences), both sides must be resolved to the root parent ID. See
`recurring-chain-resolver.util.ts` for the resolution utility.

**Production data distribution (T blocks, 2026-02-20):**

- 504,161 — T → Root parent (normal case)
- 14,935 — T → "TA-as-parent" (self-ref, cycle protection handles)
- 1,755 — T → TA → Root (chain depth 1)
- 88 — T → TA → TA (chain depth 2)
- 1 — deeper chain

## Operation Types

| Operation          | Complexity | Description                             |
| ------------------ | ---------- | --------------------------------------- |
| `all`              | Low        | Update entire series                    |
| `this`             | Low        | Update single occurrence (exception)    |
| `thisAndFollowing` | **High**   | Split series, update from point forward |

## All Operation

Updates parent block and all children (exceptions and sub-series).

| Block Type | Change                                 |
| ---------- | -------------------------------------- |
| Parent     | Content/time/recurrence updated        |
| Exceptions | Content updated (time preserved)       |
| Sub-series | Content updated (recurrence preserved) |

## This Operation

Creates or updates an exception - single occurrence that differs from parent.

```typescript
{
  originalId: parent.id,           // Points to parent
  recurrence: null,                // Exceptions have no recurrence
  originalStartDateTime: Date,     // Original slot in parent series
  startDateTime: Date,             // May differ if time was changed
}
```

## ThisAndFollowing Operation

Most complex - classified as **divide** or **non-divide**:

| Criteria             | Divide                           | Non-Divide                             |
| -------------------- | -------------------------------- | -------------------------------------- |
| Time changed?        | Yes                              | No                                     |
| Recurrence changed?  | Yes                              | No                                     |
| Creates?             | Fresh series (`originalId=null`) | Linked series (`originalId=parent.id`) |
| Deletes after split? | Yes                              | No (content updated)                   |

```typescript
const divide = timeChanged || changeRecurrence;
```

## Case Taxonomy

| Case    | Description                      | Divide? | Behavior                                   |
| ------- | -------------------------------- | ------- | ------------------------------------------ |
| **C-1** | Divide from sub-series start     | Yes     | Delete sub-series + create fresh           |
| **C-2** | Divide from middle               | Yes     | Set UNTIL + delete after + create fresh    |
| **D-1** | Non-divide from sub-series start | No      | Update content in place                    |
| **D-2** | Non-divide from middle           | No      | Set UNTIL + create linked + update content |

## UNTIL Rule Algorithm

### Rule 1: Identify Source Block

```typescript
if (requestedBlock has originalId AND has recurrence) {
  sourceBlock = requestedBlock;  // Is a sub-series
} else if (requestedBlock has originalId AND no recurrence) {
  sourceBlock = parent;          // Is a `this` exception
} else {
  sourceBlock = requestedBlock;  // Is the parent
}
```

### Rule 2: Update Source UNTIL

```text
sourceBlock.UNTIL = splitPoint - 1 day
```

### Rule 3: Find Blocking Block

```typescript
blockingBlock = relatedBlocks
  .filter(
    (block) =>
      block.recurrence !== null &&
      getBlockStart(block) > splitPoint &&
      block.deletedAt === null
  )
  .sort((a, b) => getBlockStart(a) - getBlockStart(b))[0];
```

### Rule 4: Set New Block's UNTIL

```typescript
if (blockingBlock) {
  newBlock.UNTIL = blockingBlock.start - 1 day;
} else {
  newBlock.UNTIL = sourceBlock.originalUNTIL;  // Inherit
}
```

## Key Concepts

### Blocking Block

Sub-series that limits how far new `thisAndFollowing` can extend:

```text
Timeline:     1   2   3   4   5   6   7   8   9  10
Parent:       [===============]
              UNTIL=5
Sub-series:                   [===================]
                              starts at 6

Pick day 3 with thisAndFollowing:
→ New block can only extend to day 5 (blocked by sub-series)
```

### UNTIL Inheritance

When no blocking block exists, new block inherits UNTIL from source:

```text
Sub-series(11-15, UNTIL=15)
Pick day 13 (no blocking block after):
→ New block UNTIL = 15 (inherited from source)
```

## Common Pitfalls

### 1. UNTIL Inheritance from Wrong Source

When splitting from sub-series, inherit UNTIL from sub-series, NOT parent:

```text
Parent(1-14, UNTIL=14)
Sub-series(15-24, UNTIL=24)

Pick day 20:
❌ WRONG: UNTIL=14 from parent → invisible
✅ RIGHT: UNTIL=24 from sub-series
```

### 2. Query Filtering

Blocks with `UNTIL < startDate` are filtered out. A correctly created block can
be "invisible" if UNTIL is wrong.

### 3. TypeORM update() vs save()

Use `blockRepo.update(id, { field })` when entity may have been mutated:

```typescript
// WRONG - may save mutated entity
await this.blockRepo.save(requestedBlock);

// RIGHT - targeted update
await this.blockRepo.update(requestedBlock.id, {
  recurrence: updatedRecurrence
});
```
