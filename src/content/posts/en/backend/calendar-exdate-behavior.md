---
title: "Calendar EXDATE Behavior: Apple vs Google"
description: Understanding how Apple Calendar and Google Calendar handle recurring event
date: 2026-02-03T00:00:00.000Z
updated: 2026-02-03T00:00:00.000Z
tags:
  - backend
  - calendar
  - icalendar
  - rfc5545
category: backend
draft: false
lang: en
references:
  - url: "https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.1"
    title: RFC 5545 - EXDATE Property
    type: official
  - url: "https://github.com/jkbrzt/rrule/issues/548"
    title: rrule.js EXDATE with TZID limitation
    type: official
---

A user reported that deleted calendar events kept reappearing. They were
deleting single occurrences of a recurring event in Apple Calendar, but our
app never registered the deletion. The events showed up as if nothing
happened.

The root cause: Apple Calendar and Google Calendar handle "delete this only"
for recurring events in completely different ways. Our sync system only
handled the Google pattern, so Apple deletions were invisible.

## Two Ways to Delete a Single Occurrence

When a user deletes "this only" from a recurring event, the calendar
provider must communicate that deletion somehow. Apple and Google chose
opposite approaches, and both are valid per RFC 5545.

| Scenario                  | Parent has EXDATE | Exception Event Exists |
| ------------------------- | ----------------- | ---------------------- |
| Apple DELETE "this only"  | Yes               | **No**                 |
| Google DELETE "this only" | No                | Yes (`cancelled`)      |
| Apple MODIFY "this only"  | No                | Yes (`confirmed`)      |
| Google MODIFY "this only" | No                | Yes (`confirmed`)      |

The difference only shows up for deletions. Modifications create exception
events on both platforms.

## Apple Calendar Deletions

When a user deletes "this only" from Apple Calendar:

1. Apple adds an `EXDATE` line to the parent event
2. No exception event is created
3. The only signal is the EXDATE line

```text
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=Asia/Seoul:20250819T090000
```

The EXDATE property says "this occurrence does not exist." It is defined in
RFC 5545 Section 3.8.5.1 and is a valid way to express a deleted occurrence.
No separate event object is ever created.

## Google Calendar Deletions

When a user deletes "this only" from Google Calendar:

1. Google creates an exception event with `status: "cancelled"`
2. No EXDATE is added to the parent
3. The signal is the cancelled exception event

```json
{
  "id": "parent_id_20250819T000000Z",
  "recurringEventId": "parent_id",
  "status": "cancelled"
}
```

This is the pattern most calendar sync systems are built to handle -- you
watch for events with `status: "cancelled"` and a `recurringEventId`
pointing to the parent.

## The Google Passthrough Problem

Now for the part that cost me a full day of debugging. When syncing
Apple Calendar -> Google Calendar -> Your App:

- Google **preserves** Apple's EXDATE (passthrough)
- Google does **NOT** convert EXDATE to a cancelled exception event
- Your app must parse EXDATE to detect Apple deletions

This behavior is undocumented in the Google Calendar API. Google acts as a
passthrough for Apple's EXDATE lines. If your sync system only looks for
cancelled exception events, Apple deletions silently vanish.

## The rrule.js Limitation

Even after discovering the EXDATE pattern, there was another surprise. The
`rrule.js` library cannot parse EXDATE with a TZID parameter:

```text
// This FAILS in rrule.js:
EXDATE;TZID=Asia/Seoul:20250819T090000

// rrule.js expects:
EXDATE:20250819T000000Z
```

It silently ignores the EXDATE, so excluded dates still appear in the
recurrence expansion. The only clue was comparing expected vs actual
occurrence counts -- the counts did not match.

## The Fix: Parse EXDATE Separately

The solution is to extract EXDATE lines from the recurrence data, parse them
manually (handling the TZID parameter), and add them to the `RRuleSet`:

```typescript
import { RRuleSet, rrulestr } from "rrule";

function createRuleSetWithExdates(
  recurrence: string[],
  dtstart: Date,
  timeZone: string,
): RRuleSet {
  // Extract RRULE lines only
  const rruleLines = recurrence.filter((line) => line.startsWith("RRULE:"));

  // Parse RRULE
  const baseRule = rrulestr(rruleLines.join("\n"), { dtstart });

  // Parse EXDATE separately (handles TZID)
  const exdates = parseExdates(recurrence, timeZone);

  // Combine into RRuleSet
  const ruleSet = new RRuleSet();
  ruleSet.rrule(baseRule);
  for (const exdate of exdates) {
    ruleSet.exdate(exdate);
  }

  return ruleSet;
}
```

The key insight is separation: let `rrule.js` handle RRULE parsing (which
it does well), and handle EXDATE parsing yourself. The `parseExdates`
function extracts the date string from lines like
`EXDATE;TZID=Asia/Seoul:20250819T090000`, converts it using the timezone,
and returns `Date` objects that `RRuleSet.exdate()` accepts.

## Practical Checklist for Calendar Sync

1. **Do not assume exception events exist** -- Apple deletions produce no
   exception event. The only signal is EXDATE on the parent.
2. **Always parse EXDATE** -- It is the only way to detect Apple-style
   deletions when syncing through Google Calendar API.
3. **Handle rrule.js limitations** -- Parse EXDATE separately from RRULE.
   Do not pass EXDATE lines with TZID to `rrulestr()`.
4. **Google is a passthrough** -- Apple EXDATE is preserved, not converted.
   Your app must handle both deletion models simultaneously.

## When to Use This Knowledge

This matters when building a calendar sync system that ingests data from
Google Calendar API where users may have Apple Calendar as the source. It
also applies when implementing recurrence expansion that must respect single
occurrence deletions across calendar providers, or when debugging "missing
occurrences" in a recurring event series that syncs through Google.

## When This Does NOT Apply

- **Google-only calendar systems** -- If all users are on Google Calendar,
  deletions always produce cancelled exception events. EXDATE parsing adds
  no value.
- **Non-recurring events** -- EXDATE only applies to recurring event series.
  Single events use standard delete.
- **Outlook/Exchange calendars** -- Outlook has its own exception handling
  model (modified/deleted occurrences in the Exchange API). This
  Apple-vs-Google knowledge does not directly transfer.

## References

- **EXDATE**: [RFC 5545 Section 3.8.5.1](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.1) --
  Exception dates
- **RECURRENCE-ID**: [RFC 5545 Section 3.8.4.4](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.4.4) --
  Exception instance link
- **rrule.js TZID issue**: [GitHub Issue #548](https://github.com/jkbrzt/rrule/issues/548)
