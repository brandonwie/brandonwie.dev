---
title: Batch Processing Trade-offs
description: >-
  Per-entity batching versus one cross-entity bulk INSERT — what I measured,
  what I only estimated, and why the simpler shape stayed.
date: 2026-01-26T00:00:00.000Z
updated: "2026-08-02"
tags:
  - backend
  - performance
  - architecture
  - trade-offs
category: backend
draft: false
lang: en
expanded: true
source_content_hash: e7a60acfed7e209f0a40745f1ca4816ff9fdd56adc510428e06dec11d8b9e931
references:
  - url: https://www.postgresql.org/docs/current/populate.html
    title: Populating a Database — PostgreSQL Documentation
    type: official
  - url: >-
      https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
    title: Promise.all() — MDN Web Docs
    type: official
---

When several entities each need the same kind of database write, there are two
shapes to pick from. Every entity can issue its own bulk INSERT, or every entity
can hand its rows to one shared INSERT at the end. I had the first shape in a
sync job and worked through whether the second was worth building.

It wasn't — but the reason is more interesting than the verdict, and the number
that decided it is thinner than I'd like.

## The scenario

A sync job pulls events from 18 calendar feeds in parallel. Each feed produces a
batch of rows that has to land in one table.

```text
Approach A (what I had):      18 parallel fetches → 18 bulk INSERTs → 18 connections
Approach B (what I weighed):  18 parallel fetches →  1 bulk INSERT  →  1 connection
```

## Approach A — per-entity batching

```typescript
// Each feed is processed independently.
await Promise.all(
  feeds.map(async (feed) => {
    const rows = await fetchEvents(feed);
    await bulkInsert(rows); // called once per feed
  }),
);
```

What it buys: fetches run in parallel, which is what matters when the run is
network-bound. Each feed gets its own transaction, so a failure stays inside the
feed that caused it. Error handling is per-feed — one bad feed doesn't take the
other 17 down with it. And the write is already batched *within* a feed, which
turns out to be the part that carries most of the benefit.

What it costs: N connections per run, N INSERT statements, and correspondingly
more pressure on the connection pool.

## Approach B — cross-entity batching

Collect everything first, write once.

```typescript
const allRows = [];

await Promise.all(
  feeds.map(async (feed) => {
    const rows = await fetchEvents(feed);
    allRows.push(...rows);
  }),
);

// One bulk insert covering every feed.
await bulkInsert(allRows);
```

What it buys: one statement instead of N, one connection instead of N, and a
bigger batch for the database to work with.

What it costs: it's harder to tell which feed produced a bad row, the write
becomes all-or-nothing so one failure rolls back the rest, every row sits in
memory until the write happens, and error recovery gets meaningfully more
complex.

## The comparison in one table

| Factor            | Per-entity              | Cross-entity           |
| ----------------- | ----------------------- | ---------------------- |
| Failure isolation | Yes                     | No                     |
| Connections used  | N                       | 1                      |
| Error tracking    | Straightforward         | Complex                |
| Memory            | Lower (streams through) | Higher (buffers all)   |
| Code complexity   | Low                     | Higher                 |
| Statements        | N                       | 1                      |

Per-entity fits when failure isolation matters, entities are already processed
in parallel, recovery needs to be per-entity, and network I/O dominates the run.

Cross-entity fits when the database is the bottleneck, the connection pool is
constrained, all-or-nothing semantics are acceptable, and memory can comfortably
hold the whole payload.

## What the numbers said

The per-entity column is measured over an 18-feed run. The cross-entity column
is an estimate — I never built it, so this is a projection, not a result.

| Metric       | Per-entity (measured) | Cross-entity (estimated) |
| ------------ | --------------------- | ------------------------ |
| Total time   | 1.6-1.9s              | 1.5-1.8s                 |
| Statements   | 18                    | 1                        |
| Time savings | —                     | 34-119ms (2-6%)          |
| Complexity   | Low                   | High                     |

Worth being honest about how thin that is. A 2-6% estimate held up against a
measured baseline is not a strong result on its own; it moved the decision only
because it pointed the same direction as everything else in the table. Had the
estimate come out near 40%, the right move would have been to build a prototype
and measure it properly rather than argue from a projection.

## Why the batching that mattered was already done

The big jump is per-row INSERT to batched INSERT, not 18 batches to one. The
PostgreSQL docs on populating a database make the shape of that curve visible:
committing each insertion separately means "PostgreSQL is doing a lot of work
for each row that is added," while `COPY` is "almost always faster than using
`INSERT`, even if `PREPARE` is used and multiple insertions are batched into a
single transaction."

So the ladder runs roughly: one commit per row, then batched inserts in a
transaction, then `COPY`. Collapsing 18 already-batched writes into one moves
you a short distance along a rung you're mostly standing on already. That's the
lesson I'd keep — measure where you actually are on the ladder before optimizing
the step you happen to be looking at.

## Nested fan-out amplification

A variant of the per-entity pattern deserves its own warning: nested
`Promise.all()` multiplies connection demand rather than adding to it.

```typescript
// Outer: two ranges in parallel.
const [current, previous] = await Promise.all([
  loadRange(currentPeriod), // inner: 3 queries in parallel
  loadRange(previousPeriod), // inner: 3 queries in parallel
]);
// Peak connections: 2 × 3 = 6 — not 2, not 3.
```

MDN's note on `Promise.all()` is the detail to hold onto here: the promises are
already running by the time they're passed in, since "if you are using it to run
several async functions concurrently, you need to call the async functions and
use the returned promises." Nothing in the outer `Promise.all()` throttles the
inner fan-out on your behalf.

The fix is to sequentialize the outer calls while keeping the inner parallelism.
Peak connections drop from 6 to 3, at a cost of roughly 50-80ms.

This matters when the pool is small or a cache is disabled. The rough constraint
is that `outer × inner × concurrent_users` has to fit inside the pool. With a
60-second cache in front, the fan-out happens about once a minute and nobody
notices. Without it, every single request fans out.

The same pattern also confuses N+1 detectors — I wrote about that in
[Sentry N+1 Detection](/posts/sentry-n-plus-one-detection).

## Write the trade-off down next to the code

A decision like this is invisible six months later unless it lives beside the
code it explains:

```typescript
// ARCHITECTURAL NOTE: per-entity batching trade-off
//
// Each feed is processed independently and issues its own bulk INSERT, so a
// run produces N statements instead of one.
//
// TRADE-OFF:
// - Per-entity:   N statements, parallel fetches, isolated failures.
// - Cross-entity: 1 statement, but serial processing or a full in-memory buffer.
//
// DECISION: keep per-entity batching. The estimated upside of collapsing to a
// single statement was 34-119ms on an 18-feed run — not enough to pay for the
// loss of failure isolation.
```

Without that note, the next person to read the code sees N queries where one
would do and reasonably assumes nobody thought about it.

## Takeaway

The question was never "one query or N queries." It was which resource is
actually scarce. When the run is network-bound and the pool has room, collapsing
N batched writes into one buys a couple of percent and costs failure isolation.
When the pool is the constraint — and nested fan-out is the quickest way to make
it the constraint — the same change stops being a micro-optimization and becomes
the whole fix.

## References

- [Populating a Database — PostgreSQL Documentation](https://www.postgresql.org/docs/current/populate.html)
- [Promise.all() — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
