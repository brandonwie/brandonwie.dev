---
title: PostgreSQL Advisory Locks with TypeORM
description: Application-level locks managed by PostgreSQL for coordination.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
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
source_content_hash: e56aef5750df9a314e2ffd92a4c5f67d592341fb92e6be63c788bddb2a342979
expanded: true
---

I needed to prevent two calendar sync operations from running simultaneously for the same integration. Row-level locks wouldn't work — there was no shared row to lock on, and the operations spanned multiple tables. PostgreSQL advisory locks were the right fit: application-level locks that live in shared memory, visible across all connections, and automatically released when the connection closes. The catch was making them work correctly with TypeORM's connection pool.

## What Are Advisory Locks?

Unlike row or table locks that PostgreSQL manages automatically, advisory locks are entirely application-controlled. You acquire and release them manually using SQL functions, and PostgreSQL stores them in shared memory rather than tying them to any particular table or row.

| Property     | Value                                            |
| ------------ | ------------------------------------------------ |
| Lock ID      | `bigint` (use entity ID like `integrationId`)    |
| Storage      | PostgreSQL shared memory                         |
| Visibility   | Across all connections (distributed)             |
| Scope        | **Session-scoped** (tied to database connection) |
| Auto-release | Yes, when connection closes                      |

The SQL interface is straightforward:

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

`pg_try_advisory_lock` is non-blocking — it returns `true` if the lock was acquired, `false` if another session already holds it. This is preferable to `pg_advisory_lock` (blocking variant) in most application code, because you can fail fast and return a meaningful response instead of hanging indefinitely.

## The Critical Rule: Session Scope

The most important thing to understand about advisory locks is that they are **session-scoped** — tied to the database connection that acquired them. Only that connection can release the lock:

```text
Lock Table:
┌─────────┬─────────────┬─────────┐
│ Lock ID │ Session/PID │ Granted │
├─────────┼─────────────┼─────────┤
│    5    │    1234     │  true   │ ← Only PID 1234 can release
└─────────┴─────────────┴─────────┘
```

This session-scoping creates a subtle but critical problem when you're using TypeORM with a connection pool.

## The TypeORM Connection Pool Trap

TypeORM's default `dataSource.query()` grabs a random connection from the pool for each call. This means your lock acquisition might run on connection A, but your unlock runs on connection B — and connection B can't release connection A's lock:

```typescript
// ❌ BROKEN for advisory locks
await this.dataSource.query("SELECT pg_try_advisory_lock($1)", [id]);
// Gets random connection from pool each time!
```

The fix is to use a `QueryRunner`, which reserves a dedicated connection from the pool:

```typescript
// ✅ CORRECT for advisory locks
const qr = dataSource.createQueryRunner();
await qr.connect();     // Get dedicated connection
await qr.query(...);    // Always uses same connection
await qr.query(...);    // Still same connection
await qr.release();     // Return to pool
```

Use `QueryRunner` any time you need connection affinity: transactions, advisory locks, or any sequence of SQL statements that must run on the same session.

## Implementation Pattern

The key design decision is storing the `QueryRunner` reference so you can release the lock on the same connection that acquired it. A `Map<number, QueryRunner>` does this cleanly:

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

The `finally` block ensures the connection is always returned to the pool, even if the unlock query fails. Without this, a failed unlock leaks a connection from the pool — and in a production system with limited pool size, that eventually exhausts all available connections.

## Multi-Pod Considerations

In a containerized environment (ECS, Kubernetes), advisory locks work across pods because the lock lives in PostgreSQL, not in application memory:

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

The auto-release on disconnect is a critical safety feature. If a pod crashes mid-sync, you don't need manual intervention to clear the lock — PostgreSQL handles it when the connection drops. This eliminates the need for timeout-based recovery mechanisms.

## Is the In-Memory Map a Problem at Scale?

A common concern: "Won't the in-memory `Map` cause problems when containers scale horizontally?" The answer is no, because acquire and release happen within the same HTTP request on the same container. The `Map` tracks which `QueryRunner` holds which lock during a single request lifecycle. Cross-container coordination is handled entirely by PostgreSQL's session-scoped locking mechanism — the `Map` is an implementation detail that never needs to be shared.

## Common Pitfalls

1. **Using `dataSource.query()` for locks** — gets a random connection each time, breaking the session affinity that advisory locks require
2. **Trying to force-release another session's lock** — impossible by design; only the acquiring connection can release
3. **Relying on timeouts for recovery** — unnecessary, since PostgreSQL auto-releases locks when the connection closes
4. **Connection pool hiding bugs** — with a small pool, you might accidentally reuse the same connection for acquire and release, making broken code appear to work until the pool grows

## Takeaway

PostgreSQL advisory locks give you distributed coordination without external infrastructure (Redis, ZooKeeper). The one rule you can't break: acquire and release must happen on the same database connection. In TypeORM, that means `QueryRunner` — never `dataSource.query()`. Store the `QueryRunner` reference, release it in a `finally` block, and let PostgreSQL's auto-release handle crash recovery.

## References

- [Explicit Locking — PostgreSQL Documentation](https://www.postgresql.org/docs/current/explicit-locking.html)
