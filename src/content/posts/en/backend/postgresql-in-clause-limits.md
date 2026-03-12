---
title: PostgreSQL IN Clause Parameter Limits
description: 'When querying by a large set of IDs using TypeORM''s `In([...])` operator, the'
date: 2026-02-11T00:00:00.000Z
updated: 2026-02-11T00:00:00.000Z
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
---

generated SQL creates one bind parameter per ID. Beyond a few thousand IDs,
query planning slows dramatically, and at 65,535 the query fails outright due to
the wire protocol limit. This needed to be solved for
`findByIdsAndUserIdWithCalendar` which could receive thousands of block IDs from
Google Calendar sync.

---

## Difficulties Encountered

- **Error message is cryptic**: When hitting the 65K limit, PostgreSQL returns a
  protocol-level error, not a clear "too many parameters" message. It took
  tracing the wire protocol docs to find the `int16 num_parameters` field as the
  root cause.
- **TypeORM hides the parameter count**: `In([...])` abstracts away the SQL
  generation. There is no TypeORM-level warning when approaching the limit — it
  silently generates the query and lets PostgreSQL reject it.
- **Performance degrades gradually**: There is no cliff at a specific number.
  Planning time increases linearly, so choosing the "right" batch size required
  benchmarking rather than hitting a clear failure point.
- **`ANY(array)` is not a drop-in replacement**: TypeORM's `find()` API does not
  support `ANY($1::int[])`, so using it requires switching to raw `query()`
  calls, losing type safety and query builder composability.

---

## Hard Limit: 65,535 Parameters

PostgreSQL's wire protocol (Frontend/Backend Protocol v3) uses a **16-bit
unsigned integer** to encode the parameter count in the `Bind` message:

```text
Bind message format:
  'B' | int32 length | ... | int16 num_parameters | ...
                                ^^^^^^
                          2 bytes = 2^16 - 1 = 65,535 max
```

Each `$1, $2, ..., $N` in a parameterized query counts toward this limit.
TypeORM's `In([...])` generates `WHERE id IN ($1, $2, ..., $N)`.

---

## Practical Limits (Lower Than Hard Limit)

| Factor           | Practical Limit | Why                                                    |
| ---------------- | --------------- | ------------------------------------------------------ |
| Query plan cache | ~1,000-5,000    | Each unique param count = different prepared statement |
| Planning time    | ~5,000-10,000   | Planner evaluates each param, O(n) overhead            |
| Memory           | ~10,000-30,000  | Each param occupies memory in executor's param array   |
| Wire protocol    | 65,535          | Hard ceiling per query                                 |

---

## The Solution: Batch at 500-1,000

For `SELECT ... WHERE id IN (...)` queries:

- **500** -- sweet spot for B-tree index scans, sub-ms planning
- **1,000** -- still fast, good for less critical paths
- Above 1,000 -- planning time starts to dominate

---

## When to Use

- Querying by a dynamic set of IDs from user input or upstream data (e.g.,
  calendar sync returning variable ID counts)
- Any `WHERE x IN (...)` with a list that could grow beyond a few hundred items
- TypeORM `find()` with `In([...])` on large arrays

## When NOT to Use

- **Static or small ID sets**: If the list is always under 100 items (e.g., a
  user's own calendars), batching adds unnecessary complexity and round-trip
  overhead.
- **Joins are available**: If the IDs come from another table in the same
  database, use a `JOIN` or subquery instead of materializing the ID list in the
  application.
- **Write operations**: For bulk `INSERT`/`UPDATE`, use `UNNEST` or `VALUES`
  patterns instead of `IN` clause batching.

---

## Options Considered

| Option                   | Pros                                                 | Cons                                        |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------- |
| **Batching (500-1,000)** | Works with TypeORM `find()`, predictable performance | Multiple round-trips                        |
| **`ANY(array)`**         | Single round-trip, bypasses 65K limit                | Requires raw SQL, loses TypeORM type safety |
| **Temp table + JOIN**    | Handles 100K+ IDs, single query                      | Extra DDL overhead, connection-scoped       |
| **CTE with VALUES**      | No temp table needed, 1K-10K range                   | Verbose SQL, still has planning overhead    |

## Why This Approach

Chose batching at 500-1,000 because it works directly with TypeORM's `find()`
API without dropping to raw SQL. The `findByIdsAndUserIdWithCalendar` method is
composable with other query builder conditions, and switching to `ANY(array)`
would have required rewriting the entire query. Multiple round-trips are
acceptable here because the sync operation is already I/O-bound on the Google
Calendar API.

---

## Alternative: `ANY(array)` Bypass

```sql
-- IN clause: N parameters
WHERE id IN ($1, $2, ..., $500)  -- 500 params

-- ANY(array): 1 parameter (entire array)
WHERE id = ANY($1::int[])        -- 1 param, bypasses 65K limit
```

TypeORM doesn't natively support `ANY(array)` with `find()`, but raw `query()`
can use it. The `UNNEST` pattern in bulk operations already uses this approach.
