---
title: Sentry N+1 Query Detection
description: >-
  How Sentry detects N+1 queries at runtime, common false positives from
  parallel
date: 2026-03-03T00:00:00.000Z
updated: 2026-03-03T00:00:00.000Z
tags:
  - backend
  - performance
  - observability
  - sentry
category: backend
draft: false
lang: en
references:
  - url: >-
      https://docs.sentry.io/product/issues/issue-details/performance-issues/n-one-queries/
    title: Sentry N+1 Queries Detection
    type: official
---

execution, and the fix pattern.

## How Sentry Detects N+1

Sentry does **not** analyze code structure. It observes runtime span patterns in
transaction traces. The heuristic flags when it sees **repeated, similar
database operations** within a single transaction.

```text
Sentry sees:
  handler.nestjs [250ms]
    ├─ db: pg.connect [4ms]
    ├─ db: pg.connect [4ms]
    ├─ db: pg.connect [4ms]
    ├─ db: pg.connect [63ms]
    ├─ db: pg.connect [7ms]
    └─ db: pg.connect [2ms]

Sentry concludes: 6 repeated similar spans → N+1 Query
```

## True N+1 vs False Positive

| Aspect      | True N+1                    | False Positive (Parallel Fan-Out)  |
| ----------- | --------------------------- | ---------------------------------- |
| Query count | Unbounded (grows with data) | Fixed (bounded by code structure)  |
| Pattern     | Loop → query per item       | `Promise.all()` → concurrent batch |
| Fix         | Batch query / eager load    | Sequentialize or suppress          |
| Severity    | High (scales with data)     | Low (constant regardless of data)  |

## The False Positive Pattern: Nested Promise.all()

```typescript
// Outer parallel: 2 calls
const [current, previous] = await Promise.all([
  fetchBlocks(currentPeriod), // Inner parallel: 3 queries each
  fetchBlocks(previousPeriod) // Inner parallel: 3 queries each
]);
// Result: 2 × 3 = 6 concurrent pg.connect → Sentry flags N+1
```

The query count is fixed at 6 regardless of data size. This is intentional
parallelization, not a loop-per-item pattern.

## Why Temporal Separation Fixes It

Sentry's heuristic looks for concurrent similar spans. Separating them
temporally breaks the pattern:

```text
BEFORE (6 concurrent — triggers N+1):
|████|████|████|████|████|████|  ← 6 overlapping pg.connect

AFTER (3 + 3 sequential — below threshold):
|████|████|████|          |████|████|████|
 Current period           Previous period
```

Two batches of 3 are not classified as N+1 because they're temporally distinct.

## Key Points

- Sentry N+1 detection is span-based, not code-based
- `Promise.all()` with identical operation types triggers the heuristic
- Fixed-count parallel queries are false positives (bounded, not data-dependent)
- Sequentializing outer calls trades ~50-80ms latency for halved connection pool
  pressure
- Even without Sentry, reducing fan-out is good practice (connection pools are
  bounded shared resources)

## When to Sequentialize vs Suppress

| Scenario                              | Action                                   |
| ------------------------------------- | ---------------------------------------- |
| Cache disabled, every request hits DB | Sequentialize (real pool pressure)       |
| Cache active, rare DB hits            | Suppress (false positive, cache absorbs) |
| Pool over 4× fan-out factor           | Suppress (plenty of headroom)            |
| Pool under 2× fan-out factor          | Sequentialize (risk of exhaustion)       |
