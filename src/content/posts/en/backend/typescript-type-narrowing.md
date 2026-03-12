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
  - url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html'
    title: TypeScript Handbook - Narrowing
    type: official
source_content_hash: 5fce5f85ff152d1975ef8ed1d86500e0ff70659faaf99b5a351f662ae33376d5
---

(`as Type`) in production code. This provides runtime safety and better
maintainability.

## The Problem

Non-null assertions bypass TypeScript's type checking:

```typescript
// ❌ BAD: Assumes gcalId exists without runtime check
function processBlock(block: Block) {
  console.log(block.gcalId!.length); // Runtime error if null
}
```

---

## Difficulties Encountered

- **False sense of safety from DB guarantees** — The original code used
  `block.gcalId!` with a comment "guaranteed non-null by DB query," but DB
  queries can change and the TypeScript compiler cannot verify runtime database
  guarantees
- **Resistance to "unnecessary" guards** — Adding `if (!gcalId) continue` felt
  redundant when "we know it's never null," but production edge cases (migration
  bugs, partial data) proved otherwise
- **Choosing between throw, return, and continue** — Each narrowing guard needs
  a different response: `continue` in loops, early `return` in functions,
  `throw` for invariant violations. Picking the wrong one silently drops data or
  crashes
- **Type guard function overhead** — Custom type guards
  (`block is BlockWithCalendar`) are powerful but add boilerplate; had to learn
  when a simple null check suffices vs when a reusable guard is warranted

---

## The Solution

Extract to local variable and use guard:

```typescript
// ✅ GOOD: Runtime check with type narrowing
function processBlock(block: Block) {
  const { gcalId } = block;
  if (!gcalId) return; // or throw, or continue

  console.log(gcalId.length); // TypeScript knows gcalId is string
}
```

---

## Patterns

### 1. Early Return / Continue

```typescript
for (const block of blocks) {
  const { gcalId } = block;
  if (!gcalId) continue;

  // gcalId is guaranteed non-null here
  results.push(gcalId);
}
```

### 2. Type Guard Function

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

```typescript
function validateBlock(block: Block): BlockWithCalendar {
  if (!block.calendar) {
    throw new BlockBadRequestException("Calendar is required");
  }
  return block as BlockWithCalendar; // Safe: validated above
}
```

---

## When to Use

- **Any production code accessing nullable properties** — If a property could be
  `null` or `undefined`, use a narrowing guard instead of `!`
- **Loop bodies with optional fields** — Destructure and guard with `continue`
  to keep the rest of the loop body clean
- **Validation boundaries** — At the entry point of a function that receives
  external data (API responses, DB results, user input), narrow types before
  passing them deeper
- **Shared utility functions** — Functions used across modules cannot assume
  callers have pre-validated data

---

## When NOT to Use

- **Test files** — Non-null assertions (`!`) in tests are acceptable because
  test failures are the safety net, and narrowing guards add noise to assertions
  like `expect(result!.id).toBe(1)`
- **After explicit validation in the same scope** — If you just validated with
  `if (!x) throw`, using `as Type` on the next line is safe and avoids redundant
  checks
- **Trivially guaranteed contexts** — Inside a `.filter(Boolean)` callback or
  after `.find()` with a subsequent truthiness check, the narrowing is already
  done by the language
- **Performance-critical inner loops** — In rare cases where a guard check runs
  millions of times and the invariant is truly guaranteed by construction, the
  `!` assertion may be justified with a comment explaining why

---

## When Assertions ARE Allowed

| Scenario                           | Allowed | Example                                              |
| ---------------------------------- | ------- | ---------------------------------------------------- |
| After explicit validation          | ✅      | `return block as BlockWithCalendar` after null check |
| In test files                      | ✅      | `expect(result!.id).toBe(1)`                         |
| Type narrowing helpers             | ✅      | With proper type guards                              |
| Production code without validation | ❌      | `block.gcalId!`                                      |

---

## Real-World Example

Before (risky):

```typescript
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

After (safe):

```typescript
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

---

## Why This Matters

1. **Runtime Safety**: Guards against edge cases and bugs
2. **Self-Documenting**: Code shows what conditions are expected
3. **Maintainability**: Future developers understand constraints
4. **Debugging**: Clearer error location when issues occur
