---
title: Batch Processing Trade-offs
description: "When processing multiple entities that share database operations, there's a"
date: 2026-01-26T00:00:00.000Z
updated: 2026-03-03T00:00:00.000Z
tags:
  - backend
  - performance
  - architecture
  - trade-offs
category: backend
draft: false
lang: en
expanded: true
source_content_hash: 10a08b13d9d4acb23b6f695a697ef31af5fa46fa52bc63c3c9603375b45414b2
references:
  - url: >-
      https://docs.aws.amazon.com/batch/latest/userguide/multi-node-parallel-jobs.html
    title: Multi-node parallel jobs — AWS Batch
    type: official
---

trade-off between per-entity batching and cross-entity batching.

## The Scenario

Syncing 18 calendars, each needs bulk INSERT:

```text
Current: 18 parallel processes → 18 bulk INSERTs → 18 DB connections
Alternative: 18 parallel processes → 1 bulk INSERT → 1 DB connection
```

## Per-Entity Batching (Current)

```typescript
// Each calendar processes independently
await Promise.all(
  calendars.map(async (calendar) => {
    const blocks = await fetchEvents(calendar);
    await bulkInsertBlocks(blocks); // Called 18 times
  }),
);
```

### Pros

- ✅ Parallel processing (faster for network-bound operations)
- ✅ Independent transactions (failure isolation)
- ✅ Simpler error handling (one entity fails, others succeed)
- ✅ Already batched within entity (better than per-event inserts)

### Cons

- ❌ N database connections per sync
- ❌ N bulk INSERT queries
- ❌ Higher connection pool pressure

## Cross-Entity Batching (Alternative)

### Collect-then-Batch

```typescript
// Collect all blocks first
const allBlocks = [];
await Promise.all(
  calendars.map(async (calendar) => {
    const blocks = await processCalendar(calendar);
    allBlocks.push(...blocks);
  }),
);

// ONE bulk insert for all calendars
await bulkInsertBlocks(allBlocks);
```

### Pros

- ✅ Single database query (1 vs N)
- ✅ Lower connection pool usage
- ✅ Better database batching efficiency

### Cons

- ❌ Harder to track which entity failed
- ❌ All-or-nothing transaction (one failure affects all)
- ❌ Requires buffering all data in memory
- ❌ More complex error recovery

## Decision Framework

| Factor            | Per-Entity        | Cross-Entity       |
| ----------------- | ----------------- | ------------------ |
| Failure isolation | ✅ Yes            | ❌ No              |
| Connection usage  | Higher            | Lower              |
| Error tracking    | ✅ Easy           | ❌ Complex         |
| Memory usage      | Lower (streaming) | Higher (buffering) |
| Code complexity   | ✅ Simple         | Complex            |
| Query count       | N queries         | 1 query            |

## When to Choose Which

### Choose Per-Entity Batching When

- Failure isolation is important
- Entities are processed in parallel
- Error recovery needs to be per-entity
- Network I/O dominates (not DB I/O)

### Choose Cross-Entity Batching When

- Database is the bottleneck
- Connection pool is constrained
- All-or-nothing semantics are acceptable
- Memory can hold all data

## Performance Analysis

From real measurements (18 calendars):

| Metric       | Per-Entity | Cross-Entity (estimated) |
| ------------ | ---------- | ------------------------ |
| Total time   | 1.6-1.9s   | 1.5-1.8s                 |
| DB queries   | 18         | 1                        |
| Time savings | -          | 34-119ms (2-6%)          |
| Complexity   | Low        | High                     |

**Verdict**: 2-6% improvement doesn't justify added complexity.

## Key Lessons

1. **Already batched is good enough** - Per-entity bulk INSERT is vastly better
   than per-row INSERT
2. **Parallel processing > single query** - For network-bound operations,
   parallelism wins
3. **Failure isolation matters** - One bad entity shouldn't affect others
4. **Measure before optimizing** - The bottleneck may not be where you think

## Nested Fan-Out Amplification

A variant of the per-entity pattern: nested `Promise.all()` creates
multiplicative connection demand.

```typescript
// Outer: 2 calls in parallel
const [current, previous] = await Promise.all([
  fetchBlocks(currentPeriod), // Inner: 3 queries in parallel
  fetchBlocks(previousPeriod), // Inner: 3 queries in parallel
]);
// Peak connections: 2 × 3 = 6 (not 2, not 3)
```

**Fix:** Sequentialize the outer calls while keeping inner parallelism. Drops
peak from 6 to 3 with ~50-80ms latency cost.

**When this matters:** When cache is disabled or pool is small. Formula:
`outer_parallelism × inner_parallelism × concurrent_users` must fit within pool
size. With cache enabled (60s TTL), fan-out happens once per minute —
acceptable. Without cache, every request fans out — dangerous.

See [Sentry N+1 Detection](/posts/sentry-n-plus-one-detection) for how
this triggers Sentry false positives.

## Code Documentation Pattern

When accepting a trade-off, document it:

```typescript
// ARCHITECTURAL NOTE: Per-Calendar Batching Trade-off
//
// Each calendar processes independently and calls bulkInsertBlocks separately.
// This results in N bulk INSERT queries (one per calendar) instead of one.
//
// TRADE-OFF ANALYSIS:
// - Current: N queries, parallel processing, fast UX
// - Alternative: 1 query, but requires serial processing or complex buffering
//
// DECISION: Keep per-calendar batching for simplicity and parallel processing.
// Performance impact is minimal (34-119ms saved vs. added complexity).
//
// Sentry tracking: NODE-NESTJS-7, NODE-NESTJS-4C
```
