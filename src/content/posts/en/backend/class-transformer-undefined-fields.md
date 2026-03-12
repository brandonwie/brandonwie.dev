---
title: class-transformer Undefined Own-Property Bug
description: When `plainToInstance()` creates class instances under ES2022+ TypeScript
date: 2026-02-23T00:00:00.000Z
updated: 2026-03-03T00:00:00.000Z
tags:
  - backend
  - typescript
  - class-transformer
  - gotcha
category: backend
draft: false
lang: en
references:
  - url: 'https://github.com/typestack/class-transformer'
    title: class-transformer GitHub Repository
    type: official
  - url: >-
      https://github.com/typestack/class-transformer/blob/develop/docs/pages/02-basic-usage.md
    title: class-transformer Basic Usage — plainToInstance
    type: official
source_content_hash: ecdbb162c694b696a0779cc8d519af1e095e357898cd9f25829376fe369322f7
---

targets, ALL optional class fields become own properties with `undefined`
values. `Object.keys()` then returns field names that were never sent by the
client.

## The Problem

```text
tsconfig.json → target: ES2023
  → useDefineForClassFields defaults to true (ES2022+)
  → TypeScript compiles optional properties as class field definitions
  → new ReqBlockDetailDto() has ALL 8 fields as own properties (= undefined)
  → plainToInstance() preserves these own properties
  → Object.keys(dto.detail) returns ALL field names
  → hangoutLink, location, attendees detected as "present" even though undefined
```

Client sends `{ detail: { allDay: true, linkData: {...} } }` but
`Object.keys(dto.detail)` returns all 8 fields including `hangoutLink`,
`location`, and `attendees`.

## The Solution

Check `value !== undefined`, not just key presence:

```typescript
// Before (broken with class-transformer instances)
for (const key of Object.keys(detailRecord)) {
  if (GOOGLE_RELEVANT_DETAIL_KEYS.has(key)) {
    return true; // False positive! Key exists but value is undefined
  }
}

// After (correct — skips undefined class-field artifacts)
for (const key of Object.keys(detailRecord)) {
  if (GOOGLE_RELEVANT_DETAIL_KEYS.has(key) && detailRecord[key] !== undefined) {
    return true;
  }
}
```

## Key Points

- `useDefineForClassFields: true` is the default for `target >= ES2022` in
  TypeScript — it's NOT explicitly set in tsconfig, making it an invisible
  footgun
- `null` is intentionally NOT skipped: `{ title: null }` means "clear this
  field" which IS a meaningful change
- Functions that check value (e.g., `dto.itemStatus === undefined`) are
  unaffected — they already test the value, not key presence
- This affects ANY code that uses `Object.keys()`, `Object.entries()`,
  `for...in`, or `hasOwnProperty()` on class-transformer instances
- The bug only manifests with `plainToInstance()` — plain objects created with
  `{}` literals don't have this issue

## Decision Matrix

| Check Method                                            | Safe with class-transformer? | Notes                             |
| ------------------------------------------------------- | ---------------------------- | --------------------------------- |
| `Object.keys(obj)`                                      | No                           | Returns undefined fields          |
| `key in obj`                                            | No                           | Returns true for undefined fields |
| `obj.hasOwnProperty(key)`                               | No                           | Returns true for undefined fields |
| `obj[key] !== undefined`                                | Yes                          | Correctly filters phantom fields  |
| `Object.entries(obj).filter(([,v]) => v !== undefined)` | Yes                          | Correct                           |

## When to Use

- Any code that inspects which DTO fields were sent by the client
- Change detection logic comparing "what changed" in an update payload
- Middleware or utilities that process class-transformer output

## When NOT to Use

- Working with plain objects (not class instances)
- TypeScript targets below ES2022 (class fields not defined as own properties)
- Code that already checks values rather than key presence
