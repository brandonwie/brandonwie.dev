---
title: External Calendar Data Normalization
description: 'External calendar data (Apple Calendar, GNOME Evolution, travel apps) often'
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - google-calendar
  - rrule
  - parsing
category: icalendar
draft: false
lang: en
references:
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545'
    title: RFC 5545 — iCalendar Specification
    type: official
---

contains non-standard formats that break parsing. Implement normalization layers
to handle these edge cases.

## Common Issues

| Error | Source | Impact |
| ----- | ------ | ------ |
| `Invalid time zone: GMT+XX:XX` | Apple Calendar, TripIt, airline apps | Fatal |
| `unsupported RRULE parm: X-EVOLUTION-ENDDATE` | GNOME Evolution (Linux) | Warning |
| `Unsupported RFC prop EXDATE` | Google Calendar with deleted occurrences | Fatal |

## Normalization Utilities

### Timezone Normalization

Convert GMT offsets to IANA timezone names:

```typescript
const OFFSET_TO_IANA: Record<string, string> = {
  '+00:00': 'Etc/UTC',
  '+01:00': 'Europe/Paris',
  '+02:00': 'Europe/Helsinki',
  '+09:00': 'Asia/Tokyo',
  '-05:00': 'America/New_York',
  '-08:00': 'America/Los_Angeles',
  // ... 38 offsets covering all UTC variations
};

function normalizeTimezone(tz: string): string {
  // Handle GMT+XX:XX format from Apple Calendar
  const gmtMatch = tz.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (gmtMatch) {
    const offset = `${gmtMatch[1]}${gmtMatch[2]}:${gmtMatch[3]}`;
    return OFFSET_TO_IANA[offset] ?? 'Etc/UTC';
  }
  return tz;
}
```

### RRULE Sanitization

Strip proprietary extensions:

```typescript
function sanitizeRRule(rrule: string): string {
  // Remove GNOME Evolution proprietary parameter
  return rrule.replace(/;X-EVOLUTION-ENDDATE=\d{8}T\d{6}Z/g, '');
}
```

### EXDATE Extraction

rrule.js `RRule.parseString()` only handles RRULE lines. Strip EXDATE before
parsing:

```typescript
function extractRRulesOnly(recurrenceArray: string[]): string[] {
  // Filter out EXDATE lines, keep only RRULE lines
  return recurrenceArray.filter((line) => line.startsWith('RRULE:'));
}

// Usage - 6+ locations in codebase
const rruleLines = extractRRulesOnly(block.recurrence);
const rruleSet = rrulestr(rruleLines.join('\n'));
```

## Application Points

Apply normalization at every RRULE parsing location:

| File | Function | Normalization |
| ---- | -------- | ------------- |
| `calendar-normalization.util.ts` | Utility functions | All three |
| `block-recurrence.service.ts` | 6 locations | `extractRRulesOnly` |
| `block-calendar.service.ts` | 1 location | `extractRRulesOnly` |
| `functions.ts` | `getUntil()` | `extractRRulesOnly` |
| `block-query.util.ts` | Uses `rrulestr()` | `sanitizeRRule` only |

## Library Limitations

### rrule.js

- `RRule.parseString()` - Strict RFC 5545 for RRULE lines only
- `rrulestr()` - Full iCal support but different API

Choose based on use case:

```typescript
// Simple RRULE parsing
const rule = RRule.parseString('FREQ=WEEKLY;BYDAY=MO');

// Full RFC 5545 with EXDATE, RDATE
const rruleSet = rrulestr(
  'RRULE:FREQ=WEEKLY;BYDAY=MO\nEXDATE:20240101T090000Z'
);
```

## Data Flow

```text
Google Calendar API → Our Database → RRULE Parsing

Key insight: EXDATE comes FROM Google API.
We store what Google provides, not what we generate.
Google is the source of truth for exception dates.
```

## Key Lessons

1. **External calendar data is messy** - Apple, GNOME, travel apps all differ
2. **Normalize at the boundary** - Clean data before it reaches core logic
3. **Preserve original data** - Store what Google provides, normalize for
   calculation
4. **Centralize utilities** - One place for all normalization functions
5. **Test with real data** - Use actual problematic events in unit tests
