---
title: TypeScript Type Narrowing Over Assertions
description: Prefer type narrowing over non-null assertions (`!`) and forced casting
date: 2026-02-05T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - typescript
  - best-practices
category: backend
draft: false
lang: en
references:
  - url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html'
    title: TypeScript Handbook - Narrowing
    type: official
source_content_hash: 5fce5f85ff152d1975ef8ed1d86500e0ff70659faaf99b5a351f662ae33376d5
expanded: true
---

I was reviewing a PR where a colleague used `block.gcalId!` — the non-null assertion operator — with a comment: "guaranteed non-null by DB query." The TypeScript compiler was happy. The code looked clean. Then I checked the DB query and realized it had recently been refactored, and the non-null guarantee no longer held. That `!` was silently hiding a potential runtime crash.

Non-null assertions (`!`) and forced casting (`as Type`) tell TypeScript "trust me, I know better." They suppress type errors without providing any runtime safety. The alternative — type narrowing — gives you both compile-time safety and runtime protection with minimal extra code.

## The Problem

Non-null assertions bypass TypeScript's type checking entirely:

```typescript
// ❌ BAD: Assumes gcalId exists without runtime check
function processBlock(block: Block) {
  console.log(block.gcalId!.length); // Runtime error if null
}
```

The `!` operator makes the compiler stop complaining, but it doesn't make the value non-null. If `gcalId` is ever `null` or `undefined` at runtime, you get an uncatchable `TypeError` with no useful error message.

The false sense of safety is the real danger. Comments like "guaranteed non-null by DB query" or "always set by middleware" are promises that TypeScript can't verify. DB queries change. Middleware gets refactored. Edge cases appear during migrations or partial data loads. The `!` operator silently passes these through until they crash in production.

## The Solution

Extract to a local variable and use a guard clause. TypeScript's control flow analysis narrows the type automatically:

```typescript
// ✅ GOOD: Runtime check with type narrowing
function processBlock(block: Block) {
  const { gcalId } = block;
  if (!gcalId) return; // or throw, or continue

  console.log(gcalId.length); // TypeScript knows gcalId is string
}
```

After the guard clause, TypeScript knows `gcalId` is non-null in the rest of the function. No assertion needed, and you get runtime protection against the edge cases that comments can't prevent.

## Three Narrowing Patterns

### 1. Early Return / Continue

The simplest and most common pattern. In loops, use `continue` to skip null entries; in functions, use early `return`:

```typescript
for (const block of blocks) {
  const { gcalId } = block;
  if (!gcalId) continue;

  // gcalId is guaranteed non-null here
  results.push(gcalId);
}
```

### 2. Type Guard Function

When you need to narrow a complex type across multiple call sites, extract the check into a reusable type guard:

```typescript
type BlockWithCalendar = Block & { calendar: Calendar };

function hasCalendar(block: Block): block is BlockWithCalendar {
  return block.calendar !== null;
}

// Usage
if (hasCalendar(block)) {
  console.log(block.calendar.id); // Safe
}
```

### 3. Intersection Type After Validation

At validation boundaries, throw on invalid data and return the narrowed type:

```typescript
function validateBlock(block: Block): BlockWithCalendar {
  if (!block.calendar) {
    throw new BlockBadRequestException("Calendar is required");
  }
  return block as BlockWithCalendar; // Safe: validated above
}
```

Note that `as Type` after explicit validation is fine — you've just verified the invariant. The problem is `as Type` without validation.

## Real-World Example

Here's a before/after from a stale block cleanup utility. The original code relied on a non-null assertion with a comment:

```typescript
// Before (risky):
export function identifyStaleBlockIds(
  existingBlocks: StaleBlockCandidate[],
  googleEventGcalIds: Set<string>
): number[] {
  const staleBlockIds: number[] = [];
  for (const block of existingBlocks) {
    // NOTE: gcalId is guaranteed non-null by DB query
    if (!googleEventGcalIds.has(block.gcalId!)) {
      staleBlockIds.push(block.id);
    }
  }
  return staleBlockIds;
}
```

The refactored version uses a guard clause instead:

```typescript
// After (safe):
export function identifyStaleBlockIds(
  existingBlocks: StaleBlockCandidate[],
  googleEventGcalIds: Set<string>
): number[] {
  const staleBlockIds: number[] = [];
  for (const block of existingBlocks) {
    const { gcalId } = block;
    if (!gcalId) continue; // Defensive guard

    if (!googleEventGcalIds.has(gcalId)) {
      staleBlockIds.push(block.id);
    }
  }
  return staleBlockIds;
}
```

The guard silently skips blocks with null `gcalId` instead of crashing. In production, this meant the function kept processing valid blocks even when edge-case data slipped through — instead of taking down the entire sync operation with a `TypeError`.

## When Assertions ARE Acceptable

Type narrowing isn't always necessary. Here are the cases where `!` or `as Type` is fine:

| Scenario                           | Allowed | Example                                              |
| ---------------------------------- | ------- | ---------------------------------------------------- |
| After explicit validation          | Yes     | `return block as BlockWithCalendar` after null check |
| In test files                      | Yes     | `expect(result!.id).toBe(1)`                         |
| Type narrowing helpers             | Yes     | With proper type guards                              |
| Production code without validation | No      | `block.gcalId!`                                      |

Tests are the main exception. Non-null assertions in tests are acceptable because the test itself is the safety net — if `result` is null, the test fails, which is the correct behavior. Adding narrowing guards to test assertions adds noise without improving safety.

## Takeaway

Replace `!` non-null assertions with guard clauses (`if (!x) return/continue/throw`) in production code. The pattern is: destructure into a local variable, guard against null, and let TypeScript's control flow narrow the type. It's one extra line of code that gives you both compile-time type safety and runtime crash prevention. Save `!` and `as Type` for test files and the line immediately after explicit validation.

## References

- [TypeScript Handbook — Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
