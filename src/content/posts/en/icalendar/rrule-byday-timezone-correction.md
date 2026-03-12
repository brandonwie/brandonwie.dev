---
title: rrule BYDAY Timezone Correction
description: 'The rrule JavaScript library interprets `BYDAY` weekday names in UTC, not the'
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - rrule
  - timezone
  - icalendar
category: icalendar
draft: false
lang: en
references:
  - url: 'https://github.com/jkbrzt/rrule/issues/556'
    title: '556'
    type: official
  - url: 'https://github.com/jkbrzt/rrule/issues/523'
    title: '523'
    type: official
  - url: 'https://github.com/jkbrzt/rrule/issues/364'
    title: '364'
    type: official
  - url: 'https://github.com/jkbrzt/rrule'
    title: rrule
    type: official
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545'
    title: rfc5545
    type: verified
source_content_hash: cbec364d2baf3f3558869473982694597e7c7bbd1f243c5eaa9bf0178ca12557
---

block's timezone. This causes incorrect event expansion for events that cross
midnight between timezones.

## The Problem

| Block Setup                      | rrule Interpretation           | Result                                              |
| -------------------------------- | ------------------------------ | --------------------------------------------------- |
| Friday 08:00 KST (Thu 23:00 UTC) | `BYDAY=FR` = Friday in **UTC** | Generates Fri 23:00 UTC = **Sat** 08:00 KST (WRONG) |
| Expected                         | `BYDAY=FR` = Friday in **KST** | Should generate Thu 23:00 UTC = **Fri** 08:00 KST   |

---

## Difficulties Encountered

- **Library's `tzid` option appeared to be the fix:** The rrule library accepts
  a `tzid` parameter, which suggested timezone-aware expansion was built in.
  Multiple GitHub issues confirmed it is broken, but this was not obvious from
  the API surface.
- **"Pseudo-UTC" dates mislead debugging:** The library returns dates that look
  like UTC (ISO string with Z suffix) but are actually meant to be interpreted
  in the TZID timezone. This made it seem like the output was correct until
  comparing against the actual local time.
- **Month boundary arithmetic trap:** Naive day offset using `.date()`
  difference (e.g., Feb 1 - Jan 31 = -30) produced wildly wrong shifts. Had to
  switch to date-string-based comparison.
- **Cross-timezone occurrences fall outside the query period:** Events near
  midnight boundaries were silently excluded because the query window was too
  tight. Required expanding the rrule period by +/-1 day as a safety margin.

---

## Why rrule's tzid Option Doesn't Work

The rrule library has documented issues:

1. **BYDAY returns wrong days** with timezone conversions
   ([GitHub #556](https://github.com/jkbrzt/rrule/issues/556))
2. **Invalid date output** when passing tzid
   ([GitHub #523](https://github.com/jkbrzt/rrule/issues/523))
3. **"Pseudo-UTC" dates** - appear as UTC but meant to be interpreted in TZID
   timezone
4. **TZID ignored** in some operations
   ([GitHub #364](https://github.com/jkbrzt/rrule/issues/364))

## The Solution: Post-Generation Correction

```text
1. Expand rrule period by ±1 day for BYDAY rules (catch cross-timezone occurrences)
2. Generate occurrences using UTC dtstart (no tzid)
3. Calculate day offset: blockTimezone.date() - UTC.date()
4. Shift all occurrences by negative of day offset
5. Filter by:
   a. Weekday in block's timezone matches BYDAY values
   b. Occurrence date falls within requested period
```

## Day Offset Calculation

```typescript
// Example: Block at Friday 08:00 KST = Thursday 23:00 UTC
const dtstartInBlockTz = DateUtil.tz(parentStart, timeZone); // Jan 16 (Fri in KST)
const dtstartInUTC = DateUtil.utc(parentStart); // Jan 15 (Thu in UTC)

// Use date string comparison to handle month boundaries correctly
// (e.g., Jan 31 UTC → Feb 1 KST gives +1, not -30)
const localDateStr = dtstartInBlockTz.format("YYYY-MM-DD");
const utcDateStr = dtstartInUTC.format("YYYY-MM-DD");
const dayOffset = DateUtil.utc(localDateStr).diff(
  DateUtil.utc(utcDateStr),
  "day"
); // 1

// Shift occurrences backward to compensate
// rrule generates: Fri 23:00 UTC (Sat in KST) - WRONG
// After shift: Thu 23:00 UTC (Fri in KST) - CORRECT
```

## BYDAY Regex (RFC 5545 Compliant)

```typescript
// Captures all valid BYDAY formats per RFC 5545:
// - Simple: MO, TU, WE, TH, FR, SA, SU
// - With ordinal: 1MO (first Monday), -1FR (last Friday), +2TU (2nd Tuesday)
const byDayMatch = rruleString.toUpperCase().match(/BYDAY=([A-Z0-9,+-]+)/);

// Strip numeric prefix to get weekday code
const dayCode = day.replace(/^[+-]?\d+/, ""); // "1MO" → "MO", "-1FR" → "FR"
```

## Key Points

1. **Don't trust library tzid options** - always verify with tests
2. **Month boundary edge case** - use date string comparison, not `.date()`
   difference
3. **Double filter safety** - filter at expansion AND at final output

---

## When to Use

- Expanding recurring events with `BYDAY` rules when the event's timezone
  differs from UTC (especially UTC+N timezones like KST, JST, IST where the date
  crosses midnight)
- Any rrule expansion where the `dtstart` in local time falls on a different UTC
  date
- Building analytics or calendar features that aggregate events by weekday in
  the user's timezone

## When NOT to Use

- Events in UTC timezone: no cross-midnight offset exists, so the standard rrule
  expansion works correctly without correction.
- Non-BYDAY rules (e.g., `FREQ=DAILY`, `BYMONTHDAY`): these do not have the
  weekday interpretation bug. The day offset correction is specific to BYDAY.
- If using a different rrule library: this workaround is specific to the
  `jkbrzt/rrule` JavaScript library. Other implementations (Python
  `dateutil.rrule`, etc.) may handle timezones correctly.

---

## References

- [rrule GitHub Repository](https://github.com/jkbrzt/rrule)
- [RFC 5545 - iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545)
- moba-nestjs timezone-byday-fix-summary.md
