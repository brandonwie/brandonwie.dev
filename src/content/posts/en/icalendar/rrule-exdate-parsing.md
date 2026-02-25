---
title: RRULE EXDATE Parsing with Timezone
description: 'The `rrule` JavaScript library''s `rrulestr()` function fails when:'
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
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
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545'
    title: RFC 5545 - iCalendar Specification
    type: official
---

1. EXDATE comes before RRULE in the recurrence array
2. EXDATE has a TZID parameter (timezone-aware exclusion dates)

**Symptom:** Instead of generating proper RRULE occurrences, it generates
instances at the **current time**.

---

## Difficulties Encountered

- **Silent failure mode:** The library does not throw an error when EXDATE
  parsing fails. Instead, it silently generates occurrences at the current
  timestamp, which looks like valid output until you inspect the dates closely.
- **Order sensitivity was not documented:** Nothing in the rrule docs mentions
  that RRULE must come before EXDATE in the input string. Discovered only by
  trial and error after the Google Calendar API returned EXDATE first.
- **`forceset: true` seemed like the answer:** The rrule API provides `forceset`
  specifically for handling RRULE+EXDATE combinations, but it still cannot parse
  TZID in EXDATE lines. This dead end consumed significant debugging time.
- **Multiple EXDATE formats:** Google Calendar uses at least four EXDATE formats
  (UTC, date-only, TZID with single date, TZID with comma-separated dates). Each
  required separate parsing logic.

---

## Root Cause

Google Calendar stores recurrence as an array with mixed content:

```javascript
[
  "EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000",
  "RRULE:FREQ=WEEKLY;BYDAY=FR"
];
```

When `rrulestr()` tries to parse this:

- It expects RRULE first, EXDATE after
- It can't properly handle TZID parameter in EXDATE
- Falls back to generating occurrences at current timestamp

## The Solution

Parse RRULE and EXDATE separately, then combine using `RRuleSet`:

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

## Key Functions

### extractRRulesOnly

Filters recurrence array to only include RRULE lines:

```typescript
export function extractRRulesOnly(recurrence: string[] | null): string[] {
  if (!recurrence || recurrence.length === 0) return [];

  return recurrence
    .filter((line) => line.startsWith("RRULE:") || line.startsWith("RRULE;"))
    .map(sanitizeRRule);
}
```

### parseExdates

Parses EXDATE lines with proper timezone handling:

```typescript
export function parseExdates(
  recurrence: string[] | null,
  blockTimeZone: string
): Date[] {
  // Supported formats:
  // - EXDATE:20251219T090000Z (UTC)
  // - EXDATE;VALUE=DATE:20251219 (date only)
  // - EXDATE;TZID=Asia/Seoul:20251219T180000 (with timezone)
  // - EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000 (multiple)
  // Returns array of Date objects in UTC
}
```

## Why Not Use rrulestr with forceset

You might think `rrulestr(fullString, { forceset: true })` would work, but:

1. It still fails to parse TZID in EXDATE
2. Order of lines in the string matters
3. The library has documented issues with timezone handling

---

## When to Use

- Parsing Google Calendar recurring events that include EXDATE with TZID
  parameters
- Any scenario where `rrulestr()` produces occurrences at the current timestamp
  instead of expected dates
- Building calendar integrations that must handle all four EXDATE formats (UTC,
  date-only, TZID single, TZID multiple)

## When NOT to Use

- If your recurrence data never includes EXDATE lines: standard `rrulestr()`
  works fine for RRULE-only input.
- If EXDATE lines are always in UTC format (no TZID): the library handles
  `EXDATE:...Z` correctly when RRULE comes first.
- If using a different rrule library: this workaround is specific to the
  `jkbrzt/rrule` JavaScript library. Python's `dateutil` and other
  implementations may handle EXDATE+TZID correctly.
- For RDATE handling: this solution filters out RDATE lines. If you need RDATE
  support, additional parsing is required.

---

## References

- [rrule GitHub Issue #556](https://github.com/jkbrzt/rrule/issues/556) - BYDAY
  returns wrong days
- [rrule GitHub Issue #523](https://github.com/jkbrzt/rrule/issues/523) -
  Invalid date with tzid
- [rrule GitHub Issue #364](https://github.com/jkbrzt/rrule/issues/364) - TZID
  ignored
- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - iCalendar
  specification
