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

# RRULE EXDATE Parsing with Timezone

## Problem

The `rrule` JavaScript library's `rrulestr()` function fails when:

1. EXDATE comes before RRULE in the recurrence array
2. EXDATE has a TZID parameter (timezone-aware exclusion dates)

**Symptom:** Instead of generating proper RRULE occurrences, it generates instances at the **current time**.

## Root Cause

Google Calendar stores recurrence as an array with mixed content:

```javascript
[
  "EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000",
  "RRULE:FREQ=WEEKLY;BYDAY=FR"
]
```

When `rrulestr()` tries to parse this:

- It expects RRULE first, EXDATE after
- It can't properly handle TZID parameter in EXDATE
- Falls back to generating occurrences at current timestamp

## Solution

Parse RRULE and EXDATE separately, then combine using `RRuleSet`:

```typescript
import { RRuleSet, rrulestr } from 'rrule';

// 1. Extract only RRULE lines (filter out EXDATE, RDATE)
const rruleLines = extractRRulesOnly(block.recurrence);
const rruleString = rruleLines.join('\n');

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
    .filter((line) => line.startsWith('RRULE:') || line.startsWith('RRULE;'))
    .map(sanitizeRRule);
}
```

### parseExdates

Parses EXDATE lines with proper timezone handling:

```typescript
export function parseExdates(recurrence: string[] | null, blockTimeZone: string): Date[] {
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

## References

- [rrule GitHub Issue #556](https://github.com/jkbrzt/rrule/issues/556) - BYDAY returns wrong days
- [rrule GitHub Issue #523](https://github.com/jkbrzt/rrule/issues/523) - Invalid date with tzid
- [rrule GitHub Issue #364](https://github.com/jkbrzt/rrule/issues/364) - TZID ignored
- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - iCalendar specification
