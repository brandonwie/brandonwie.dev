---
title: RRULE EXDATE Parsing with Timezone
description: "The `rrule` JavaScript library's `rrulestr()` function fails when:"
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
category: icalendar
draft: false
lang: en
references:
  - url: "https://github.com/jkbrzt/rrule/issues/556"
    title: "556"
    type: official
  - url: "https://github.com/jkbrzt/rrule/issues/523"
    title: "523"
    type: official
  - url: "https://github.com/jkbrzt/rrule/issues/364"
    title: "364"
    type: official
  - url: "https://datatracker.ietf.org/doc/html/rfc5545"
    title: RFC 5545 - iCalendar Specification
    type: official
---

My analytics dashboard was showing events at the wrong times. Not shifted by a
few hours -- completely wrong. Every recurring event with exclusion dates was
generating occurrences at the current timestamp instead of the scheduled times.
The `rrule` library was silently failing, and it took me a while to figure out
why.

## The Silent Failure

The `rrulestr()` function in the `rrule` JavaScript library breaks under two
conditions:

1. EXDATE comes before RRULE in the recurrence array
2. EXDATE has a TZID parameter (timezone-aware exclusion dates)

When either condition is true, the library does not throw an error. It does not
return an empty array. It silently generates occurrences at the **current
timestamp**. The output looks valid until you inspect the dates closely and
realize every occurrence is right now.

## Why This Happens

Google Calendar stores recurrence as an array with mixed content:

```javascript
[
  "EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000",
  "RRULE:FREQ=WEEKLY;BYDAY=FR",
];
```

Notice the order: EXDATE first, RRULE second. When `rrulestr()` tries to parse
this:

- It expects RRULE first, EXDATE after
- It cannot properly handle the TZID parameter in EXDATE
- It falls back to generating occurrences at the current timestamp

The order sensitivity is not documented anywhere. I discovered it by trial and
error after the Google Calendar API returned EXDATE before RRULE.

## The Dead End: forceset

You might think `rrulestr(fullString, { forceset: true })` would solve this.
The `forceset` option exists specifically for handling RRULE+EXDATE
combinations. But it still fails:

1. It still cannot parse TZID in EXDATE
2. Order of lines in the string still matters
3. The library has documented issues with timezone handling

I spent significant debugging time on this dead end before accepting that the
library's built-in EXDATE handling is broken for timezone-aware exclusion dates.

## The Solution: Parse Separately, Combine Manually

The fix is straightforward: do not let `rrulestr()` see the EXDATE lines at
all. Parse RRULE and EXDATE separately, then combine them using `RRuleSet`:

```typescript
import { RRuleSet, rrulestr } from "rrule";

// 1. Extract only RRULE lines (filter out EXDATE, RDATE)
const rruleLines = extractRRulesOnly(block.recurrence);
const rruleString = rruleLines.join("\n");

// 2. Parse RRULE only
const baseRule = rrulestr(rruleString, { dtstart: parentStart });

// 3. Parse EXDATE separately (handles TZID correctly)
const exdates = parseExdates(block.recurrence, timeZone);

// 4. Combine in RRuleSet
const ruleSet = new RRuleSet();
ruleSet.rrule(baseRule);
for (const exdate of exdates) {
  ruleSet.exdate(exdate);
}

// 5. Generate occurrences
const occurrences = ruleSet.between(periodStart, periodEnd, true);
```

The key insight: `rrulestr()` works fine when it only sees RRULE lines. The
failure happens when EXDATE lines are present. By filtering them out and handling
them ourselves, we bypass the bug entirely.

## The Helper Functions

### extractRRulesOnly

This function filters the recurrence array to keep only RRULE lines:

```typescript
export function extractRRulesOnly(recurrence: string[] | null): string[] {
  if (!recurrence || recurrence.length === 0) return [];

  return recurrence
    .filter((line) => line.startsWith("RRULE:") || line.startsWith("RRULE;"))
    .map(sanitizeRRule);
}
```

### parseExdates

This function handles all four EXDATE formats that Google Calendar produces:

```typescript
export function parseExdates(
  recurrence: string[] | null,
  blockTimeZone: string,
): Date[] {
  // Supported formats:
  // - EXDATE:20251219T090000Z (UTC)
  // - EXDATE;VALUE=DATE:20251219 (date only)
  // - EXDATE;TZID=Asia/Seoul:20251219T180000 (with timezone)
  // - EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000 (multiple)
  // Returns array of Date objects in UTC
}
```

Google Calendar uses all four formats depending on how the exclusion was created.
The UTC format (`...Z`) works with the library natively, but the TZID format
does not. The custom parser handles all four and returns UTC Date objects that
`RRuleSet.exdate()` can consume.

## When to Use This Approach

- Parsing Google Calendar recurring events that include EXDATE with TZID
  parameters
- Any scenario where `rrulestr()` produces occurrences at the current timestamp
  instead of expected dates
- Building calendar integrations that must handle all four EXDATE formats (UTC,
  date-only, TZID single, TZID multiple)

## When NOT to Use This Approach

- **No EXDATE lines** -- Standard `rrulestr()` works fine for RRULE-only input.
- **UTC-only EXDATE** -- The library handles `EXDATE:...Z` correctly when RRULE
  comes first.
- **Different rrule library** -- This workaround is specific to the
  `jkbrzt/rrule` JavaScript library. Python's `dateutil` and other
  implementations may handle EXDATE+TZID correctly.
- **RDATE handling** -- This solution filters out RDATE lines. If you need RDATE
  support, additional parsing is required.

## Practical Takeaway

When `rrulestr()` produces occurrences at the current time instead of the
expected schedule, the most likely cause is EXDATE with a TZID parameter. The
fix is to never pass EXDATE lines to `rrulestr()`. Extract RRULE lines
separately, parse EXDATE with a custom function that handles all four Google
Calendar formats, and combine them in an `RRuleSet`. This is the only reliable
approach until the library fixes its EXDATE/TZID handling.

## References

- [rrule GitHub Issue #556](https://github.com/jkbrzt/rrule/issues/556) - BYDAY
  returns wrong days
- [rrule GitHub Issue #523](https://github.com/jkbrzt/rrule/issues/523) -
  Invalid date with tzid
- [rrule GitHub Issue #364](https://github.com/jkbrzt/rrule/issues/364) - TZID
  ignored
- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - iCalendar
  specification
