---
title: 'Calendar EXDATE Behavior: Apple vs Google'
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
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.1'
    title: RFC 5545 - EXDATE Property
    type: official
  - url: 'https://github.com/jkbrzt/rrule/issues/548'
    title: rrule.js EXDATE with TZID limitation
    type: official
---

deletions differently is critical for calendar sync systems.

---

## The Problem

When building a calendar sync system that receives data through Google Calendar
API, deleting a single occurrence of a recurring event ("this only") produces no
cancelled exception event if the original deletion happened in Apple Calendar.
The deletion signal is an EXDATE line on the parent event, not a separate event
object. If your sync system only looks for cancelled exception events (the
Google pattern), Apple Calendar deletions silently disappear from your app.

## Difficulties Encountered

- **No exception event created** — Apple "delete this only" adds an EXDATE to
  the parent instead of creating a cancelled exception event. This is valid per
  RFC 5545 but opposite to Google's behavior, and nothing in the Google Calendar
  API documentation warns about this.
- **Google passthrough is undocumented** — Google preserves Apple EXDATE lines
  when syncing Apple Calendar data through its API but does not convert them to
  cancelled events. Discovering this required testing with real Apple-to-Google
  synced calendars.
- **rrule.js TZID limitation** — The rrule.js library cannot parse
  `EXDATE;TZID=Asia/Seoul:20250819T090000`. It silently ignores the EXDATE, so
  excluded dates still appear in the recurrence expansion. The only clue was
  comparing expected vs actual occurrence counts.
- **Two deletion models to support** — A robust sync system must handle both
  Apple-style (EXDATE on parent) and Google-style (cancelled exception event)
  simultaneously for the same recurring event series.

---

## The Critical Distinction

| Scenario                  | Parent has EXDATE | Exception Event Exists |
| ------------------------- | ----------------- | ---------------------- |
| Apple DELETE "this only"  | Yes               | **No**                 |
| Google DELETE "this only" | No                | Yes (`cancelled`)      |
| Apple MODIFY "this only"  | No                | Yes (`confirmed`)      |
| Google MODIFY "this only" | No                | Yes (`confirmed`)      |

## Why This Matters

### Apple Calendar Deletions

When a user deletes "this only" from Apple Calendar:

1. Apple adds `EXDATE` line to parent event
2. **No exception event is created**
3. The only signal is the EXDATE line

```text
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=Asia/Seoul:20250819T090000
```

### Google Calendar Deletions

When a user deletes "this only" from Google Calendar:

1. Google creates an exception event with `status: "cancelled"`
2. **No EXDATE is added** to parent
3. The signal is the cancelled exception event

```json
{
  "id": "parent_id_20250819T000000Z",
  "recurringEventId": "parent_id",
  "status": "cancelled"
}
```

## Google Calendar API Passthrough

When syncing Apple Calendar -> Google Calendar -> Your App:

- Google **preserves** Apple's EXDATE (passthrough)
- Google does **NOT** create a cancelled exception event for Apple deletions
- Your app must parse EXDATE to detect Apple deletions

## Implementation: rrule.js Limitation

The `rrule.js` library cannot parse EXDATE with TZID parameter:

```text
// This FAILS in rrule.js:
EXDATE;TZID=Asia/Seoul:20250819T090000

// rrule.js expects:
EXDATE:20250819T000000Z
```

### Solution: Parse EXDATE Separately

```typescript
import { RRuleSet, rrulestr } from "rrule";

function createRuleSetWithExdates(
  recurrence: string[],
  dtstart: Date,
  timeZone: string
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

## Key Points

1. **Don't assume exception events exist** - Apple deletions have no exception
2. **Always parse EXDATE** - It's the only signal for Apple deletions
3. **rrule.js needs help** - Parse EXDATE separately, add to RRuleSet
4. **Google is a passthrough** - Apple EXDATE preserved, not converted

---

## When to Use

- Building a calendar sync system that ingests data from Google Calendar API
  where users may have Apple Calendar as the source
- Implementing recurrence expansion that must respect single occurrence
  deletions across calendar providers
- Debugging "missing occurrences" in a recurring event series that syncs through
  Google

## When NOT to Use

- **Google-only calendar systems** — If all users are on Google Calendar,
  deletions always produce cancelled exception events; EXDATE parsing adds no
  value
- **Non-recurring events** — EXDATE only applies to recurring event series;
  single events use standard delete
- **Outlook/Exchange calendars** — Outlook has its own exception handling model
  (modified/deleted occurrences in the Exchange API); this Apple-vs-Google
  knowledge does not directly transfer

---

## RFC 5545 Reference

- **EXDATE**:
  [Section 3.8.5.1](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.1) -
  Exception dates
- **RECURRENCE-ID**:
  [Section 3.8.4.4](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.4.4) -
  Exception instance link
