---
title: CPU Cache Locality in Batch Field Extraction
description: >-
  Multiple `.map()` calls over the same array force the CPU to reload each
  object
date: 2026-02-11T00:00:00.000Z
updated: 2026-02-20T00:00:00.000Z
tags:
  - backend
  - performance
  - optimization
category: backend
draft: false
lang: en
references:
  - url: 'https://en.wikipedia.org/wiki/Locality_of_reference'
    title: Locality of reference - Wikipedia
    type: official
---

from memory on every pass. When extracting 18+ fields from 100+ items, this
means thousands of redundant cache misses.

```typescript
// BAD: k separate iterations over n items = O(k*n)
const ids = blocks.map((b) => b.id); // pass 1: block accessed
const titles = blocks.map((b) => b.title); // pass 2: same block re-accessed
const starts = blocks.map((b) => b.start); // pass 3: same block re-accessed
// ... 18 more fields
```

Each `.map()` iterates the entire array. For 18 fields over 100 items:
`18 * 100 = 1,800` property accesses across 18 passes.

---

## Difficulties Encountered

- **Not obvious from profiling**: JavaScript profilers show time per function,
  not cache miss rates. The `.map()` pattern looks clean in flamegraphs, hiding
  the real bottleneck.
- **Functional style feels "right"**: `.map()` per field is idiomatic JS/TS and
  passes linting. The imperative `for...of` alternative looks verbose, making it
  easy to dismiss.
- **Hard to measure at small scale**: With fewer than 100 items the difference is
  invisible because the array fits in L1 anyway. The problem only surfaces at
  scale (1K+ items with large objects).
- **V8 optimizations mask the issue**: V8's hidden classes and inline caching
  partially mitigate the cost, so the penalty is less dramatic than in C/C++ but
  still measurable at scale.

---

## Why Cache Locality Matters

Modern CPUs load data in **cache lines** (64 bytes on x86). When you access a
Block object, the entire object (or a large portion) gets loaded into L1 cache.
Subsequent property accesses on the **same object** are essentially free (L1 hit
= ~1ns vs L3 miss = ~40ns).

With multiple `.map()` calls:

1. Pass 1: Block loaded into L1, read `.id`, Block evicted
2. Pass 2: Block reloaded into L1, read `.title`, Block evicted
3. Repeat for each field

With single `for...of`:

1. Block loaded into L1 once
2. Read `.id`, `.title`, `.start`, ... (all L1 hits)
3. Move to next Block

---

## The Solution: Single-Pass Extraction

```typescript
// GOOD: 1 iteration over n items = O(n)
const ids: number[] = [];
const titles: (string | null)[] = [];
const starts: (string | null)[] = [];

for (const block of blocks) {
  // Block is hot in L1 cache — all reads are cache hits
  ids.push(block.id);
  titles.push(block.title);
  starts.push(block.startDateTime);
}
```

---

## Why `for...of` Over `forEach`

Both `for...of` and `forEach` are single-pass, so they produce identical cache
locality behavior. The CPU sees the same sequential memory access pattern either
way. However, they differ in V8 internals and control flow.

`forEach` achieves the same single-pass benefit:

```typescript
// Also single-pass — same cache locality as for...of
blocks.forEach((block) => {
  ids.push(block.id);
  titles.push(block.title);
  starts.push(block.startDateTime);
});
```

The difference is in how V8's TurboFan JIT optimizes each construct:

- **`for...of`** uses the iterator protocol (`Symbol.iterator` + `.next()`).
  This looks heavier — it allocates an iterator and a `{value, done}` result
  object per step. But V8's escape analysis eliminates both allocations for
  arrays, since neither object escapes the loop scope.
- **`forEach`** invokes a callback per element. TurboFan inlines
  `Array.prototype.forEach` itself (since V8 v6.1), but the user-supplied
  callback is inlined _speculatively_. If the callback becomes polymorphic or
  too large, inlining fails silently and each iteration pays a full function
  call overhead.

| Aspect           | `for...of`                 | `forEach`                             |
| ---------------- | -------------------------- | ------------------------------------- |
| Cache locality   | Single-pass, sequential    | Single-pass, sequential (identical)   |
| V8 mechanism     | Iterator + escape analysis | Callback inlining (speculative)       |
| Early exit       | `break` works              | Cannot `break` out of `forEach`       |
| Degradation risk | Predictable on arrays      | 20-40% slower if callback not inlined |

`for...of` is the safer default for hot paths: more predictable optimization,
supports `break`, and makes the single-pass intent explicit.

---

## Real Impact

| Metric                  | Multi-map (18x)   | Single for...of         | Improvement          |
| ----------------------- | ----------------- | ----------------------- | -------------------- |
| Iterations (100 items)  | 1,800             | 100                     | 18x fewer            |
| Iterations (100K items) | 1,800,000         | 100,000                 | 18x fewer            |
| Cache behavior          | Cold on each pass | Hot (temporal locality) | Significant at scale |

---

## When It Matters

| Data Size   | Multiple .map() OK?  | Why                              |
| ----------- | -------------------- | -------------------------------- |
| Under 100   | Yes                  | Fits entirely in L1 cache anyway |
| 100-1,000   | Marginal             | Depends on object size           |
| 1,000+      | No — use single pass | Cache eviction between passes    |
| 10,000+     | Definitely not       | O(k\*n) becomes measurable       |

## When NOT to Use

- **Small arrays (under 100 items)**: The entire dataset fits in L1 cache regardless
  of access pattern. The `.map()` approach is more readable and functionally
  idiomatic.
- **Single field extraction**: If you only need one field, a single `.map()` is
  already optimal (one pass, one field).
- **Readability-critical code paths**: In non-hot code paths where clarity
  matters more than nanoseconds, the functional style is easier to review and
  maintain.
- **When using vectorized/bulk APIs**: If the downstream consumer accepts the
  full object array (not separate field arrays), restructuring into parallel
  arrays adds complexity for no benefit.

---

## Key Insight

The optimization isn't just about reducing iteration count (O(k\*n) → O(n)). The
bigger win is **temporal locality**: accessing all fields of an object while
it's still hot in L1 cache, rather than re-fetching it k times from L2/L3/main
memory.
