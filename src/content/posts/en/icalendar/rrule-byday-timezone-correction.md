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
expanded: true
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

A user reported that their Friday recurring event was showing up on Saturday. The event was set for Friday 08:00 KST, which is Thursday 23:00 UTC. When the rrule library expanded the `BYDAY=FR` rule, it interpreted "Friday" as Friday in UTC -- generating occurrences at Friday 23:00 UTC, which is Saturday 08:00 KST. The user saw their Friday meeting on Saturday. That is how I learned the rrule JavaScript library does not handle timezones the way its API suggests.

---

## The Problem

The core issue is a mismatch between what the rrule library promises and what it delivers. When you have an event in a timezone ahead of UTC, the date can cross midnight.

| Block Setup                      | rrule Interpretation           | Result                                              |
| -------------------------------- | ------------------------------ | --------------------------------------------------- |
| Friday 08:00 KST (Thu 23:00 UTC) | `BYDAY=FR` = Friday in **UTC** | Generates Fri 23:00 UTC = **Sat** 08:00 KST (WRONG) |
| Expected                         | `BYDAY=FR` = Friday in **KST** | Should generate Thu 23:00 UTC = **Fri** 08:00 KST   |

The library applies the BYDAY constraint in UTC. For users in UTC+N timezones (KST, JST, IST), any event whose local time maps to the previous UTC date gets shifted forward by a day.

---

## Why the "Obvious" Fix Does Not Work

The rrule library accepts a `tzid` parameter. That looks like the solution -- pass `tzid: "Asia/Seoul"` and let the library handle it. I tried that first.

It does not work. The library has multiple documented issues with timezone handling:

1. **BYDAY returns wrong days** with timezone conversions ([GitHub #556](https://github.com/jkbrzt/rrule/issues/556))
2. **Invalid date output** when passing tzid ([GitHub #523](https://github.com/jkbrzt/rrule/issues/523))
3. **"Pseudo-UTC" dates** -- the library returns dates that look like UTC (ISO string with `Z` suffix) but are meant to be interpreted in the TZID timezone
4. **TZID ignored** in some operations ([GitHub #364](https://github.com/jkbrzt/rrule/issues/364))

The "pseudo-UTC" behavior is especially treacherous. During debugging, the output looks correct because the timestamps have `Z` suffixes. You do not notice the problem until you compare against what the actual local time should be.

---

## Four Obstacles I Hit

**The `tzid` option appeared to be the fix.** The API surface suggests timezone-aware expansion is built in. Multiple GitHub issues confirmed it is broken, but that was not obvious from reading the docs alone.

**"Pseudo-UTC" dates mislead debugging.** The library returns dates that look like UTC but are not. This made it seem like the output was correct until I compared against the actual local time.

**Month boundary arithmetic trap.** My first attempt at calculating the day offset used `.date()` difference -- for example, Feb 1 minus Jan 31 gives -30, not +1. I had to switch to date-string-based comparison to handle month boundaries correctly.

**Cross-timezone occurrences fall outside the query period.** Events near midnight boundaries were silently excluded because the query window was too tight. I needed to expand the rrule period by +/-1 day as a safety margin.

---

## The Solution: Post-Generation Correction

Since the library cannot handle timezones correctly during generation, the workaround is to let it generate in UTC and then correct the results afterward.

```text
1. Expand rrule period by +/-1 day for BYDAY rules (catch cross-timezone occurrences)
2. Generate occurrences using UTC dtstart (no tzid)
3. Calculate day offset: blockTimezone.date() - UTC.date()
4. Shift all occurrences by negative of day offset
5. Filter by:
   a. Weekday in block's timezone matches BYDAY values
   b. Occurrence date falls within requested period
```

The expanded period in step 1 prevents the silent exclusion problem. The day offset in steps 3-4 corrects the weekday shift. The double filter in step 5 ensures only valid occurrences survive.

---

## Day Offset Calculation

This is the core of the correction. The offset tells you how many days the local date differs from the UTC date for the event's start time.

```typescript
// Example: Block at Friday 08:00 KST = Thursday 23:00 UTC
const dtstartInBlockTz = DateUtil.tz(parentStart, timeZone); // Jan 16 (Fri in KST)
const dtstartInUTC = DateUtil.utc(parentStart); // Jan 15 (Thu in UTC)

// Use date string comparison to handle month boundaries correctly
// (e.g., Jan 31 UTC -> Feb 1 KST gives +1, not -30)
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

The date-string comparison is critical. A naive approach using `.date()` -- the day-of-month integer -- breaks at month boundaries. January 31 UTC becomes February 1 KST, and `1 - 31 = -30` instead of the correct `+1`. By converting to full date strings first and then diffing, we get the correct offset regardless of which month we are in.

---

## Extracting BYDAY Values

To verify that corrected occurrences land on the right weekday, you need to parse the BYDAY values from the rrule string. RFC 5545 allows several formats.

```typescript
// Captures all valid BYDAY formats per RFC 5545:
// - Simple: MO, TU, WE, TH, FR, SA, SU
// - With ordinal: 1MO (first Monday), -1FR (last Friday), +2TU (2nd Tuesday)
const byDayMatch = rruleString.toUpperCase().match(/BYDAY=([A-Z0-9,+-]+)/);

// Strip numeric prefix to get weekday code
const dayCode = day.replace(/^[+-]?\d+/, ""); // "1MO" -> "MO", "-1FR" -> "FR"
```

The regex handles both simple weekday codes (`FR`) and ordinal prefixes (`1MO`, `-1FR`, `+2TU`). After stripping the ordinal, you get a clean two-letter day code to compare against the corrected occurrence's weekday.

---

## Takeaway

The rrule JavaScript library's `tzid` option is broken for BYDAY rules. If you are expanding recurring events where the event's timezone differs from UTC -- particularly for UTC+N timezones like KST, JST, or IST where the date crosses midnight -- you need post-generation correction.

Three rules I follow now:

1. **Do not trust library timezone options** -- verify with tests that cover cross-midnight scenarios
2. **Use date string comparison for month boundaries** -- never diff `.date()` integers across months
3. **Double filter for safety** -- filter at expansion time (wider window) AND at final output (exact match)

This workaround is specific to the `jkbrzt/rrule` JavaScript library. Python's `dateutil.rrule` and other implementations may handle timezones correctly. And for non-BYDAY rules like `FREQ=DAILY` or `BYMONTHDAY`, the standard rrule expansion works without correction because there is no weekday interpretation involved.

---

## References

- [rrule GitHub Repository](https://github.com/jkbrzt/rrule)
- [RFC 5545 - iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545)
