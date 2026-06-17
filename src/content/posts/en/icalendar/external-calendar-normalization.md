---
title: External Calendar Data Normalization
description: 'External calendar data (Apple Calendar, GNOME Evolution, travel apps) often'
date: 2026-01-26T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - google-calendar
  - rrule
  - parsing
category: icalendar
draft: false
lang: en
expanded: true
references:
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545'
    title: RFC 5545 — iCalendar Specification
    type: official
source_content_hash: db2cefe453f9d6969c3c97d26d0453a435fab4de38cb87b8d2a66c71f0167a92
---

The first time I saw `Invalid time zone: GMT+09:00` crash our calendar sync, I assumed it was a one-off data corruption issue. Then I saw `unsupported RRULE parm: X-EVOLUTION-ENDDATE` from a Linux user. Then `Unsupported RFC prop EXDATE` from a Google Calendar event with deleted occurrences. Three different parsing failures, three different external calendar clients, all hitting the same rrule.js parser that expected clean RFC 5545 input.

The real world does not produce clean RFC 5545 input. External calendar clients -- Apple Calendar, GNOME Evolution, TripIt, airline booking apps -- each have their own interpretation of the iCalendar standard. If your backend parses recurrence rules, you need a normalization layer between the raw data and your parser.

---

## The Three Failure Modes

Each failure comes from a different source and has a different severity:

| Error                                         | Source                                   | Impact  |
| --------------------------------------------- | ---------------------------------------- | ------- |
| `Invalid time zone: GMT+XX:XX`                | Apple Calendar, TripIt, airline apps     | Fatal   |
| `unsupported RRULE parm: X-EVOLUTION-ENDDATE` | GNOME Evolution (Linux)                  | Warning |
| `Unsupported RFC prop EXDATE`                 | Google Calendar with deleted occurrences | Fatal   |

"Fatal" means parsing fails entirely -- no occurrences generated, the event disappears from the user's calendar. "Warning" means the parser complains but might still produce output, depending on the library version and configuration.

These are not exotic edge cases. Apple Calendar is the default on every iPhone. GNOME Evolution ships with most Linux distributions. And EXDATE lines come from Google Calendar itself whenever a user deletes a single occurrence from a recurring series.

---

## Timezone Normalization

Apple Calendar and travel apps often use `GMT+XX:XX` format instead of IANA timezone names. The rrule library does not recognize this format.

The fix is a lookup table that maps GMT offsets to IANA names:

```typescript
const OFFSET_TO_IANA: Record<string, string> = {
  "+00:00": "Etc/UTC",
  "+01:00": "Europe/Paris",
  "+02:00": "Europe/Helsinki",
  "+09:00": "Asia/Tokyo",
  "-05:00": "America/New_York",
  "-08:00": "America/Los_Angeles"
  // ... 38 offsets covering all UTC variations
};

function normalizeTimezone(tz: string): string {
  // Handle GMT+XX:XX format from Apple Calendar
  const gmtMatch = tz.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (gmtMatch) {
    const offset = `${gmtMatch[1]}${gmtMatch[2]}:${gmtMatch[3]}`;
    return OFFSET_TO_IANA[offset] ?? "Etc/UTC";
  }
  return tz;
}
```

One subtlety: a single GMT offset can map to multiple IANA timezones. `GMT+09:00` could be `Asia/Tokyo`, `Asia/Seoul`, or `Asia/Jayapura`. The mapping table picks a representative timezone for each offset. For recurrence rule expansion, the offset is what matters -- the city name distinction only affects DST transitions, which GMT offsets do not observe anyway.

The fallback to `Etc/UTC` when an offset is not in the table prevents a crash. It produces incorrect results for that event, but incorrect is better than a fatal error that blocks the entire sync.

---

## RRULE Sanitization

GNOME Evolution, the calendar app that ships with many Linux distributions, appends a proprietary `X-EVOLUTION-ENDDATE` parameter to RRULE lines. This is not part of RFC 5545, and the rrule library rejects it.

The fix is a regex that strips the extension before parsing:

```typescript
function sanitizeRRule(rrule: string): string {
  // Remove GNOME Evolution proprietary parameter
  return rrule.replace(/;X-EVOLUTION-ENDDATE=\d{8}T\d{6}Z/g, "");
}
```

This is safe because `X-EVOLUTION-ENDDATE` is redundant with the standard `UNTIL` parameter that Evolution also includes. Removing it does not change the recurrence semantics.

---

## EXDATE Extraction

The rrule library's `RRule.parseString()` only handles RRULE lines. If you feed it a string that includes EXDATE lines, it either fails or produces incorrect output (as covered in detail in the [EXDATE parsing post](/posts/rrule-exdate-parsing)).

The solution is to filter before parsing:

```typescript
function extractRRulesOnly(recurrenceArray: string[]): string[] {
  // Filter out EXDATE lines, keep only RRULE lines
  return recurrenceArray.filter((line) => line.startsWith("RRULE:"));
}

// Usage - 6+ locations in codebase
const rruleLines = extractRRulesOnly(block.recurrence);
const rruleSet = rrulestr(rruleLines.join("\n"));
```

This function appears in six or more locations across the codebase. Every place that calls `rrulestr()` or `RRule.parseString()` needs this filter. Missing even one location means a user with deleted recurring event occurrences will hit a parsing failure.

---

## Where to Apply Normalization

The normalization functions need to be applied at every point where RRULE data enters the parsing pipeline:

| File                             | Function          | Normalization        |
| -------------------------------- | ----------------- | -------------------- |
| `calendar-normalization.util.ts` | Utility functions | All three            |
| `block-recurrence.service.ts`    | 6 locations       | `extractRRulesOnly`  |
| `block-calendar.service.ts`      | 1 location        | `extractRRulesOnly`  |
| `functions.ts`                   | `getUntil()`      | `extractRRulesOnly`  |
| `block-query.util.ts`            | Uses `rrulestr()` | `sanitizeRRule` only |

The key principle: normalize at the boundary, not inside the core logic. The utility functions live in one file (`calendar-normalization.util.ts`), and every call site imports from there. When a new external calendar format surfaces, you update one file.

---

## Choosing the Right Parser

The rrule library offers two parsing APIs with different capabilities:

```typescript
// Simple RRULE parsing
const rule = RRule.parseString("FREQ=WEEKLY;BYDAY=MO");

// Full RFC 5545 with EXDATE, RDATE
const rruleSet = rrulestr(
  "RRULE:FREQ=WEEKLY;BYDAY=MO\nEXDATE:20240101T090000Z"
);
```

`RRule.parseString()` is strict and handles only RRULE lines. `rrulestr()` supports the full iCal format including EXDATE and RDATE, but it has the timezone issues described above. Choose based on whether you need EXDATE support -- and if you do, use the separate-parsing approach with `RRuleSet`.

---

## The Data Flow to Keep in Mind

```text
Google Calendar API -> Our Database -> RRULE Parsing
```

A critical insight: EXDATE comes from Google's API. We store what Google provides, not what we generate. Google is the source of truth for exception dates. Our job is to parse what they give us without breaking, not to regenerate or modify it.

This means the normalization layer must be defensive. New external calendar formats will appear without warning as users subscribe to calendars from apps you have never heard of. The normalization code should handle unknown formats gracefully -- log a warning, fall back to a safe default, but never crash the sync.

---

## Takeaway

External calendar data is messy, and it will always be messy. Apple, GNOME, travel apps, and even Google itself produce data that deviates from what the rrule library expects. The solution is not to find a better parser -- it is to normalize the data before it reaches any parser.

Five principles that held up in production:

1. **External calendar data is messy** -- assume every client has its own quirks
2. **Normalize at the boundary** -- clean data before it reaches core logic
3. **Preserve original data** -- store what Google provides, normalize only for calculation
4. **Centralize utilities** -- one file for all normalization functions, imported everywhere
5. **Test with real data** -- use actual problematic events from production in unit tests

Every time a new parsing failure appears in your error logs, it is telling you about an external calendar client you had not accounted for. Add its format to your normalization layer, add a test case with the real data that triggered it, and move on. The normalization layer grows over time, and that is by design.

---

## References

- [RFC 5545 - iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545)
