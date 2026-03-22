---
title: 'Google Calendar API: Recurring Event Updates'
description: 'Handling "this", "thisAndFollowing", and "all" updates for recurring events.'
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - google-api
  - calendar
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
source_content_hash: 245d8e85802530ec07297b47cf9ea0175cffdf68065e6d2a9261e81a55148d58
---

I spent two days debugging a calendar sync feature before I realized the Google Calendar API handles recurring event updates in three completely different ways. The dropdown that says "This event," "All events," or "This and following events" maps to three distinct API flows, and getting any of them wrong corrupts the entire series.

Here is what I wish I had known before I started.

## The Three Update Types

When a user edits a recurring event, Google Calendar shows three options. Each one maps to a different API approach.

| UI Option            | API Approach                    |
| -------------------- | ------------------------------- |
| "This event only"    | Update specific instance        |
| "All events"         | Update recurring event resource |
| "This and following" | Split series (two API calls)    |

The complexity varies dramatically between them. "This event only" and "All events" each require a single API call. "This and following" requires at least two calls and careful exception handling. Let me walk through each one.

## Updating a Single Occurrence ("This Event Only")

This is the most straightforward case. You retrieve the specific instance from the series, modify it, and save it back. The instance becomes an "exception" to the recurring pattern.

The workflow looks like this:

1. Retrieve the specific instance via `events.instances()`
2. Modify the fields you need to change
3. Save the instance back (this creates an exception automatically)

```typescript
// Each instance becomes an exception event with:
// - recurringEventId: points to original series
// - originalStartTime: slot it would have occupied
```

The exception keeps a pointer back to the parent series through `recurringEventId`, and it records which time slot it originally occupied via `originalStartTime`. This linkage is how Google knows the exception replaces a specific occurrence rather than being an independent event.

**A word of caution:** do not modify many instances individually. Each modification creates an exception, and a series with dozens of exceptions creates clutter in the API responses and degrades performance. If you find yourself updating more than a handful of instances, updating the entire series is a better approach.

## Updating the Entire Series ("All Events")

To update all occurrences at once, you update the recurring event resource itself -- the parent event that holds the RRULE.

```typescript
// Update the recurring event's ID (not an instance ID)
// Changes propagate to all non-exception occurrences
```

The change propagates to every occurrence that has not been individually modified. Existing exceptions keep their special status. If someone changed the location of next Tuesday's meeting, and you then update the series title, next Tuesday's meeting keeps its custom location while getting the new title.

There is a critical distinction between PUT and PATCH here. Using PUT requires including ALL fields in the request body, especially the recurrence rule. If you omit the recurrence field in a PUT request, the API resets it -- and your recurring event becomes a single event. That is a destructive mistake that is hard to detect in testing because the first occurrence still looks correct.

## Updating "This and Following" (Split Recurrence)

This is where things get genuinely difficult. There is no single API call for "this and following." You have to split the series into two parts manually.

### Step 1: Trim the Original Series

Modify the original RRULE to end BEFORE the target instance. You do this by setting the `UNTIL` date to the day before the target occurrence, then updating the original recurring event.

### Step 2: Create a New Series

Create a brand-new recurring event that starts at the target occurrence. This new event contains your updated details and follows the same frequency as the original (unless the user is also changing the recurrence pattern).

### A Concrete Example

Say you have a weekly Monday meeting and the user wants to change the location starting next week.

1. Update the original series: set `UNTIL` to this Monday
2. Create a new recurring event: starts next Monday with the new location, same weekly frequency

The result is two series where there used to be one. The original covers everything up to and including this week. The new one covers next week onward.

### The Exception Problem

Here is the part that burned me: exceptions after the split point are **NOT preserved automatically**. If someone had already modified a specific occurrence three weeks from now, that modification lives on the original series. When you truncate the original to end this week, that exception becomes orphaned.

**To preserve exceptions across a split:**

1. Before splitting, retrieve all exceptions that fall after the target date
2. After creating the new series, re-apply those modifications to the corresponding instances in the new series
3. Transfer canceled and modified occurrences manually

This is tedious but necessary. Skipping it means losing user edits silently -- the kind of bug that erodes trust in your product.

## PATCH vs PUT: Choose Carefully

| Method | Behavior                      | Use When              |
| ------ | ----------------------------- | --------------------- |
| PUT    | Replaces entire resource      | Comprehensive updates |
| PATCH  | Updates only specified fields | Small changes (safer) |

PUT is dangerous because omitting any field resets it. Always include the recurrence field when using PUT on recurring events, or you will accidentally destroy the series.

PATCH is safer for small changes because it leaves unmentioned fields alone. However, PATCH costs 3 quota units compared to 1 for PUT. For high-volume integrations, that difference matters.

### The Best Practice for Safe Updates

The Google docs recommend a get-then-update pattern instead of relying on PATCH:

```text
// Instead of PATCH:
1. events.get() - fetch latest
2. events.update() - PUT with modifications + ETag
// Uses 2 calls but ensures latest data
```

This approach uses 2 API calls but guarantees you are working with the latest data. The ETag check prevents overwriting someone else's concurrent changes.

## Error Handling

Three error codes come up repeatedly when working with recurring events.

### 404 Not Found

This means one of several things: wrong `eventId` or `calendarId`, the event was never created, the event was permanently removed, or your service account does not have access to the calendar.

The fix is to verify your IDs. Do not retry blindly -- a 404 on a calendar event is almost never transient.

### 410 Gone

The event was deleted, or your sync token has expired. Treat this as permanent. Clean up your local state and move on. Retrying a 410 will never succeed.

### 412 Precondition Failed

This happens when you use ETag-based optimistic concurrency and your data is stale. Someone else modified the event between your GET and your PUT. The correct response is to fetch the latest event and re-apply your changes.

## Key Takeaways

Working with recurring events in the Google Calendar API comes down to five principles:

1. **Single instance updates create exceptions.** Use them sparingly to avoid cluttering the series.
2. **Series updates require the full resource with PUT.** Use PATCH if you want safety, but watch the quota cost.
3. **"This and following" requires splitting the series.** Plan for exception handling before you implement it.
4. **Always preserve the RRULE when using PUT.** Omitting it silently destroys the recurring pattern.
5. **Handle 404 and 410 gracefully.** Events may be deleted by other users or integrations at any time.

The Google Calendar API documentation covers these concepts, but it does not emphasize how much complexity hides behind that three-option dropdown. The split operation alone took me longer to implement correctly than the other two combined. If you are building a calendar integration, start with "All events" and "This event only" -- get those working and tested before you tackle "This and following."
