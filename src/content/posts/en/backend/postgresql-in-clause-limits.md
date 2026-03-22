---
title: PostgreSQL IN Clause Parameter Limits
description: 'When querying by a large set of IDs using TypeORM''s `In([...])` operator, the'
date: 2026-02-11T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - postgresql
  - typeorm
  - performance
category: backend
draft: false
lang: en
references:
  - url: 'https://www.postgresql.org/docs/current/protocol-message-formats.html'
    title: PostgreSQL Protocol Message Formats - Bind Message
    type: official
source_content_hash: a7279cbb0b2d57d3237cfc9a9dddaac8cde6b8b53ff82a18f7e214905f2b1efa
expanded: true
---

I was building a calendar sync feature that received thousands of block IDs from Google Calendar and needed to look them up in our database. The query used TypeORM's `In([...])` operator, which worked fine in development with dozens of IDs. In production, with a user who had thousands of calendar events, the query started taking seconds to plan — and once we hit 65,535 IDs, it failed outright with a cryptic protocol-level error.

The root cause sits deep in PostgreSQL's wire protocol: the `Bind` message uses a 16-bit integer to encode the parameter count. That's a hard ceiling of 65,535 parameters per query. But the practical limits are much lower.

## The Hard Limit: 65,535 Parameters

PostgreSQL's Frontend/Backend Protocol v3 uses a 16-bit unsigned integer for the parameter count in the `Bind` message:

```text
Bind message format:
  'B' | int32 length | ... | int16 num_parameters | ...
                                ^^^^^^
                          2 bytes = 2^16 - 1 = 65,535 max
```

Each `$1, $2, ..., $N` in a parameterized query counts toward this limit. TypeORM's `In([...])` generates `WHERE id IN ($1, $2, ..., $N)` — one bind parameter per ID. Pass in 65,536 IDs and the query fails at the protocol level, not with a helpful "too many parameters" message, but with an opaque error that requires reading the wire protocol docs to diagnose.

## Practical Limits Are Much Lower

You'll hit performance problems long before the hard limit:

| Factor           | Practical Limit | Why                                                    |
| ---------------- | --------------- | ------------------------------------------------------ |
| Query plan cache | ~1,000-5,000    | Each unique param count = different prepared statement |
| Planning time    | ~5,000-10,000   | Planner evaluates each param, O(n) overhead            |
| Memory           | ~10,000-30,000  | Each param occupies memory in executor's param array   |
| Wire protocol    | 65,535          | Hard ceiling per query                                 |

The performance degradation is gradual — no cliff at a specific number. Planning time increases linearly with parameter count, so choosing the "right" batch size requires benchmarking rather than hitting a clear failure point.

TypeORM makes this worse by hiding the parameter count. `In([...])` abstracts away the SQL generation entirely. There's no TypeORM-level warning when you approach the limit — it silently generates the query and lets PostgreSQL deal with it.

## The Solution: Batch at 500-1,000

Split large ID lists into batches and run multiple queries:

- **500** — sweet spot for B-tree index scans, sub-millisecond planning
- **1,000** — still fast, good for less critical paths
- **Above 1,000** — planning time starts to dominate

This works directly with TypeORM's `find()` API. Chunk the ID array into batches of 500-1,000, run a `find()` call per batch, and merge the results. The multiple round-trips are acceptable when the operation is already I/O-bound (e.g., syncing from an external API).

## Options I Considered

| Option                   | Pros                                                 | Cons                                        |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------- |
| **Batching (500-1,000)** | Works with TypeORM `find()`, predictable performance | Multiple round-trips                        |
| **`ANY(array)`**         | Single round-trip, bypasses 65K limit                | Requires raw SQL, loses TypeORM type safety |
| **Temp table + JOIN**    | Handles 100K+ IDs, single query                      | Extra DDL overhead, connection-scoped       |
| **CTE with VALUES**      | No temp table needed, 1K-10K range                   | Verbose SQL, still has planning overhead    |

I chose batching because it works with TypeORM's `find()` API without dropping to raw SQL. The `findByIdsAndUserIdWithCalendar` method was composable with other query builder conditions, and switching to `ANY(array)` would have required rewriting the entire query.

## The Alternative: `ANY(array)` Bypass

If you need a single round-trip and can use raw SQL, `ANY(array)` bypasses the parameter limit entirely:

```sql
-- IN clause: N parameters
WHERE id IN ($1, $2, ..., $500)  -- 500 params

-- ANY(array): 1 parameter (entire array)
WHERE id = ANY($1::int[])        -- 1 param, bypasses 65K limit
```

TypeORM doesn't support `ANY(array)` with `find()`, but raw `query()` can use it. The trade-off is losing type safety and query builder composability.

## When NOT to Batch

Batching adds unnecessary complexity in several cases:

- **Static or small ID sets** — if the list is always under 100 items (e.g., a user's own calendars), the overhead of batching logic and multiple round-trips isn't worth it
- **Joins are available** — if the IDs come from another table in the same database, use a `JOIN` or subquery instead of materializing the ID list in the application
- **Write operations** — for bulk `INSERT`/`UPDATE`, use `UNNEST` or `VALUES` patterns instead of `IN` clause batching

## Takeaway

PostgreSQL's wire protocol limits parameterized queries to 65,535 bind parameters, but performance degrades well before that. When using TypeORM's `In([...])` with dynamic ID lists that could grow beyond a few hundred items, batch at 500-1,000 IDs per query. It works with `find()` out of the box, keeps planning time sub-millisecond, and avoids the cryptic protocol-level errors that hit at the 65K ceiling.

## References

- [PostgreSQL Protocol Message Formats — Bind Message](https://www.postgresql.org/docs/current/protocol-message-formats.html)
