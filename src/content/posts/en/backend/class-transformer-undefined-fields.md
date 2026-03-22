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
expanded: true
---

I was building a sync-relevance guard that checked which DTO fields the client actually sent, so we could avoid unnecessary Google Calendar API calls. The logic was simple: iterate `Object.keys(dto.detail)` and see if any Google-relevant fields are present. It worked in unit tests with plain objects. Then I tested it with a real HTTP request, and every single field showed up as "present" — even fields the client never sent. The culprit was `class-transformer`'s `plainToInstance()` interacting with a TypeScript compiler change that happened in ES2022.

## The Problem

When TypeScript targets ES2022 or later, the `useDefineForClassFields` compiler option defaults to `true`. This changes how TypeScript compiles optional class properties — instead of leaving them off the instance, it defines them as own properties with `undefined` values. Here's the chain of events:

```text
tsconfig.json → target: ES2023
  → useDefineForClassFields defaults to true (ES2022+)
  → TypeScript compiles optional properties as class field definitions
  → new ReqBlockDetailDto() has ALL 8 fields as own properties (= undefined)
  → plainToInstance() preserves these own properties
  → Object.keys(dto.detail) returns ALL field names
  → hangoutLink, location, attendees detected as "present" even though undefined
```

The client sends `{ detail: { allDay: true, linkData: {...} } }` — only two fields. But `Object.keys(dto.detail)` returns all 8 field names including `hangoutLink`, `location`, and `attendees`, because they exist as own properties with `undefined` values on the class instance.

This is invisible in `tsconfig.json` because `useDefineForClassFields` isn't explicitly set — it's an implicit default tied to your target version. You can upgrade from ES2021 to ES2022 and break every `Object.keys()` check on class-transformer instances without touching a single line of application code.

## The Solution

The fix is to check `value !== undefined`, not key presence:

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

Note that `null` is intentionally **not** skipped. When a client sends `{ title: null }`, that means "clear this field" — it's a meaningful change that should be detected. The guard only filters out `undefined`, which is the phantom value created by class field definitions.

## Which Check Methods Are Safe?

Not all property-checking approaches are affected equally:

| Check Method                                            | Safe with class-transformer? | Notes                             |
| ------------------------------------------------------- | ---------------------------- | --------------------------------- |
| `Object.keys(obj)`                                      | No                           | Returns undefined fields          |
| `key in obj`                                            | No                           | Returns true for undefined fields |
| `obj.hasOwnProperty(key)`                               | No                           | Returns true for undefined fields |
| `obj[key] !== undefined`                                | Yes                          | Correctly filters phantom fields  |
| `Object.entries(obj).filter(([,v]) => v !== undefined)` | Yes                          | Correct                           |

Any code that relies on key presence (`Object.keys()`, `in` operator, `hasOwnProperty()`) will produce false positives. Only value-checking approaches (`!== undefined`) correctly distinguish between "client sent this field" and "TypeScript defined this field as `undefined`."

## What's NOT Affected

Functions that already check values rather than key presence are safe. If your code does `dto.itemStatus === undefined` to decide whether a field was sent, that comparison works correctly — it's testing the value, not the key's existence.

Plain objects created with `{}` literals don't have this issue either. The bug only manifests when `plainToInstance()` creates class instances, because the class constructor is what defines all fields as own properties.

And if your TypeScript target is below ES2022, `useDefineForClassFields` defaults to `false`, so optional properties are never defined as own properties in the first place.

## Takeaway

When working with `class-transformer` on ES2022+ TypeScript targets, never rely on `Object.keys()` or `in` to detect which fields the client sent. Always check `value !== undefined`. This bug is particularly dangerous because it's triggered by an implicit compiler default — upgrading your TypeScript target from ES2021 to ES2022 silently changes class field behavior, and nothing in your code or config explicitly tells you it happened.

## References

- [class-transformer GitHub Repository](https://github.com/typestack/class-transformer)
- [class-transformer Basic Usage — plainToInstance](https://github.com/typestack/class-transformer/blob/develop/docs/pages/02-basic-usage.md)
