---
title: Pessimistic Locking for Race Conditions
description: Use `SELECT FOR UPDATE` to prevent race conditions when checking for existence
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
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
---

before INSERT.

## The Problem

Check-then-insert pattern without locking:

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

## The Solution: Pessimistic Write Lock

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

## Important Caveat

**`SELECT FOR UPDATE` only locks existing rows.**

If no row exists, both transactions can proceed past the SELECT. Add a safety
net:

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

## Lock Types

| Lock Type | Use Case | Behavior |
| --------- | -------- | -------- |
| `pessimistic_read` | Read-only operations | Blocks writers, allows readers |
| `pessimistic_write` | Modify operations | Blocks all access |
| `pessimistic_partial_write` | Specific columns | TypeORM-specific |

## Alternatives Considered

| Approach | Pros | Cons |
| -------- | ---- | ---- |
| Optimistic locking | No lock contention | Requires retry logic |
| Redis lock | Works across services | Adds dependency |
| Unique constraint only | Simple | Causes errors, wastes API calls |
| **Pessimistic lock** | Standard SQL pattern | Brief lock contention |

## When to Use

- ✅ Preventing duplicate INSERT on same key
- ✅ Critical resources with low contention
- ✅ External API calls after DB check (don't waste API calls)
- ❌ High-frequency concurrent access (consider optimistic)
- ❌ Long-running operations (locks block others)

## TypeORM Implementation

```typescript
// Method 1: QueryBuilder
await manager
  .createQueryBuilder(Entity, 'e')
  .setLock('pessimistic_write')
  .where('e.id = :id', { id })
  .getOne();

// Method 2: FindOptions (less flexible)
await manager.findOne(Entity, {
  where: { id },
  lock: { mode: 'pessimistic_write' }
});
```

## Key Lessons

1. **Lock inside transaction** - Must be within transaction boundaries
2. **No row = no lock** - Add duplicate key error handling as safety net
3. **Keep locks short** - Only lock what you need, release quickly
4. **Document the pattern** - Not obvious to future maintainers
