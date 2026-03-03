---
title: Google Meet Link Creation
description: Lesson learned from implementing programmatic Google Meet link creation.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - google-api
  - work
category: google
draft: false
lang: en
references:
  - url: 'https://developers.google.com/workspace/calendar/api/guides/create-events'
    title: Create events — Google Calendar
    type: official
---

## Context

Needed to create Google Meet links for users. The challenge was finding an
approach that works for both free Gmail accounts and Google Workspace accounts.

## Options Considered

| Option                               | Pros                                         | Cons                                              |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------------- |
| **Calendar API with conferenceData** | Universal (Gmail + Workspace), battle-tested | Requires calendar write, create/delete overhead   |
| **Meet REST API (spaces.create)**    | Direct creation, more control                | **Workspace only** - doesn't work with free Gmail |
| **Pre-generated Meet links**         | Simple                                       | Not scalable, security concerns                   |

## Decision

**Chose Calendar API with conferenceData.**

### Why

1. **Universal Compatibility**: Works with both free Gmail and paid Workspace
   accounts
2. **Proven Reliability**: Industry-standard approach
3. **Clear Ownership**: Meet links bound to specific calendars
4. **Minimal Overhead**: Create event → extract link → delete event is fast

### Critical Finding

The Google Meet REST API **requires Google Workspace** - free Gmail accounts
cannot use `spaces.create`. This made it unsuitable for our user base.

## Implementation

```typescript
// 1. Use the calendar's integration for OAuth
// 2. Create event with conferenceData
// 3. Extract Meet link
// 4. Delete temporary event
// 5. Return persistent Meet link (survives event deletion)
```

## Key Findings

1. **Meet link persists after event deletion** - The meeting room remains
   accessible even after the temporary calendar event is deleted

2. **Calendar binding makes sense**:
   - Calendar owner = meeting host
   - Calendar write access = can create meetings
   - Different calendars can use different Google accounts

3. **Rate limits are generous** - Both APIs are free, Calendar API has generous
   quotas

4. **Free accounts have 60-min limit** - Meetings with 3+ participants on free
   Gmail accounts have time limits

## Key Takeaways

1. **Check account type requirements** - APIs may have different capabilities
   for free vs paid accounts

2. **"New and shiny" isn't always better** - The Meet REST API (Feb 2024) seemed
   ideal but had deal-breaking limitations

3. **Workarounds can be permanent solutions** - Creating/deleting a temp event
   feels like a hack, but it's the industry standard

4. **Bind resources logically** - Associating Meet links with calendars provides
   clear ownership

5. **Future-proof with fallbacks** - If Meet API supports free accounts later,
   maintain Calendar API as fallback
