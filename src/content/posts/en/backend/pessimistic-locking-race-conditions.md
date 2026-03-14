---
title: Pessimistic Locking for Race Conditions
description: 'Use SELECT FOR UPDATE to prevent race conditions in check-then-insert patterns, with TypeORM implementation and duplicate key safety nets.'
date: 2026-01-26T00:00:00.000Z
updated: 2026-03-15T00:00:00.000Z
expanded: true
tags:
  - backend
  - database
  - concurrency
  - patterns
category: backend
draft: false
lang: en
references:
  - url: 'https://www.postgresql.org/docs/current/explicit-locking.html'
    title: Explicit Locking — PostgreSQL Documentation
    type: official
source_content_hash: ce731eefb3c4bcf6ff2bf0c77187948689ebaf313a79f953efce5aa3b32d87d1
---

We had a calendar sync endpoint that checked if a channel existed, then created it if not. It passed every test. Then two webhooks arrived at the same millisecond, both checked, both found nothing, and both tried to insert — one succeeded, the other threw a duplicate key error that cascaded into a failed sync.

The classic check-then-insert race condition is one of those bugs that never appears in development (single request at a time) but strikes reliably under production concurrency. This post explains how PostgreSQL's `SELECT FOR UPDATE` prevents it, why it has a subtle gap when no row exists yet, and how to build a bulletproof solution.

---

## The Problem

The check-then-insert pattern without locking looks correct but hides a race condition:

```typescript
// ❌ RACE CONDITION
async createIfNotExists(integrationId: number, calendarId: string) {
  // Both processes check at same time
  const existing = await this.repo.findOne({ integrationId, calendarId });

  if (!existing) {
    // Both processes think it doesn't exist
    await this.repo.save({ integrationId, calendarId }); // DUPLICATE KEY ERROR!
  }
}
```

**Timeline:**

```text
Process A: findOne() → null
Process B: findOne() → null
Process A: save() → success
Process B: save() → ERROR: duplicate key
```

Two processes check for the same record at the same instant. Both find nothing. Both insert. One wins, one crashes. This is a textbook Time of Check to Time of Use (TOCTOU) race condition, and it's invisible in single-threaded development.

---

## The Solution: Pessimistic Write Lock

The fix is `SELECT FOR UPDATE` — a SQL construct that locks the matching row so other transactions must wait before reading it. By wrapping the check-then-insert in a transaction with a pessimistic write lock, the second process blocks at the SELECT until the first process commits:

```typescript
async createIfNotExists(integrationId: number, calendarId: string) {
  return this.dataSource.transaction(async (manager) => {
    // Lock existing row OR wait for lock release
    const existing = await manager
      .createQueryBuilder(Channel, 'channel')
      .setLock('pessimistic_write')
      .where('channel.integrationId = :integrationId', { integrationId })
      .andWhere('channel.calendarId = :calendarId', { calendarId })
      .getOne();

    if (existing) {
      return existing; // Already exists, return it
    }

    // No existing row - safe to insert
    const newChannel = manager.create(Channel, { integrationId, calendarId });
    return manager.save(newChannel);
  });
}
```

The key detail here is `setLock('pessimistic_write')`, which translates to `SELECT ... FOR UPDATE` in the generated SQL. Any other transaction attempting to read the same row with a lock will block until this transaction commits or rolls back.

## Important Caveat

There's a subtle gap in this approach: **`SELECT FOR UPDATE` only locks rows that exist.**

If no row matches the WHERE clause, there's nothing to lock — both transactions pass through the SELECT simultaneously, both find nothing, and both proceed to INSERT. The first one succeeds; the second hits a duplicate key constraint. To handle this, add a safety net that catches the duplicate key error and returns the existing row instead:

```typescript
async createIfNotExists(integrationId: number, calendarId: string) {
  return this.dataSource.transaction(async (manager) => {
    const existing = await manager
      .createQueryBuilder(Channel, 'channel')
      .setLock('pessimistic_write')
      .where('channel.integrationId = :integrationId', { integrationId })
      .andWhere('channel.calendarId = :calendarId', { calendarId })
      .getOne();

    if (existing) return existing;

    try {
      const newChannel = manager.create(Channel, { integrationId, calendarId });
      return await manager.save(newChannel);
    } catch (error) {
      // Safety net: catch duplicate key (Postgres error 23505)
      if (error.code === '23505') {
        return manager.findOne(Channel, {
          where: { integrationId, calendarId }
        });
      }
      throw error;
    }
  });
}
```

This two-layer defense — pessimistic lock for the common case, duplicate key catch for the edge case — is robust against any timing scenario. The lock handles the case where a row exists, and the error handler covers the case where it doesn't.

## Lock Types

PostgreSQL offers different lock modes depending on what you need:

| Lock Type                   | Use Case             | Behavior                       |
| --------------------------- | -------------------- | ------------------------------ |
| `pessimistic_read`          | Read-only operations | Blocks writers, allows readers |
| `pessimistic_write`         | Modify operations    | Blocks all access              |
| `pessimistic_partial_write` | Specific columns     | TypeORM-specific               |

## Alternatives Considered

Pessimistic locking isn't the only way to handle concurrent access. Here's how the common approaches compare:

| Approach               | Pros                  | Cons                            |
| ---------------------- | --------------------- | ------------------------------- |
| Optimistic locking     | No lock contention    | Requires retry logic            |
| Redis lock             | Works across services | Adds dependency                 |
| Unique constraint only | Simple                | Causes errors, wastes API calls |
| **Pessimistic lock**   | Standard SQL pattern  | Brief lock contention           |

## When to Use

Choosing the right concurrency strategy depends on your access patterns:

- ✅ Preventing duplicate INSERT on same key
- ✅ Critical resources with low contention
- ✅ External API calls after DB check (don't waste API calls)
- ❌ High-frequency concurrent access (consider optimistic)
- ❌ Long-running operations (locks block others)

## TypeORM Implementation

TypeORM provides two ways to use pessimistic locking. The QueryBuilder approach gives you more control over the query, while FindOptions is more concise for simple cases:

```typescript
// Method 1: QueryBuilder
await manager
  .createQueryBuilder(Entity, "e")
  .setLock("pessimistic_write")
  .where("e.id = :id", { id })
  .getOne();

// Method 2: FindOptions (less flexible)
await manager.findOne(Entity, {
  where: { id },
  lock: { mode: "pessimistic_write" }
});
```

## Key Lessons

1. **Lock inside transaction** — The `SELECT FOR UPDATE` must be within transaction boundaries. Without a transaction, the lock is released immediately and provides no protection.
2. **No row = no lock** — This is the most critical gotcha. `SELECT FOR UPDATE` only locks rows that exist. If no row matches your WHERE clause, both transactions pass through the SELECT without blocking. Always add duplicate key error handling (Postgres error code `23505`) as a safety net.
3. **Keep locks short** — Pessimistic locks block other transactions from accessing the locked rows. If you hold a lock while calling an external API or doing heavy computation, you create a bottleneck that degrades under load. Lock, check, insert, commit — nothing else inside the transaction.
4. **Document the pattern** — The combination of `SELECT FOR UPDATE` + duplicate key catch is not obvious to future maintainers. A comment explaining _why_ the lock exists prevents someone from "simplifying" the code by removing it.

---

## Practical Takeaways

Race conditions in check-then-insert patterns are invisible in development and reliable in production. The fix is straightforward: wrap the check and insert in a transaction with `SELECT FOR UPDATE`, and add a duplicate key error handler as a safety net for the case where no row exists to lock.

Use pessimistic locking when the operation is critical (you can't afford duplicates), contention is low (a few concurrent requests, not thousands), and the locked section is fast (no external API calls). For high-contention scenarios, consider optimistic locking with retry logic or application-level deduplication with Redis.

The TypeORM implementation in this post works with PostgreSQL. The same SQL pattern (`SELECT ... FOR UPDATE` within a transaction, with `ON CONFLICT` or duplicate key handling) applies to any relational database — only the ORM syntax changes.
