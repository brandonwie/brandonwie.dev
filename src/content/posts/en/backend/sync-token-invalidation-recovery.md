---
title: Sync Token Invalidation Recovery (410 GONE)
description: 'When Google Calendar API returns 410 GONE, the sync token is invalidated and a'
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - google-calendar
  - sync
  - error-handling
category: backend
draft: false
lang: en
references:
  - url: 'https://developers.google.com/workspace/calendar/api/guides/sync'
    title: Synchronize resources efficiently — Google Calendar
    type: official
---

full resync is required. Proper handling prevents data loss.

## Why Sync Tokens Invalidate

From Google's documentation:

> "Sync tokens are invalidated by the server for various reasons including
> **token expiration** or **changes in related ACLs**."

Key insight: 410 GONE isn't just time-based expiration. ACL changes (permission
changes) also invalidate tokens.

## The Data Loss Bug

Original approach deleted all blocks and recreated from Google:

```typescript
// ❌ DANGEROUS: Loses Moba-specific data
async handleResync(calendarId: string) {
  await this.blockRepo.delete({ calendarId });  // Gone!
  const events = await this.googleApi.listEvents(calendarId);
  await this.createBlocksFromEvents(events);
}
```

**Lost data:**

- Custom notes (`note` field)
- Link data (`linkData`)
- Space assignments (`spaceId`)
- Any user customizations

## The Fix: Strategy Selection

Different strategies based on calendar access level:

```typescript
async handleResync(calendar: Calendar) {
  const accessRole = calendar.accessRole;

  if (isEditableCalendar(accessRole)) {
    // MERGE: Preserve Moba-specific fields
    await this.mergeResync(calendar);
  } else {
    // CLEAN-SLATE: Safe for read-only calendars
    await this.cleanSlateResync(calendar);
  }
}

function isEditableCalendar(accessRole: string | null): boolean {
  if (!accessRole) {
    Sentry.captureMessage('accessRole is null during 410 recovery');
    return false;  // Treat as non-editable (clean-slate)
  }
  return ['owner', 'writer'].includes(accessRole);
}
```

### Merge Strategy (Editable Calendars)

```typescript
async mergeResync(calendar: Calendar) {
  const events = await this.googleApi.listEvents(calendar.gcalId);

  for (const event of events) {
    const existing = await this.blockRepo.findOne({
      where: { calendarId: calendar.id, gcalId: event.id }
    });

    if (existing) {
      // UPDATE: Keep Moba fields, update Google fields
      await this.updateBlockFromEvent(existing, event);
    } else {
      // INSERT: New event from Google
      await this.createBlockFromEvent(event);
    }
  }
}
```

### Clean-Slate Strategy (Read-Only Calendars)

```typescript
async cleanSlateResync(calendar: Calendar) {
  // Safe: Read-only calendars have no Moba-specific data
  await this.blockRepo.delete({ calendarId: calendar.id });
  const events = await this.googleApi.listEvents(calendar.gcalId);
  await this.createBlocksFromEvents(events);
}
```

## ACL-Aware Recovery

When 410 occurs, ACL may have changed. Fetch fresh metadata before selecting
strategy:

```typescript
async handleFindEventsWithResync(calendar: Calendar) {
  const result = await this.findEvents(calendar);

  if (result.resyncRequired) {
    // CRITICAL: Refresh metadata before retry
    const freshCalendar = await this.googleApi.getCalendar(calendar.gcalId);

    if (freshCalendar) {
      // Update ALL fields from Google
      await this.updateCalendar(calendar.id, freshCalendar);
    }

    // Retry with updated accessRole
    return this.handleResync(calendar);
  }

  return result;
}
```

## Decision Matrix

| accessRole       | Strategy    | Reason                       |
| ---------------- | ----------- | ---------------------------- |
| `owner`          | Merge       | User can customize           |
| `writer`         | Merge       | User can customize           |
| `reader`         | Clean-slate | Read-only, no customizations |
| `freeBusyReader` | Clean-slate | Only sees free/busy          |
| `null`           | Clean-slate | Unexpected, log to Sentry    |

## Key Lessons

1. **410 ≠ just expiration** - ACL changes also invalidate tokens
2. **Refresh metadata on 410** - Old accessRole may be stale
3. **Editable ≠ read-only** - Different recovery strategies
4. **Log unexpected states** - null accessRole should be investigated
5. **Google is source of truth** - But preserve YOUR app's data
