---
title: PostgreSQL Advisory Locks with TypeORM
description: Application-level locks managed by PostgreSQL for coordination.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - postgresql
  - database
  - work
category: backend
draft: false
lang: en
references:
  - url: 'https://www.postgresql.org/docs/current/explicit-locking.html'
    title: Explicit Locking — PostgreSQL Documentation
    type: official
---

## Key Properties

| Property     | Value                                            |
| ------------ | ------------------------------------------------ |
| Lock ID      | `bigint` (use entity ID like `integrationId`)    |
| Storage      | PostgreSQL shared memory                         |
| Visibility   | Across all connections (distributed)             |
| Scope        | **Session-scoped** (tied to database connection) |
| Auto-release | Yes, when connection closes                      |

## SQL Commands

```sql
-- Acquire (non-blocking, returns true/false immediately)
SELECT pg_try_advisory_lock(123);

-- Release
SELECT pg_advisory_unlock(123);

-- View active locks
SELECT locktype, objid AS lock_id, pid, granted
FROM pg_locks WHERE locktype = 'advisory';

-- See which connection holds a lock
SELECT l.objid, p.pid, p.application_name, p.client_addr
FROM pg_locks l
JOIN pg_stat_activity p ON l.pid = p.pid
WHERE l.locktype = 'advisory';
```

## Critical Rule: Session Scope

**Only the connection that acquired a lock can release it.**

```text
Lock Table:
┌─────────┬─────────────┬─────────┐
│ Lock ID │ Session/PID │ Granted │
├─────────┼─────────────┼─────────┤
│    5    │    1234     │  true   │ ← Only PID 1234 can release
└─────────┴─────────────┴─────────┘
```

## TypeORM: Connection Pool vs QueryRunner

### Connection Pool (Default) - BROKEN for locks

```typescript
// ❌ BROKEN for advisory locks
await this.dataSource.query("SELECT pg_try_advisory_lock($1)", [id]);
// Gets random connection from pool each time!
```

### QueryRunner (Dedicated Connection) - CORRECT

```typescript
// ✅ CORRECT for advisory locks
const qr = dataSource.createQueryRunner();
await qr.connect();     // Get dedicated connection
await qr.query(...);    // Always uses same connection
await qr.query(...);    // Still same connection
await qr.release();     // Return to pool
```

**When to use QueryRunner:**

- Transactions (must be same connection)
- Advisory locks (must be same session)
- Any operation requiring connection affinity

## Implementation Pattern

Store dedicated QueryRunner per lock in a Map:

```typescript
@Injectable()
export class LockService {
  private readonly lockConnections = new Map<number, QueryRunner>();

  async acquireLock(id: number): Promise<boolean> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    const result = await qr.query(
      "SELECT pg_try_advisory_lock($1) as acquired",
      [id]
    );

    if (result[0]?.acquired) {
      this.lockConnections.set(id, qr); // Store for release
      return true;
    }

    await qr.release();
    return false;
  }

  async releaseLock(id: number): Promise<boolean> {
    const qr = this.lockConnections.get(id);
    if (!qr) return false;

    try {
      const result = await qr.query(
        "SELECT pg_advisory_unlock($1) as released",
        [id]
      );
      return result[0]?.released ?? false;
    } finally {
      this.lockConnections.delete(id);
      await qr.release();
    }
  }
}
```

## Multi-Pod (ECS) Considerations

```text
┌─────────┐      ┌─────────┐      ┌─────────┐
│  Pod A  │      │  Pod B  │      │  Pod C  │
│ Map:{5} │      │ Map:{}  │      │ Map:{}  │
└────┬────┘      └────┬────┘      └────┬────┘
     └────────────────┼────────────────┘
                      ▼
            ┌─────────────────┐
            │   PostgreSQL    │
            │ Lock 5: Pod A   │ ← Source of truth
            └─────────────────┘
```

| Scenario                      | Behavior                                          |
| ----------------------------- | ------------------------------------------------- |
| Pod A syncing, Pod B requests | Pod B's `pg_try_advisory_lock` returns `false`    |
| Pod A crashes mid-operation   | PostgreSQL auto-releases lock (connection closed) |
| Same pod, concurrent requests | Map ensures one QueryRunner per ID                |

## FAQ: Is In-Memory Map Safe?

**Q: Won't using an in-memory Map cause problems when containers scale?**

**A: No.** Acquire and release happen in the **same HTTP request** on the **same
container**. The Map is only for tracking within a single request.
Cross-container coordination relies on PostgreSQL's session-scoped behavior.

## Common Pitfalls

1. **Using `dataSource.query()` for locks** - Gets random connection each time
2. **Trying to force-release another session's lock** - Impossible by design
3. **Relying on timeouts for recovery** - Unnecessary; PostgreSQL auto-releases
   on disconnect
4. **Connection pool hiding bugs** - Smaller pools may accidentally reuse
   connections
