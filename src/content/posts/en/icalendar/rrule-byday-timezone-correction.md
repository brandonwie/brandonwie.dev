---
title: rrule BYDAY Timezone Correction
description: "The rrule JavaScript library interprets `BYDAY` weekday names in UTC, not the"
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
  - url: "https://github.com/jkbrzt/rrule/issues/556"
    title: "556"
    type: official
  - url: "https://github.com/jkbrzt/rrule/issues/523"
    title: "523"
    type: official
  - url: "https://github.com/jkbrzt/rrule/issues/364"
    title: "364"
    type: official
  - url: "https://github.com/jkbrzt/rrule"
    title: rrule
    type: official
  - url: "https://datatracker.ietf.org/doc/html/rfc5545"
    title: rfc5545
    type: verified
---

I had a recurring event set to every Friday at 08:00 KST. The rrule library
generated occurrences on Saturday. Not off by a few hours -- off by an entire
day. The problem is that the `rrule` JavaScript library interprets `BYDAY`
weekday names in UTC, not in the event's timezone. When your timezone crosses
midnight relative to UTC, the library picks the wrong day.

## The Core Problem

Here is what happens when a Friday 08:00 KST event gets expanded:

| Block Setup                      | rrule Interpretation           | Result                                              |
| -------------------------------- | ------------------------------ | --------------------------------------------------- |
| Friday 08:00 KST (Thu 23:00 UTC) | `BYDAY=FR` = Friday in **UTC** | Generates Fri 23:00 UTC = **Sat** 08:00 KST (WRONG) |
| Expected                         | `BYDAY=FR` = Friday in **KST** | Should generate Thu 23:00 UTC = **Fri** 08:00 KST   |

The rrule library sees "Friday" and generates the occurrence on Friday in UTC.
But Friday 23:00 UTC is Saturday 08:00 in Korea. The event that should appear
on Friday shows up on Saturday instead.

## Why the Library's tzid Option Does Not Help

The rrule library accepts a `tzid` parameter. You would expect this to solve
the problem. It does not. The library has multiple documented issues with
timezone handling:

1. **BYDAY returns wrong days** with timezone conversions
   ([GitHub #556](https://github.com/jkbrzt/rrule/issues/556))
2. **Invalid date output** when passing tzid
   ([GitHub #523](https://github.com/jkbrzt/rrule/issues/523))
3. **"Pseudo-UTC" dates** -- the library returns dates that look like UTC (ISO
   string with Z suffix) but are meant to be interpreted in the TZID timezone
4. **TZID ignored** in some operations
   ([GitHub #364](https://github.com/jkbrzt/rrule/issues/364))

I spent time trying to make `tzid` work before discovering these issues. The API
surface suggests it should work. It does not. The fix has to happen after
generation, not during.

## The Solution: Post-Generation Correction

Instead of fighting the library's broken timezone support, I let it generate
occurrences in UTC and then correct them:

```text
1. Expand rrule period by +/-1 day for BYDAY rules (catch cross-timezone occurrences)
2. Generate occurrences using UTC dtstart (no tzid)
3. Calculate day offset: blockTimezone.date() - UTC.date()
4. Shift all occurrences by negative of day offset
5. Filter by:
   a. Weekday in block's timezone matches BYDAY values
   b. Occurrence date falls within requested period
```

The period expansion in step 1 is a safety margin. Events near midnight
boundaries can fall outside the query window after correction, so asking for one
extra day on each side prevents silent data loss.

## Day Offset Calculation

This is the critical piece. The day offset tells you how many days the local
date differs from the UTC date:

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
  "day",
); // 1

// Shift occurrences backward to compensate
// rrule generates: Fri 23:00 UTC (Sat in KST) - WRONG
// After shift: Thu 23:00 UTC (Fri in KST) - CORRECT
```

## The Month Boundary Trap

My first attempt calculated the day offset by subtracting `.date()` values
directly. This works most of the time. Then January 31 UTC became February 1
KST, and the offset came back as `-30` instead of `+1`.

The fix is to compare formatted date strings instead of numeric day-of-month
values. Convert both dates to `YYYY-MM-DD` strings, parse them back as UTC
dates, and diff them. This correctly handles month and year boundaries.

## BYDAY Regex (RFC 5545 Compliant)

To detect which rules need correction, I parse the BYDAY values from the rrule
string:

```typescript
// Captures all valid BYDAY formats per RFC 5545:
// - Simple: MO, TU, WE, TH, FR, SA, SU
// - With ordinal: 1MO (first Monday), -1FR (last Friday), +2TU (2nd Tuesday)
const byDayMatch = rruleString.toUpperCase().match(/BYDAY=([A-Z0-9,+-]+)/);

// Strip numeric prefix to get weekday code
const dayCode = day.replace(/^[+-]?\d+/, ""); // "1MO" → "MO", "-1FR" → "FR"
```

Only rules with `BYDAY` need correction. `FREQ=DAILY` and `BYMONTHDAY` rules
do not have the weekday interpretation bug.

## When to Use This Correction

- Expanding recurring events with `BYDAY` rules when the event's timezone
  differs from UTC (especially UTC+N timezones like KST, JST, IST where the
  date crosses midnight)
- Any rrule expansion where the `dtstart` in local time falls on a different UTC
  date
- Building analytics or calendar features that aggregate events by weekday in
  the user's timezone

## When NOT to Use This Correction

- **Events in UTC timezone** -- No cross-midnight offset exists, so the standard
  rrule expansion works correctly.
- **Non-BYDAY rules** (e.g., `FREQ=DAILY`, `BYMONTHDAY`) -- These do not have
  the weekday interpretation bug.
- **Different rrule library** -- This workaround is specific to the
  `jkbrzt/rrule` JavaScript library. Python's `dateutil.rrule` and other
  implementations may handle timezones correctly.

## Practical Takeaway

Do not trust the rrule library's `tzid` option for BYDAY rules. Generate
occurrences in pure UTC, calculate the day offset between UTC and the event's
timezone using date string comparison (not numeric subtraction), shift the
occurrences, and double-filter by weekday match and date range. The month
boundary trap is the most dangerous edge case -- always use string-based date
comparison for the offset calculation.

## References

- [rrule GitHub Repository](https://github.com/jkbrzt/rrule)
- [RFC 5545 - iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545)
