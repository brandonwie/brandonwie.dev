---
title: Partial Access Recurring Events
description: >-
  Google Calendar hides the parent of a recurring series from users who were
  invited partway through, and orphan cleanup that reads a missing parent as a
  deleted series will delete live events.
date: 2026-01-26T00:00:00.000Z
updated: '2026-08-02'
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
  - url: 'https://developers.google.com/workspace/calendar/api/guides/recurringevents'
    title: Recurring events — Google Calendar API
    type: official
  - url: 'https://developers.google.com/workspace/calendar/api/concepts/sharing'
    title: Calendar sharing — Google Calendar
    type: official
source_content_hash: b87482d11f0f9c804e693c9df74afa3e4ccf4bc2bca0d05a412fc7d33877f1ca
---

Orphan cleanup in a calendar sync I worked on rested on an assumption that looks safe: if a recurring event instance has no parent, the series is gone and the instance is garbage. That holds most of the time. It stops holding when Google Calendar filters out the parent because the user has no permission to see it — and then the cleanup deletes events the user still has on their calendar.

---

## The Scenario

Picture a recurring event that runs from day 1 through day 10. User A owns it. On day 5, User A invites User B to the remaining occurrences. When User B's calendar syncs:

1. The API returns the instances for days 5 through 10
2. It does **not** return the parent recurring event — User B has no access to it
3. Each returned instance still carries a `recurringEventId` pointing at that parent

Both halves of that are documented. Instances carry `recurringEventId`, described in the API guide as "the ID of the parent recurring event this instance belongs to." And the caller's access level changes what `events.list()` returns at all:

> "When a user who has free/busy permissions queries events.list(), it behaves as if singleEvent is true." — [Recurring events, Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/recurringevents)

The same page spells out what that mode means: with `singleEvents` behavior, all individual instances appear in the result and the underlying recurring events do not.

So from the syncing side, `recurringEventId` is a dangling pointer. The parent is not missing on Google's side — it exists, this user just cannot see it. The API returns no error and sets no "partial access" flag. It omits the parent and hands you the instances as if everything were normal.

---

## The Bug

The snippets below use a small illustrative model: an `event` row with `parentId`, a `recurrence` rule, a business `status`, and the raw `googleEvent` payload it came from. Substitute whatever your own schema calls them.

The orphan detection was straightforward and looked correct:

```typescript
// BUG: a missing parent is treated as proof the series is gone
if (!parent) {
  orphans.push(event); // an active event, on its way to deletion
}
```

If a recurring instance had no parent row in the local database, it was an orphan and it went. For the common case — a series gets deleted, its instances linger — that is the right behavior.

For partial-access users it was destructive. User B's days 5 through 10 had no parent row, because the parent could never be synced in the first place. The cleanup pass swept through and removed all of them.

---

## The Fix: Check Status Before Deleting

Orphans and partial-access instances differ in one observable way: status. A cancelled instance with no parent is an orphan. An active instance with no parent is far more likely to be partial access.

It helps to keep two kinds of "gone" apart here. One is the business status — the occurrence was cancelled, by the organizer or by the user. The other is the row's own storage lifecycle, the soft-delete timestamp that says this record is scheduled for cleanup. A cancelled occurrence usually still needs its row, because the cancellation itself has to keep syncing. Deletion logic has to read the business status rather than infer intent from whether a row exists.

```typescript
// Check the business status before calling a parentless row an orphan
if (!parent) {
  if (event.status === 'cancelled') {
    // cancelled and unparented: a real orphan
    orphans.push(event);
  } else {
    // active and unparented: likely partial access, keep it standalone
    keepAsStandalone(event);
    logger.warn('partial access instance preserved', { eventId: event.id });
  }
}
```

The fix adds one condition. Instead of deleting every parentless instance, it checks whether the instance is still active, preserves it if so, and logs the case — so how often this happens is a number rather than a guess.

---

## Understanding the "Effective Parent" Pattern

Partial access produces a specific shape in your data. The user cannot see the true series master, but they still hold a recurring series with its own small hierarchy.

Two terms for the rest of this post. A **series master** is the row that carries the recurrence rule. An **exception instance** is a single occurrence that was modified on its own — no recurrence rule of its own, pointing at its master.

```text
true series master (days 1-10)   <-- filtered out: no permission
  | parent link missing
visible master (days 5-10)       <-- no parent, but carries the recurrence rule
  | parent = visible master
exception instance (day 7)       <-- one occurrence, modified on its own
```

The visible master becomes what I think of as the effective parent. It is not the original master of the series, but it functions as one inside the user's access scope. The exception instance on day 7 correctly points at it rather than at the invisible true master.

This pattern matters because most recurring-event operations still work. The effective parent holds the recurrence rule and the base event data, and children point at it.

### Operations That Work

| Operation           | Status | Why                                                   |
| ------------------- | ------ | ----------------------------------------------------- |
| "This occurrence"   | Works  | creates an exception instance under the visible master |
| "All occurrences"   | Works  | updates the visible master and its exception instances |
| Remove recurrence   | Works  | converts the visible master into a single event        |
| Delete              | Works  | cleans up the exception instances under it             |

### The Operation That Needs Blocking

| Operation            | Status | Why                                    |
| -------------------- | ------ | -------------------------------------- |
| "This and following" | Broken | needs the true master's original start |

"This and following" splits a series at a chosen occurrence, which requires the original start date held by the true master. The user cannot read that record, so the split lands in the wrong place and the result is quietly wrong.

The honest option is to block it:

```typescript
if (isPartialAccessMaster(event)) {
  throw new ConflictError(
    'This-and-following is not supported for a series you were added to partway through. ' +
      'Use "this occurrence" or "all occurrences" instead.'
  );
}
```

A clear error message beats silently corrupting data.

---

## Detecting the Two Shapes

Both branches above need to recognize these rows consistently, so it is worth having one predicate for each rather than a hand-rolled check at every call site.

```typescript
type SyncedEvent = {
  id: string;
  parentId: string | null;
  recurrence: string[] | null; // RRULE lines; null on instances
  status: 'confirmed' | 'cancelled';
  googleEvent?: { recurringEventId?: string | null } | null;
};

function isExceptionInstance(event: SyncedEvent): boolean {
  // no recurrence rule of its own, and it hangs off a master that synced
  if (event.recurrence !== null || event.parentId === null) return false;
  return Boolean(event.googleEvent?.recurringEventId);
}

function isPartialAccessMaster(event: SyncedEvent): boolean {
  // no parent row, yet it carries a recurrence rule of its own
  if (event.parentId !== null || !event.recurrence) return false;
  // and it still references a parent that never arrived
  return Boolean(event.googleEvent?.recurringEventId);
}
```

There is a second, tempting signal I want to flag rather than recommend. In the data I worked with, the `recurringEventId` on a partial-access series ended in `_R` followed by a UTC timestamp, so a regex like `/_R\d{8}T\d{6}Z$/` matched every case I saw. I could not find that format documented anywhere in Google's Calendar API reference, and an undocumented ID shape is exactly the kind of thing that changes without a changelog entry.

The structural test — no parent row, a recurrence rule present, and a `recurringEventId` that never resolved — is the part worth relying on. If the ID shape is useful to you, let it decide what gets logged, not what gets deleted.

---

## Takeaway

Google Calendar's permission filtering is silent. When a user has limited access to a recurring series, the API omits what they cannot see with no indication that anything is missing. If sync logic equates "no parent" with "orphan," it will delete legitimate events for those users.

The fix is a one-line status check, but the principle behind it is broader: **absence of data is not evidence of deletion.** Check the business state of an entity before removing it. Log the ambiguous cases so they become measurable. And block operations that need data the user cannot access, rather than letting them produce silently wrong results.

Five lessons from this bug:

1. **A missing parent is not proof of an orphan** — check the record's business status first
2. **Permission filtering is silent** — no error, no flag, just fewer rows than you expected
3. **A cancelled occurrence and a row scheduled for cleanup are different states** — one is business status, the other is storage lifecycle; deletion logic should read the former
4. **Leave the reason in the code** — a comment on why the status check exists is what stops the next person from simplifying it back into the bug
5. **Centralize the detection** — one predicate for exception instances, one for partial-access masters, used everywhere
