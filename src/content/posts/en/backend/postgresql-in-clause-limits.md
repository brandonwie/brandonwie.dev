---
title: PostgreSQL IN Clause Parameter Limits
description: "PostgreSQL's wire protocol caps parameterized queries at 65,535 bind parameters. Batching TypeORM's `In([...])` at 500-1,000 stays inside practical performance limits."
date: 2026-02-11T00:00:00.000Z
updated: '2026-07-31'
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
source_content_hash: dc47b0de0a1a50060545573a2acaaa24e4b66f23cd562efeeaaf3714a2ea8c5f
expanded: true
---

I was building a calendar sync feature that received thousands of block IDs from Google Calendar and needed to look them up in our database. The query used TypeORM's `In([...])` operator, which worked fine in development with dozens of IDs. A sync for a heavy calendar user could return thousands of block IDs though, and the ceiling I found while sizing that query was hard: beyond a few thousand IDs planning slows noticeably, and at 65,535 the query fails outright with a cryptic protocol-level error.

The cause is in PostgreSQL's wire protocol: the `Bind` message uses a 16-bit integer to encode the parameter count. That's a hard ceiling of 65,535 parameters per query. The practical limits turned out to be much lower.

## The Hard Limit: 65,535 Parameters

PostgreSQL's Frontend/Backend Protocol v3 uses a 16-bit unsigned integer for the parameter count in the `Bind` message:

```text
Bind message format:
  'B' | int32 length | ... | int16 num_parameters | ...
                                ^^^^^^
                          2 bytes = 2^16 - 1 = 65,535 max
```

Each `$1, $2, ..., $N` in a parameterized query counts toward this limit. TypeORM's `In([...])` generates `WHERE id IN ($1, $2, ..., $N)`, one bind parameter per ID. Pass in 65,536 IDs and the query fails at the protocol level. There's no helpful "too many parameters" message, just an opaque error that took reading the wire protocol docs to diagnose.

## Practical Limits Are Much Lower

Performance problems show up long before the hard limit:

| Factor           | Practical Limit | Why                                                    |
| ---------------- | --------------- | ------------------------------------------------------ |
| Query plan cache | ~1,000-5,000    | Each unique param count = different prepared statement |
| Planning time    | ~5,000-10,000   | Planner evaluates each param, O(n) overhead            |
| Memory           | ~10,000-30,000  | Each param occupies memory in executor's param array   |
| Wire protocol    | 65,535          | Hard ceiling per query                                 |

The degradation is gradual, with no cliff at a specific number. Planning time increases linearly with parameter count, so picking the "right" batch size means benchmarking rather than waiting for a clear failure point.

TypeORM makes this harder to notice. `In([...])` hides the SQL generation, so the parameter count never surfaces anywhere you would think to look, and no warning fires as you approach the limit. TypeORM builds the query and lets PostgreSQL decide what to do with it.

## The Solution: Batch at 500-1,000

Split large ID lists into batches and run multiple queries:

- **500** was the sweet spot for us: B-tree index scans with sub-millisecond planning
- **1,000** was still fast, fine for less critical paths
- **Above 1,000**, planning time starts to dominate

This works directly with TypeORM's `find()` API. Chunk the ID array into batches of 500-1,000, run a `find()` call per batch, and merge the results. The extra round-trips were acceptable here because the operation was already I/O-bound (syncing from an external API).

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

TypeORM doesn't support `ANY(array)` with `find()`, but raw `query()` can use it. The trade-off is losing type safety and query builder composability. The `UNNEST` pattern that shows up in bulk operations is the same idea: one array parameter standing in for N scalars.

## The Same Ceiling Caps Bulk `INSERT`

What I didn't appreciate at first is that the 65,535 limit is a property of the bind message, not of the `IN` clause. It applies to every parameterized statement, including a multi-row `INSERT`. The arithmetic there is columns × rows rather than a count of IDs, and that is much easier to trip over than it looks:

```text
15 columns x 7,029 rows = 105,435 parameters   -> exceeds 65,535
```

Seven thousand rows doesn't feel like a large dataset. But TypeORM's `repository.insert(rows)` builds one statement, so a bulk load fails on something that seems far too small to hit any limit. Chunking is the same move as before:

```ts
const CHUNK = 1000; // 15 x 1000 = 15,000 params, comfortably under
for (let i = 0; i < rows.length; i += CHUNK) {
  await repo.insert(rows.slice(i, i + CHUNK));
}
```

This failure repeats what made the `IN` clause version hard to diagnose: the driver error never mentions the parameter ceiling, so the symptom points nowhere near the cause. If you know the column count, you can compute a safe chunk size yourself as `floor(60000 / columns)` instead of guessing at one.

For a one-shot load, `COPY ... FROM STDIN` sidesteps the question entirely. It streams and uses no bind parameters at all, which is why it stays sub-second where chunked inserts take a few seconds. It bypasses the ORM path, so it fits an import job better than application code.

### `ON CONFLICT` upserts count the same way

An upsert is still one bind message, so the arithmetic doesn't change: params per row equals the number of columns in the `INSERT` list. The `ON CONFLICT` target and the `DO UPDATE SET` clause add none, since they reference `EXCLUDED` and the target table rather than new placeholders. A 6-column upsert therefore caps at `floor(65535 / 6)` = 10,922 rows:

```sql
INSERT INTO "user_contacts"
  ("user_id", "email", "display_name", "photo_url", "integration_id", "updated_at")
VALUES ($1,$2,$3,$4,$5,$6), ($7,$8,$9,$10,$11,$12), ...   -- 6 params per row
ON CONFLICT ("user_id", "integration_id", "email")         -- 0 params
DO UPDATE SET "display_name" = COALESCE(EXCLUDED."display_name", ...)
```

### Chunk at the layer that owns the arithmetic

The instinct is to chunk at the call site holding the big array. What I'd do differently now is chunk inside the method that builds the statement, since it's the only layer that knows the params-per-row count, and every caller inherits the fix instead of each one having to remember. In our case four call sites shared one `bulkUpsert`; the bootstrap path was the one that had never been chunked, and it was the one that blew past the ceiling.

Guarding the split keeps the common small-batch case emitting a single statement:

```ts
const MAX_ROWS_PER_STATEMENT = 1000; // 6 x 1000 = 6,000 params

if (rows.length > MAX_ROWS_PER_STATEMENT) {
  const out: Ref[] = [];
  for (const batch of chunk(rows, MAX_ROWS_PER_STATEMENT)) {
    out.push(...(await this.bulkUpsert(userId, batch, opts, manager)));
  }
  return out;
}
```

Two properties are easy to lose here. Pass the caller's transaction handle (`manager`) through to every chunk, so a transactional caller keeps atomicity across the split. Without it you've quietly converted one atomic statement into N independent ones. And keep the `ON CONFLICT` clause, which is what makes a partially-applied split safe to retry for callers outside a transaction.

## When NOT to Batch

Batching adds unnecessary complexity in several cases:

- **Static or small ID sets**: if the list is always under 100 items (a user's own calendars, say), the batching logic and extra round-trips aren't worth it
- **Joins are available**: if the IDs come from another table in the same database, use a `JOIN` or subquery instead of materializing the ID list in the application
- **Write operations**: for bulk `INSERT`/`UPDATE`, use `UNNEST` or `VALUES` patterns instead of `IN` clause batching, and remember the columns × rows arithmetic above. Those statements travel through the same bind message and need their own row-level chunking

## Takeaway

PostgreSQL's wire protocol limits parameterized queries to 65,535 bind parameters, but performance degrades well before that. When using TypeORM's `In([...])` with dynamic ID lists that could grow beyond a few hundred items, batching at 500-1,000 IDs per query worked well for us. It stays inside `find()`, and planning time stayed sub-millisecond, so we never got close to the protocol-level errors sitting at the 65K ceiling.

The part that took me longest to internalize is that the ceiling belongs to the bind message, not the `IN` clause. The same limit shows up in a multi-row `INSERT` or an `ON CONFLICT` upsert, where the count is columns × rows rather than anything that looks like a list. It took three separate encounters before I stopped treating each one as a new bug. Knowing the params-per-row number for a given statement, and chunking in the layer that knows it, is the part that actually generalizes.

## References

- [PostgreSQL Protocol Message Formats - Bind Message](https://www.postgresql.org/docs/current/protocol-message-formats.html)
