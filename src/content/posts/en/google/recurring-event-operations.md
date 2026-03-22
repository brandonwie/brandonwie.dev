---
title: Google Calendar Recurring Event Operations
description: 'Implementation patterns for `all`, `this`, and `thisAndFollowing` recurring'
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - google-api
  - calendar
  - recurring-events
  - work
category: google
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://developers.google.com/workspace/calendar/api/guides/recurringevents
    title: Recurring events — Google Calendar
    type: official
source_content_hash: 804fb8d2c0165f4ce2bb71eefd6c67ef330b354e7b0b81799a92ffab07f4242c
---

I thought I understood recurring events after reading the Google Calendar API docs. Then I hit production data with half a million edge cases and realized the docs describe the happy path. This post covers the implementation patterns I built for handling `all`, `this`, and `thisAndFollowing` operations -- including the partial invitation edge cases that no documentation warned me about.

## Block Relationships

Every recurring event in our system is modeled as a "block." The relationships between blocks form a tree, and understanding this tree is essential for every operation.

```text
Parent Block (originalId = null)
  - Has recurrence rule (RRULE)
  - Root of the series
        |
        | originalId points to parent
        v
Exception (this)              Sub-series (thisAndAfter)
- originalId = parent.id      - originalId = parent.id
- recurrence = null           - recurrence = [RRULE]
- Single occurrence override  - New branch of series
```

A parent block is the root. It has an RRULE and no `originalId`. An exception (created by a "this" operation) points back to the parent and has no recurrence rule of its own -- it overrides a single occurrence. A sub-series (created by a "thisAndFollowing" operation) also points back to the parent, but it carries its own RRULE because it generates its own occurrences.

This distinction -- whether a child block has a recurrence rule -- determines which operation created it and how it should be processed.

## Partial Invitation Edge Cases

This is where production data humbled me. When a user is invited to only part of a recurring series, Google creates blocks that look like exceptions or sub-series but behave differently.

| Type           | gcalId pattern       | originalId         | recurrence | Behavior                          |
| -------------- | -------------------- | ------------------ | ---------- | --------------------------------- |
| "TA-as-parent" | `{parentId}_R{date}` | self-ref or `null` | `!= null`  | Acts as root parent for that user |
| "T-as-single"  | `{parentId}_{date}`  | `null`             | `null`     | Acts as regular single block      |

**"TA-as-parent"** blocks appear when a user is invited to the "this and following" portion of a series. In our production database, we found 14,935 of these. The gcalId looks like a sub-series ID, but the `originalId` is self-referencing. From that user's perspective, this block IS the root parent -- other exception blocks point to it as their parent.

**"T-as-single"** blocks appear when a user is invited to a single occurrence. We found 529,801 of these in production. The gcalId has the exception-style format with a date suffix, but `originalId` and `recurrence` are both null. These blocks never enter the recurring event processing pipeline at all -- they behave as standalone single events.

The lesson: you cannot determine block type from the gcalId pattern alone. You must look at the field combination.

### Block Type Identification

Block types are determined by field combinations, not ID patterns:

| Type            | originalId | recurrence |
| --------------- | ---------- | ---------- |
| Parent          | `null`     | `!= null`  |
| TA (sub-series) | -> parent  | `!= null`  |
| T (exception)   | -> parent  | `null`     |
| "TA-as-parent"  | self-ref   | `!= null`  |
| "T-as-single"   | `null`     | `null`     |

There is an important implication for instance expansion. The `expandBlocks()` function stamps each generated instance with `instance.blockId = expanding block's ID`. For sub-series blocks, this means the blockId is the sub-series ID, not the root parent ID.

When you need to match exception blocks to instances (for example, removing cancelled occurrences from the expanded list), both sides must be resolved to the root parent ID. We built a `recurring-chain-resolver.util.ts` utility to handle this resolution.

**Production data distribution for exception blocks (as of 2026-02-20):**

- 504,161 -- Exception pointing to root parent (normal case)
- 14,935 -- Exception pointing to "TA-as-parent" (self-ref, cycle protection handles)
- 1,755 -- Exception -> Sub-series -> Root (chain depth 1)
- 88 -- Exception -> Sub-series -> Sub-series (chain depth 2)
- 1 -- deeper chain

The chain resolver walks up from any block to find the true root parent, with cycle protection for the self-referencing "TA-as-parent" case.

## Operation Types

| Operation          | Complexity | Description                             |
| ------------------ | ---------- | --------------------------------------- |
| `all`              | Low        | Update entire series                    |
| `this`             | Low        | Update single occurrence (exception)    |
| `thisAndFollowing` | **High**   | Split series, update from point forward |

Let me walk through each one in implementation detail.

## All Operation

The `all` operation updates the parent block and cascades changes to all children. The cascading behavior varies by block type:

| Block Type | Change                                 |
| ---------- | -------------------------------------- |
| Parent     | Content/time/recurrence updated        |
| Exceptions | Content updated (time preserved)       |
| Sub-series | Content updated (recurrence preserved) |

Exceptions keep their custom time because the whole point of an exception is that someone moved it to a different slot. Sub-series keep their recurrence because they may follow a different pattern than the parent. Both get content updates (title, description, location) because those should stay consistent across the series.

## This Operation

The `this` operation creates or updates an exception -- a single occurrence that differs from its parent.

```typescript
{
  originalId: parent.id,           // Points to parent
  recurrence: null,                // Exceptions have no recurrence
  originalStartDateTime: Date,     // Original slot in parent series
  startDateTime: Date,             // May differ if time was changed
}
```

The `originalStartDateTime` field is critical. It tells the expansion engine which slot in the parent series this exception replaces. Without it, you would end up with a duplicate: the original occurrence from the RRULE plus the exception.

If the user changes the time of a single occurrence, `startDateTime` differs from `originalStartDateTime`. If they only change the title or description, both timestamps match. Either way, the exception claims its original slot so the parent's RRULE does not also generate an occurrence for it.

## ThisAndFollowing Operation

This is the most complex operation. It comes in two flavors: **divide** and **non-divide**.

| Criteria             | Divide                           | Non-Divide                             |
| -------------------- | -------------------------------- | -------------------------------------- |
| Time changed?        | Yes                              | No                                     |
| Recurrence changed?  | Yes                              | No                                     |
| Creates?             | Fresh series (`originalId=null`) | Linked series (`originalId=parent.id`) |
| Deletes after split? | Yes                              | No (content updated)                   |

The decision is straightforward:

```typescript
const divide = timeChanged || changeRecurrence;
```

If the user changes the time or recurrence pattern, the series must be divided -- the old occurrences after the split point are deleted and a fresh, unlinked series is created. If only content changes (title, location, description), a linked sub-series is created and the old occurrences after the split point get their content updated.

This distinction matters for data integrity. A divide creates a clean break -- no relationship between old and new. A non-divide maintains the parent-child relationship, which keeps the event tree navigable.

## Case Taxonomy

The divide/non-divide decision combines with the split point location to produce four cases:

| Case    | Description                      | Divide? | Behavior                                   |
| ------- | -------------------------------- | ------- | ------------------------------------------ |
| **C-1** | Divide from sub-series start     | Yes     | Delete sub-series + create fresh           |
| **C-2** | Divide from middle               | Yes     | Set UNTIL + delete after + create fresh    |
| **D-1** | Non-divide from sub-series start | No      | Update content in place                    |
| **D-2** | Non-divide from middle           | No      | Set UNTIL + create linked + update content |

C-1 is the simplest divide case: the user picked the first occurrence of a sub-series, so you replace the entire sub-series. C-2 is a mid-series divide: you truncate the source with an UNTIL date and create a fresh series starting at the split point.

D-1 is the simplest non-divide: update the sub-series content in place since the split point is the start. D-2 truncates the source and creates a linked sub-series for the remaining occurrences.

## UNTIL Rule Algorithm

Getting the UNTIL dates right is the core challenge. Here is the algorithm I implemented.

### Rule 1: Identify the Source Block

```typescript
if (requestedBlock has originalId AND has recurrence) {
  sourceBlock = requestedBlock;  // Is a sub-series
} else if (requestedBlock has originalId AND no recurrence) {
  sourceBlock = parent;          // Is a `this` exception
} else {
  sourceBlock = requestedBlock;  // Is the parent
}
```

The source block is whichever block "owns" the occurrences around the split point. If the user picked an occurrence from a sub-series, the sub-series is the source. If they picked an exception, the exception's parent is the source.

### Rule 2: Update the Source UNTIL

```text
sourceBlock.UNTIL = splitPoint - 1 day
```

This truncates the source so it stops generating occurrences before the split point.

### Rule 3: Find the Blocking Block

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

A blocking block is a sub-series that starts after the split point. The new series cannot extend past it because that sub-series already owns those occurrences.

### Rule 4: Set the New Block's UNTIL

```typescript
if (blockingBlock) {
  newBlock.UNTIL = blockingBlock.start - 1 day;
} else {
  newBlock.UNTIL = sourceBlock.originalUNTIL;  // Inherit
}
```

If a blocking block exists, the new series ends before it starts. If no blocking block exists, the new series inherits the UNTIL from the source.

## Blocking Block: A Visual Example

```text
Timeline:     1   2   3   4   5   6   7   8   9  10
Parent:       [===============]
              UNTIL=5
Sub-series:                   [===================]
                              starts at 6

Pick day 3 with thisAndFollowing:
-> New block can only extend to day 5 (blocked by sub-series)
```

Without this check, the new series would generate occurrences on days 6 through 10, duplicating what the existing sub-series already produces.

## UNTIL Inheritance

When no blocking block exists, the new block inherits the UNTIL from its source:

```text
Sub-series(11-15, UNTIL=15)
Pick day 13 (no blocking block after):
-> New block UNTIL = 15 (inherited from source)
```

This preserves the intended end date of the original series.

## Common Pitfalls

### 1. UNTIL Inheritance from the Wrong Source

When splitting from a sub-series, inherit UNTIL from the sub-series, NOT the parent:

```text
Parent(1-14, UNTIL=14)
Sub-series(15-24, UNTIL=24)

Pick day 20:
  WRONG: UNTIL=14 from parent -> invisible
  RIGHT: UNTIL=24 from sub-series
```

I hit this bug in production. The new block was created with `UNTIL=14` (inherited from the parent instead of the sub-series), which meant it generated zero visible occurrences. The block existed in the database but appeared nowhere in the UI.

### 2. Query Filtering

Blocks with `UNTIL < startDate` are filtered out of query results. A correctly created block can be "invisible" if the UNTIL is wrong. This makes the bug from pitfall #1 particularly insidious -- the data looks correct in the database, but the block never appears in any API response.

### 3. TypeORM update() vs save()

When modifying blocks during a thisAndFollowing operation, use targeted updates instead of saving the full entity:

```typescript
// WRONG - may save mutated entity
await this.blockRepo.save(requestedBlock);

// RIGHT - targeted update
await this.blockRepo.update(requestedBlock.id, {
  recurrence: updatedRecurrence
});
```

The problem with `save()` is that if the entity has been mutated earlier in the operation (for example, by the UNTIL calculation logic), `save()` writes all those mutations to the database -- including ones you did not intend to persist. Using `update()` with explicit fields ensures you only change what you mean to change.

## Takeaway

Recurring event operations look simple from the API docs but become deeply complex in production. The "thisAndFollowing" operation alone has four cases, a multi-step UNTIL algorithm, blocking block resolution, and exception handling. Partial invitations add two more block types that break assumptions about ID patterns.

The implementation strategy that worked: build a block type classifier based on field combinations (not ID patterns), implement the UNTIL algorithm as a deterministic pipeline with explicit rules, and use targeted database updates instead of entity saves to avoid accidental mutations. Test against real production data distributions -- the edge cases at 0.01% of volume are the ones that corrupt user calendars.
