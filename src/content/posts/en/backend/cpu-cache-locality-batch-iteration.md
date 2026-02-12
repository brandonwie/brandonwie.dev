---
title: CPU Cache Locality in Batch Field Extraction
description: >-
  Multiple `.map()` calls over the same array force the CPU to reload each
  object
date: 2026-02-11T00:00:00.000Z
updated: 2026-02-11T00:00:00.000Z
tags:
  - backend
  - performance
  - optimization
category: backend
draft: false
lang: en
references:
  - url: "https://en.wikipedia.org/wiki/Locality_of_reference"
    title: Locality of reference - Wikipedia
    type: official
---

I had a function that extracted 18 fields from an array of 100+ objects using
chained `.map()` calls. It looked clean. It passed linting. And it was doing
thousands of redundant cache misses behind the scenes.

The code was part of a bulk insert/update path for syncing blocks from Google
Calendar. Each block had 18+ properties, and the original pattern pulled each
field into its own array with a separate `.map()` pass. On paper, this was
idiomatic JavaScript. In practice, it was fighting the CPU.

## Why This Matters

Modern CPUs do not fetch individual bytes from memory. They load data in
**cache lines** -- 64 bytes on x86 architectures. When you access a Block
object, the CPU loads the entire object (or a large portion) into L1 cache.
Any subsequent property access on that **same object** is nearly free: an L1
cache hit takes around 1 nanosecond, while an L3 cache miss costs around 40
nanoseconds.

The `.map()` pattern breaks this model. Each pass iterates the full array,
touching every object for a single field, then moves on. By the time the
next `.map()` runs, the previous objects have been evicted from L1. The CPU
has to reload them from slower cache levels or main memory.

With multiple `.map()` calls:

1. Pass 1: Block loaded into L1, read `.id`, Block evicted
2. Pass 2: Block reloaded into L1, read `.title`, Block evicted
3. Repeat for each field

With a single `for...of`:

1. Block loaded into L1 once
2. Read `.id`, `.title`, `.start`, ... (all L1 hits)
3. Move to next Block

## The Problem in Code

```typescript
// BAD: k separate iterations over n items = O(k*n)
const ids = blocks.map((b) => b.id); // pass 1: block accessed
const titles = blocks.map((b) => b.title); // pass 2: same block re-accessed
const starts = blocks.map((b) => b.start); // pass 3: same block re-accessed
// ... 18 more fields
```

Each `.map()` iterates the entire array. For 18 fields over 100 items:
`18 * 100 = 1,800` property accesses across 18 passes.

## Why This Was Hard to Spot

This kind of inefficiency hides well.

**JavaScript profilers do not show cache miss rates.** They show time per
function. The `.map()` pattern looks clean in flamegraphs because each
individual call is fast. The bottleneck is spread across all of them.

**Functional style feels correct.** One `.map()` per field is idiomatic JS/TS.
It passes linting. The imperative `for...of` alternative looks verbose, and
it is easy to dismiss as "less clean."

**Small-scale testing shows nothing.** With fewer than 100 items, the entire
array fits in L1 cache regardless of access pattern. The problem only surfaces
at scale -- 1,000+ items with large objects.

**V8 optimizations mask the cost.** Hidden classes and inline caching in V8
partially mitigate the penalty. The performance hit is less dramatic than in
C/C++, but still measurable at scale.

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

One loop. One pass. Each block is loaded into the cache once, and all 18
fields are read while the data is still hot. The CPU never reloads the same
object.

## Why This Works

The optimization is not only about reducing iteration count from O(k\*n) to
O(n). The bigger win is **temporal locality**: accessing all fields of an
object while it is still hot in L1 cache, rather than re-fetching it k times
from L2, L3, or main memory.

## Real Impact

| Metric                  | Multi-map (18x)   | Single for...of         | Improvement          |
| ----------------------- | ----------------- | ----------------------- | -------------------- |
| Iterations (100 items)  | 1,800             | 100                     | 18x fewer            |
| Iterations (100K items) | 1,800,000         | 100,000                 | 18x fewer            |
| Cache behavior          | Cold on each pass | Hot (temporal locality) | Significant at scale |

## Practical Takeaway

The threshold matters. Here is when to consider switching from multiple
`.map()` calls to a single loop:

| Data Size      | Multiple .map() OK?   | Why                              |
| -------------- | --------------------- | -------------------------------- |
| &lt; 100 items | Yes                   | Fits entirely in L1 cache anyway |
| 100-1,000      | Marginal              | Depends on object size           |
| 1,000+         | No -- use single pass | Cache eviction between passes    |
| 10,000+        | Definitely not        | O(k\*n) becomes measurable       |

**When to keep `.map()`:**

- **Small arrays (&lt; 100 items)**: The entire dataset fits in L1 cache
  regardless of access pattern. The `.map()` approach is more readable and
  functionally idiomatic.
- **Single field extraction**: If you only need one field, a single `.map()`
  is already optimal (one pass, one field).
- **Readability-critical code paths**: In non-hot code paths where clarity
  matters more than nanoseconds, the functional style is easier to review and
  maintain.
- **When using vectorized/bulk APIs**: If the downstream consumer accepts the
  full object array (not separate field arrays), restructuring into parallel
  arrays adds complexity for no benefit.

The key insight: when you have a hot loop extracting multiple fields from large
arrays, resist the urge to write "clean" chained `.map()` calls. One loop that
reads everything while the data is in cache will always win.
