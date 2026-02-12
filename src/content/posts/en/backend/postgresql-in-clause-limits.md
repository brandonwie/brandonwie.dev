---
title: PostgreSQL IN Clause Parameter Limits
description: "When querying by a large set of IDs using TypeORM's `In([...])` operator, the"
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
  - url: "https://www.postgresql.org/docs/current/protocol-message-formats.html"
    title: PostgreSQL Protocol Message Formats - Bind Message
    type: official
---

I had a Google Calendar sync endpoint that queried blocks by an array of IDs.
It worked fine in development with 50 blocks. In staging, with 3,000+ blocks
from a power user's calendar, query planning took multiple seconds. At scale,
it would have hit PostgreSQL's hard limit of 65,535 parameters and crashed.

The problem was hidden by TypeORM's abstraction. `In([...])` looks harmless,
but it generates one bind parameter per element. There is no warning as the
count climbs.

## The Hard Limit

PostgreSQL's wire protocol (Frontend/Backend Protocol v3) uses a **16-bit
unsigned integer** to encode the parameter count in the `Bind` message:

```text
Bind message format:
  'B' | int32 length | ... | int16 num_parameters | ...
                                ^^^^^^
                          2 bytes = 2^16 - 1 = 65,535 max
```

Each `$1, $2, ..., $N` in a parameterized query counts toward this limit.
TypeORM's `In([...])` generates `WHERE id IN ($1, $2, ..., $N)`, so an array
of 65,536 IDs will fail at the protocol level.

## Why It Is Hard to Spot

This issue hides behind layers of abstraction.

**The error message is cryptic.** When hitting the 65K limit, PostgreSQL
returns a protocol-level error, not a clear "too many parameters" message.
Tracing it back to the `int16 num_parameters` field in the wire protocol docs
took real digging.

**TypeORM hides the parameter count.** `In([...])` abstracts away SQL
generation. There is no TypeORM-level warning when approaching the limit -- it
silently generates the query and lets PostgreSQL reject it.

**Performance degrades gradually.** There is no cliff at a specific number.
Planning time increases linearly, so choosing the "right" batch size required
benchmarking rather than hitting a clear failure point.

**`ANY(array)` is not a drop-in replacement.** TypeORM's `find()` API does not
support `ANY($1::int[])`, so using it requires switching to raw `query()`
calls, losing type safety and query builder composability.

## Practical Limits Are Lower Than the Hard Limit

The 65K ceiling is theoretical. In practice, performance degrades well before
that:

| Factor           | Practical Limit | Why                                                    |
| ---------------- | --------------- | ------------------------------------------------------ |
| Query plan cache | ~1,000-5,000    | Each unique param count = different prepared statement |
| Planning time    | ~5,000-10,000   | Planner evaluates each param, O(n) overhead            |
| Memory           | ~10,000-30,000  | Each param occupies memory in executor's param array   |
| Wire protocol    | 65,535          | Hard ceiling per query                                 |

## Options Explored

| Option                   | Pros                                                 | Cons                                        |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------- |
| **Batching (500-1,000)** | Works with TypeORM `find()`, predictable performance | Multiple round-trips                        |
| **`ANY(array)`**         | Single round-trip, bypasses 65K limit                | Requires raw SQL, loses TypeORM type safety |
| **Temp table + JOIN**    | Handles 100K+ IDs, single query                      | Extra DDL overhead, connection-scoped       |
| **CTE with VALUES**      | No temp table needed, 1K-10K range                   | Verbose SQL, still has planning overhead    |

## The Solution: Batch at 500-1,000

I chose batching because it works directly with TypeORM's `find()` API without
dropping to raw SQL. The `findByIdsAndUserIdWithCalendar` method is composable
with other query builder conditions, and switching to `ANY(array)` would have
required rewriting the entire query.

For `SELECT ... WHERE id IN (...)` queries:

- **500** -- sweet spot for B-tree index scans, sub-ms planning
- **1,000** -- still fast, good for less critical paths
- Above 1,000 -- planning time starts to dominate

Multiple round-trips are acceptable here because the sync operation is already
I/O-bound on the Google Calendar API. The database round-trips are negligible
compared to the external API calls.

## The Alternative: `ANY(array)` Bypass

If you can use raw SQL, `ANY(array)` sidesteps the entire problem:

```sql
-- IN clause: N parameters
WHERE id IN ($1, $2, ..., $500)  -- 500 params

-- ANY(array): 1 parameter (entire array)
WHERE id = ANY($1::int[])        -- 1 param, bypasses 65K limit
```

TypeORM does not natively support `ANY(array)` with `find()`, but raw
`query()` can use it. This is the better approach when type safety is not a
concern or when using a query builder that supports array parameters.

## Why This Works

Batching keeps each individual query well within PostgreSQL's comfort zone.
A 500-element `IN` clause generates a query plan in sub-millisecond time and
uses B-tree index scans efficiently. The total work is the same, but the
planner handles smaller queries faster than it handles one massive query.

## Practical Takeaway

**When to batch:**

- Querying by a dynamic set of IDs from user input or upstream data (e.g.,
  calendar sync returning variable ID counts)
- Any `WHERE x IN (...)` with a list that could grow beyond a few hundred
  items
- TypeORM `find()` with `In([...])` on large arrays

**When not to batch:**

- **Static or small ID sets**: If the list is always under 100 items (e.g., a
  user's own calendars), batching adds unnecessary complexity and round-trip
  overhead.
- **Joins are available**: If the IDs come from another table in the same
  database, use a `JOIN` or subquery instead of materializing the ID list in
  the application.
- **Write operations**: For bulk `INSERT`/`UPDATE`, use `UNNEST` or `VALUES`
  patterns instead of `IN` clause batching.

The rule of thumb: if your `IN` clause could ever exceed a few hundred
elements, batch at 500. It is a small code change that prevents both the
gradual performance degradation and the hard protocol crash.
