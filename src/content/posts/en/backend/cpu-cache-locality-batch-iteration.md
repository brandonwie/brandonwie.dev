---
title: CPU Cache Locality in Batch Field Extraction
description: >-
  Multiple `.map()` calls over the same array force the CPU to reload each
  object
date: 2026-02-11T00:00:00.000Z
updated: '2026-03-22'
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
source_content_hash: 8a0864135717077d5e45b987efd21f1cee4d64ffac79f6b59dd3e3242837d3d6
expanded: true
---

I was optimizing a bulk insert function that extracted 18 fields from an array of calendar blocks. The code looked clean — one `.map()` per field — but it was iterating the entire array 18 times. For 100 blocks, that meant 1,800 property accesses across 18 separate passes. The functional style was hiding a real performance problem: cache locality.

## The Problem

When you use multiple `.map()` calls to extract fields from the same array, the CPU has to reload each object from memory on every pass:

```typescript
// BAD: k separate iterations over n items = O(k*n)
const ids = blocks.map((b) => b.id); // pass 1: block accessed
const titles = blocks.map((b) => b.title); // pass 2: same block re-accessed
const starts = blocks.map((b) => b.start); // pass 3: same block re-accessed
// ... 18 more fields
```

Each `.map()` iterates the entire array. For 18 fields over 100 items: `18 * 100 = 1,800` property accesses across 18 passes. The issue isn't the raw number of accesses — it's that the CPU has to reload the same objects from slower cache levels (or main memory) on every pass.

## Why Cache Locality Matters

Modern CPUs load data in **cache lines** (64 bytes on x86). When you access a Block object, the entire object (or a large portion) gets loaded into the L1 cache. Subsequent property accesses on the **same object** are essentially free — an L1 cache hit takes ~1 nanosecond, while an L3 cache miss takes ~40 nanoseconds.

With multiple `.map()` calls, each pass evicts the objects from cache before the next pass needs them:

1. Pass 1: Block loaded into L1, read `.id`, Block evicted
2. Pass 2: Block reloaded into L1, read `.title`, Block evicted
3. Repeat for each field

With a single `for...of` loop, you access all fields while the object is still hot:

1. Block loaded into L1 once
2. Read `.id`, `.title`, `.start`, ... (all L1 hits)
3. Move to next Block

## The Solution: Single-Pass Extraction

Replace multiple `.map()` calls with a single loop that extracts all fields in one pass:

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

## Why `for...of` Over `forEach`

Both `for...of` and `forEach` are single-pass with identical cache locality behavior. The CPU sees the same sequential memory access pattern. The difference is in how V8's TurboFan JIT compiler optimizes each construct:

```typescript
// Also single-pass — same cache locality as for...of
blocks.forEach((block) => {
  ids.push(block.id);
  titles.push(block.title);
  starts.push(block.startDateTime);
});
```

`for...of` uses the iterator protocol (`Symbol.iterator` + `.next()`). This looks heavier — it allocates an iterator and a `{value, done}` result object per step. But V8's escape analysis eliminates both allocations for arrays since neither object escapes the loop scope.

`forEach` invokes a callback per element. TurboFan inlines `Array.prototype.forEach` itself, but the user-supplied callback is inlined speculatively. If the callback becomes polymorphic or too large, inlining fails silently and each iteration pays full function call overhead — a 20-40% slowdown.

| Aspect           | `for...of`                 | `forEach`                             |
| ---------------- | -------------------------- | ------------------------------------- |
| Cache locality   | Single-pass, sequential    | Single-pass, sequential (identical)   |
| V8 mechanism     | Iterator + escape analysis | Callback inlining (speculative)       |
| Early exit       | `break` works              | Cannot `break` out of `forEach`       |
| Degradation risk | Predictable on arrays      | 20-40% slower if callback not inlined |

`for...of` is the safer default for hot paths: more predictable optimization, supports `break`, and makes the single-pass intent explicit.

## Real Impact

| Metric                  | Multi-map (18x)   | Single for...of         | Improvement          |
| ----------------------- | ----------------- | ----------------------- | -------------------- |
| Iterations (100 items)  | 1,800             | 100                     | 18x fewer            |
| Iterations (100K items) | 1,800,000         | 100,000                 | 18x fewer            |
| Cache behavior          | Cold on each pass | Hot (temporal locality) | Significant at scale |

## When This Optimization Matters

| Data Size | Multiple .map() OK?  | Why                              |
| --------- | -------------------- | -------------------------------- |
| Under 100 | Yes                  | Fits entirely in L1 cache anyway |
| 100-1,000 | Marginal             | Depends on object size           |
| 1,000+    | No — use single pass | Cache eviction between passes    |
| 10,000+   | Definitely not       | O(k\*n) becomes measurable       |

For small arrays (under 100 items), the entire dataset fits in L1 cache regardless of access pattern, so the `.map()` approach is fine and more readable. The optimization only matters at scale — 1K+ items with large objects, where cache eviction between passes becomes measurable.

Also skip this optimization when you only need a single field (one `.map()` is already optimal), in non-hot code paths where readability matters more than nanoseconds, or when the downstream consumer accepts the full object array and doesn't need separate field arrays.

## Takeaway

When extracting multiple fields from a large array, replace multiple `.map()` calls with a single `for...of` loop. The optimization isn't about reducing iteration count (though it does that too) — the bigger win is **temporal locality**: accessing all fields of an object while it's hot in L1 cache, rather than re-fetching it from slower memory on every pass. Use `for...of` over `forEach` on hot paths for more predictable V8 optimization.

## References

- [Locality of reference — Wikipedia](https://en.wikipedia.org/wiki/Locality_of_reference)
