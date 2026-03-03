---
title: Google Calendar Sync Strategies
description: Full sync vs incremental sync patterns and calendar segregation logic.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - google-api
  - sync
  - calendar
  - work
category: google
draft: false
lang: en
references:
  - url: 'https://developers.google.com/workspace/calendar/api/guides/sync'
    title: Synchronize resources efficiently — Google Calendar
    type: official
---

## Sync Parity Principle

> **App must show EXACTLY what Google Calendar web app shows - no more, no less.**

Users only understand: "Google shows X" → "App should show X". Any difference = bug.

## Sync Modes

### Full Sync (No Token)

**When**: First sync, or after 410 GONE error

```typescript
const params = {
  showDeleted: true,   // See deleted calendars
  showHidden: true,    // Catch hidden primary calendars
  maxResults: 250,
};
```

**Behavior**:

- Returns ALL calendars for account
- Orphan detection enabled (CASE #3)
- Primary calendar should ALWAYS be present

### Incremental Sync (With Token)

**When**: syncToken exists in DB

```typescript
const params = {
  syncToken: '<stored_token>',
  maxResults: 250,
};
```

**Behavior**:

- Returns ONLY changed calendars since last sync
- Google auto-includes deleted and hidden
- `deleted=true` explicitly marks removed calendars
- Orphan detection DISABLED (absence = unchanged)
- Primary may not be present (unchanged = not returned)

## API Parameters

### Calendar List API

| Parameter     | Full Sync | Incremental   | Description                |
| ------------- | --------- | ------------- | -------------------------- |
| `syncToken`   | Omit      | Required      | Token from previous sync   |
| `showDeleted` | true      | Auto-included | Include deleted calendars  |
| `showHidden`  | true      | Auto-included | Include hidden calendars   |
| `maxResults`  | 250       | 250           | Page size (max 250)        |

### Events API

| Parameter               | Value     | Description                   |
| ----------------------- | --------- | ----------------------------- |
| `showHiddenInvitations` | **false** | Declined events - don't show  |
| `showDeleted`           | true      | Include deleted for sync      |
| `singleEvents`          | false     | Keep recurring structure      |

## 410 GONE Error Handling

```typescript
if (error.code === 410) {
  // Clear token and retry as full sync
  return this.findCalendars(userId, integrationId, undefined);
}
```

**Occurs when**: Token expired, ACL changes, server invalidation

## Calendar Segregation Logic (CASE)

| CASE | Trigger                    | Full Sync              | Incremental            |
| ---- | -------------------------- | ---------------------- | ---------------------- |
| #1   | `deleted=true` in response | Delete                 | Delete                 |
| #2   | Calendar in response       | Create/Update          | Create/Update          |
| #3   | NOT in response            | Mark orphan → Delete   | **SKIP** (unchanged)   |

### CASE #1 Safeguard

Primary calendar CANNOT be deleted. If `deleted=true` for primary:

- Contradictory data (impossible)
- Throw exception, capture to Sentry
- Transaction rollback

### CASE #3 Safeguard

If Google primary not in full sync response but exists in DB:

- Skip deletion (protect calendar)
- Log ERROR + Sentry
- Continue sync (self-healing)

## App Primary vs Google Primary

| Concept        | Field                      | Description                    |
| -------------- | -------------------------- | ------------------------------ |
| App Primary    | `calendar.primary`         | User-settable, any calendar    |
| Google Primary | `calendar.isGooglePrimary` | Always user's email calendar   |

### Primary Reassignment

When app primary being deleted:

1. Check if also Google primary (throw if so)
2. Find Google primary from response
3. Fallback: Find from DB
4. Set as new app primary with `show=true`
5. Error if no replacement found

## Key Takeaways

1. **Sync parity** is the #1 rule - match Google web UI exactly
2. **Full vs incremental** have different orphan handling
3. **Protect primary** calendar from deletion
4. **410 GONE** requires full resync with token clear
