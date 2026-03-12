---
title: 'Google Calendar API: Recurring Event Updates'
description: 'Handling "this", "thisAndFollowing", and "all" updates for recurring events.'
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - google-api
  - calendar
  - work
category: google
draft: false
lang: en
references:
  - url: >-
      https://developers.google.com/workspace/calendar/api/guides/recurringevents
    title: Recurring events — Google Calendar
    type: official
source_content_hash: 245d8e85802530ec07297b47cf9ea0175cffdf68065e6d2a9261e81a55148d58
---

## Update Types

| UI Option            | API Approach                    |
| -------------------- | ------------------------------- |
| "This event only"    | Update specific instance        |
| "All events"         | Update recurring event resource |
| "This and following" | Split series (two API calls)    |

## Updating Single Occurrence ("This event only")

1. Retrieve the specific instance via `events.instances()`
2. Update the instance ID (creates an exception)

```typescript
// Each instance becomes an exception event with:
// - recurringEventId: points to original series
// - originalStartTime: slot it would have occupied
```

**Warning:** Don't modify many instances individually - creates clutter and
degrades performance.

## Updating Entire Series ("All events")

Update the recurring event resource (parent with RRULE):

```typescript
// Update the recurring event's ID (not an instance ID)
// Changes propagate to all non-exception occurrences
```

**Important:** Using PUT requires including ALL fields (especially recurrence
rule). Omitting fields resets them.

**Exceptions remain:** Existing canceled/modified instances keep their special
status.

## Updating "This and Following" (Split Recurrence)

**No single API call exists.** Must split the series:

### Step 1: Trim Original Series

Modify the original RRULE to end BEFORE target instance:

- Set `UNTIL` date before target occurrence
- Update original recurring event

### Step 2: Create New Series

Create new recurring event:

- Starts at target occurrence
- Contains updated details
- Same frequency as original (unless changing pattern)

### Example

Weekly meeting, change location starting next week:

1. Update original: set `UNTIL` to this Monday
2. Create new: starts next Monday with new location

### Caveat: Lost Exceptions

Exceptions after the split point are **NOT preserved automatically**.

**To preserve exceptions:**

1. Before splitting, retrieve all exceptions after target date
2. After creating new series, re-apply modifications to new series
3. Transfer canceled/modified occurrences manually

## PATCH vs PUT

| Method | Behavior                      | Use When              |
| ------ | ----------------------------- | --------------------- |
| PUT    | Replaces entire resource      | Comprehensive updates |
| PATCH  | Updates only specified fields | Small changes (safer) |

**PUT Warning:** Always include recurrence field or series becomes single event.

**PATCH Note:** Counts as 3 quota units vs 1 for PUT.

### Best Practice for Atomicity

```text
// Instead of PATCH:
1. events.get() - fetch latest
2. events.update() - PUT with modifications + ETag
// Uses 2 calls but ensures latest data
```

## Error Handling

### 404 Not Found

- Wrong eventId or calendarId
- Event never created or permanently removed
- No access to calendar
- **Action:** Verify IDs, don't retry blindly

### 410 Gone

- Event was deleted
- Sync token expired (for list operations)
- **Action:** Treat as permanently gone, clean up local state

### 412 Precondition Failed

- Stale data when using ETag
- **Action:** Fetch latest event, re-apply changes

## Key Takeaways

1. **Single instance updates** create exceptions - use sparingly
2. **Series updates** require full resource with PUT (or use PATCH for safety)
3. **"This and following"** requires splitting - plan for exception handling
4. **Always preserve RRULE** when using PUT on recurring events
5. **Handle 404/410** gracefully - events may be deleted by others
