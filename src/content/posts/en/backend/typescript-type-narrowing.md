---
title: TypeScript Type Narrowing Over Assertions
description: Prefer type narrowing over non-null assertions (`!`) and forced casting
date: 2026-02-05T00:00:00.000Z
updated: 2026-02-05T00:00:00.000Z
tags:
  - backend
  - typescript
  - best-practices
category: backend
draft: false
lang: en
references:
  - url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html"
    title: TypeScript Handbook - Narrowing
    type: official
---

I had a function with a comment that said "gcalId is guaranteed non-null by DB
query" and a `!` assertion to match. Then a migration changed the query, the
guarantee broke, and the function started throwing runtime errors in production.
The TypeScript compiler never warned me because I told it to trust me with `!`.

Non-null assertions and forced casting (`as Type`) bypass TypeScript's type
checking. They compile fine but create landmines for future changes. Type
narrowing does the same job with an actual runtime check, so when assumptions
break, you get graceful handling instead of a crash.

## The Problem

```typescript
// BAD: Assumes gcalId exists without runtime check
function processBlock(block: Block) {
  console.log(block.gcalId!.length); // Runtime error if null
}
```

The `!` tells TypeScript "trust me, this is not null." But TypeScript cannot
verify runtime database guarantees, and DB queries change. Migration bugs happen.
Partial data shows up in edge cases. The `!` hides all of these problems until
they explode in production.

## The Difficulties

Several factors made this change harder than "just add a null check."

The original code used `block.gcalId!` with a comment "guaranteed non-null by DB
query." Adding `if (!gcalId) continue` felt redundant when "we know it's never
null." But production edge cases -- migration bugs, partial data -- proved that
assumption wrong.

Choosing the right guard response matters too. Each narrowing guard needs a
different action: `continue` in loops, early `return` in functions, `throw` for
invariant violations. Picking the wrong one silently drops data or crashes the
process.

Custom type guards (`block is BlockWithCalendar`) are powerful but add
boilerplate. I had to learn when a simple null check suffices versus when a
reusable guard is warranted.

## The Solution

Extract to a local variable and use a guard:

```typescript
// GOOD: Runtime check with type narrowing
function processBlock(block: Block) {
  const { gcalId } = block;
  if (!gcalId) return; // or throw, or continue

  console.log(gcalId.length); // TypeScript knows gcalId is string
}
```

After the guard, TypeScript narrows the type automatically. No assertion needed.

## Three Patterns

### Early Return / Continue

The most common pattern. Destructure, guard, continue:

```typescript
for (const block of blocks) {
  const { gcalId } = block;
  if (!gcalId) continue;

  // gcalId is guaranteed non-null here
  results.push(gcalId);
}
```

### Type Guard Function

For complex type checks that appear in multiple places:

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

### Intersection Type After Validation

When you validate at a boundary and want to pass a stronger type downstream:

```typescript
function validateBlock(block: Block): BlockWithCalendar {
  if (!block.calendar) {
    throw new BlockBadRequestException("Calendar is required");
  }
  return block as BlockWithCalendar; // Safe: validated above
}
```

This is one of the few places where `as Type` is acceptable -- immediately after
an explicit validation in the same scope.

## Real-World Example

Here is the actual code change that prompted this pattern. Before:

```typescript
export function identifyStaleBlockIds(
  existingBlocks: StaleBlockCandidate[],
  googleEventGcalIds: Set<string>,
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

After:

```typescript
export function identifyStaleBlockIds(
  existingBlocks: StaleBlockCandidate[],
  googleEventGcalIds: Set<string>,
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

The change is small -- two extra lines. But those two lines mean the function
handles unexpected nulls gracefully instead of crashing.

## When Assertions ARE Acceptable

| Scenario                           | Allowed | Example                                              |
| ---------------------------------- | ------- | ---------------------------------------------------- |
| After explicit validation          | Yes     | `return block as BlockWithCalendar` after null check |
| In test files                      | Yes     | `expect(result!.id).toBe(1)`                         |
| Type narrowing helpers             | Yes     | With proper type guards                              |
| Production code without validation | No      | `block.gcalId!`                                      |

Test files are the main exception. Non-null assertions in tests are fine because
test failures are the safety net, and narrowing guards add noise to assertions
like `expect(result!.id).toBe(1)`.

## Practical Takeaway

Use type narrowing in any production code accessing nullable properties. Use it
at validation boundaries where functions receive external data (API responses, DB
results, user input). Use it in loop bodies with optional fields --
destructure and guard with `continue` to keep the rest of the loop body clean.

Do not bother with narrowing guards in test files, after explicit validation in
the same scope (where `as Type` is safe), or inside `.filter(Boolean)` callbacks
where the language already narrows for you.

The pattern costs two lines of code. It buys you runtime safety, self-documenting
constraints, easier debugging, and protection against future changes that break
assumptions you forgot you made.
