---
title: TypeScript Type Narrowing Over Assertions
description: Prefer type narrowing over non-null assertions (`!`) and forced casting
date: 2026-02-05T00:00:00.000Z
updated: '2026-08-02'
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
source_content_hash: 50a995ca15b6f84f8f942f9f3e84d387ae578c1d1417de09261c3e231628db23
expanded: true
---

A stale block cleanup helper I worked on used `block.gcalId!`, the non-null assertion operator, justified by a comment: "guaranteed non-null by DB query." The compiler was happy and the code looked clean. What stuck with me is that the comment was the entire guarantee: nothing the compiler could verify, and DB queries do change. I replaced the assertion with a guard clause, and writing this up is mostly an attempt to say why that trade felt worth one extra line.

Non-null assertions (`!`) and forced casting (`as Type`) tell TypeScript "trust me, I know better." They suppress the type error without adding any runtime safety. Type narrowing gives you the compile-time check and the runtime protection, and it usually costs one extra line.

## The Problem

Non-null assertions bypass TypeScript's type checking entirely:

```typescript
// ❌ BAD: Assumes gcalId exists without runtime check
function processBlock(block: Block) {
  console.log(block.gcalId!.length); // Runtime error if null
}
```

The `!` operator makes the compiler stop complaining, but it doesn't make the value non-null. If `gcalId` is ever `null` or `undefined` at runtime, you get a `TypeError` at the access site, usually far from the code that made the assumption.

What bites is the false sense of safety. Comments like "guaranteed non-null by DB query" or "always set by middleware" are promises TypeScript can't verify, and the things they depend on move. A query gets rewritten, or middleware gets refactored, or a migration hands you a row shaped in a way nobody planned for. The `!` operator passes all of that through until it crashes in production.

## The Solution

What I do instead is destructure into a local variable and put a guard clause in front of it. TypeScript's control flow analysis narrows the type from there:

```typescript
// ✅ GOOD: Runtime check with type narrowing
function processBlock(block: Block) {
  const { gcalId } = block;
  if (!gcalId) return; // or throw, or continue

  console.log(gcalId.length); // TypeScript knows gcalId is string
}
```

After the guard clause, TypeScript knows `gcalId` is non-null in the rest of the function. You don't need an assertion, and you get runtime protection against the edge cases a comment can't prevent.

## Three Narrowing Patterns

### 1. Early Return / Continue

This is the one I reach for most. In loops it's `continue` to skip null entries, in functions an early `return`:

```typescript
for (const block of blocks) {
  const { gcalId } = block;
  if (!gcalId) continue;

  // gcalId is guaranteed non-null here
  results.push(gcalId);
}
```

The part I underestimated is that `continue`, `return`, and `throw` are not interchangeable. Each guard is a decision about what a missing value means: `continue` skips one item and keeps going, early `return` abandons the whole call, and `throw` says the invariant was violated and nothing downstream should proceed. Picking the wrong one fails quietly. A `continue` where a `throw` belonged drops data without a sound, and a `throw` where a `continue` belonged turns one bad row into a failed batch.

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

Custom type guards are useful, but they are also boilerplate you have to keep in sync with the type. For a single null check inside one function, a plain `if (!x) return` is less code and just as safe. The guard function earns its keep when several call sites need the same shape check, or when the narrowed type is an intersection nobody wants to spell out repeatedly.

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

Note that `as Type` after explicit validation is fine, since you've just verified the invariant on the line above. The problem is `as Type` without validation.

## Real-World Example

That stale block cleanup utility is the concrete case. The original relied on a non-null assertion plus a comment:

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

The guard skips blocks with a null `gcalId` instead of crashing. In production that meant the function kept processing the valid blocks when edge-case data slipped through, rather than taking down the entire sync operation with a `TypeError`.

## Extracting a Guard Can Silently Drop Its Narrowing

Months later, the same codebase turned up a second lesson, this time about the guards themselves. Centralizing duplicated guards is about as routine a refactor as there is: six handlers carried the identical check, so it moved into a helper. What's easy to miss, because the runtime behavior really is identical, is that the inline version had been doing two jobs at once:

```typescript
// refuses the enqueue AND narrows both fields to non-null below this line
if (event.integrationId === null || event.calendarGcalId === null) return;
```

Extracting it to a helper that returns `boolean` preserved only the first job:

```typescript
// WRONG — refusal preserved, narrowing lost
private isEnqueueableGoogleEvent(event: {...}): boolean
```

Every downstream `queue.add({ integrationId: event.integrationId })` stopped compiling, because the job payload declares that field as `number | undefined` and `null` is not assignable to it. Nothing about the runtime behavior had changed. The refactor was faithful in every way except the one the compiler cared about, and the build broke everywhere.

The fix is a type predicate over a generic parameter, which hands the narrowing back to callers:

```typescript
private isEnqueueableGoogleEvent<
  TEvent extends { integrationId: number | null; calendarGcalId: string | null },
>(event: TEvent, fnName: string): event is TEvent & {
  integrationId: number;
  calendarGcalId: string;
} {
```

`event is TEvent & {...}` is legal because the narrowed type is assignable to the declared parameter type, and `if (!pred(x)) return;` narrows `x` for the rest of the function exactly as the inline guard did.

The part I would not have predicted: an inline `if (...) return;` is a control-flow statement *and* a type-level statement, while a function returning `boolean` can only replace the first half. So whenever a nullness or shape check gets lifted out of a function body, it is worth asking whether anything downstream depended on the narrowing. Reaching for a predicate by default seems like the cheaper habit, since it costs nothing when nobody uses the narrowing.

Worth naming honestly: the test suite in that repo could not have caught this, and that is a property of its configuration rather than of test suites in general. ts-jest ran with `diagnostics.warnOnly`, so a type error downgrades to a warning and the run still goes green, and the diagnostics were scoped to spec files anyway, so type errors in source files never surfaced during a test run at all. ESLint does not type-check either. So "all tests pass, lint clean" was never evidence that this refactor was safe. In that repo, the build was the only gate that could fail on it.

## When Assertions ARE Acceptable

Type narrowing isn't always necessary. These are the cases where `!` or `as Type` holds up:

| Scenario                           | Allowed | Example                                              |
| ---------------------------------- | ------- | ---------------------------------------------------- |
| After explicit validation          | Yes     | `return block as BlockWithCalendar` after null check |
| In test files                      | Yes     | `expect(result!.id).toBe(1)`                         |
| Type narrowing helpers             | Yes     | With proper type guards                              |
| Production code without validation | No      | `block.gcalId!`                                      |

Tests are the main exception. A non-null assertion in a test is fine because the test itself is the safety net: if `result` is null, the test fails, which is exactly what should happen. Adding narrowing guards to test assertions adds noise without improving safety.

Two more places where the extra guard buys nothing. The first is contexts where the language has already done the narrowing for you. Inside a `.filter(Boolean)` callback, or after a `.find()` whose result you have just checked for truthiness, a second guard restates something the compiler already knows. The second is the rare hot path: if a check runs millions of times in an inner loop and the invariant really is guaranteed by construction, `!` may be the honest choice. That one comes with a caveat I would apply to myself as much as anyone, because "guaranteed by construction" is the same phrase that produced `block.gcalId!` in the first place. If I took that route I'd want a comment spelling out what the construction actually guarantees, and I'd expect that comment to be re-checked the next time the construction changes.

## Takeaway

Where I've landed for production code is to trade `!` for a guard clause (`if (!x) return/continue/throw`): destructure into a local variable, guard against null, and let TypeScript's control flow narrow the type from there. It's one extra line, and it buys the compile-time check and the runtime crash prevention together. `!` and `as Type` still earn their place in test files and on the line right after explicit validation. The piece I'd flag hardest is the last one: when a guard moves out of a function body into a shared helper, a type predicate holds up where a `boolean` doesn't, because the refusal survives the refactor and the narrowing quietly doesn't.

## References

- [TypeScript Handbook - Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
