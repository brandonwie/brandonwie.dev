---
title: IDOR Prevention via Required Parameters (Type-Level Enforcement)
description: Insecure Direct Object Reference (IDOR) occurs when an API allows users to
date: 2026-02-11T00:00:00.000Z
updated: 2026-02-11T00:00:00.000Z
tags:
  - security
  - backend
  - typescript
category: security
draft: false
lang: en
references:
  - url: >-
      https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
    title: OWASP API Security - Broken Object Level Authorization (BOLA/IDOR)
    type: official
source_content_hash: cdf1d5b698dffc5e997c32b293c333a38a3c26f5b07acf4dd9ff185426871f26
---

access resources belonging to other users by manipulating IDs.

```typescript
// BAD: userId is optional — callers can "forget" to pass it
async findByIds(ids: number[], includeDeleted = false, userId?: number) {
  const where = userId ? { id: In(ids), userId } : { id: In(ids) };
  //                     ^^^ optional = easy to skip
}
```

An internal service calling `findByIds([1,2,3])` without userId would return
blocks belonging to ANY user — a data leak.

---

## Difficulties Encountered

- **Optional parameters hide the vulnerability**: The code compiled and passed
  tests without userId because TypeScript treats optional params as valid when
  omitted. The IDOR only surfaced during manual API testing when a request
  returned another user's data.
- **Existing call sites made refactoring scary**: Multiple services already
  called `findByIds` without userId. Changing the signature to required
  immediately broke the build in a dozen places, making it feel like the "fix"
  was causing more problems than it solved.
- **Database queries looked correct at a glance**: The conditional WHERE clause
  (`userId ? {...} : {...}`) appeared intentional — as if some callers were
  legitimately supposed to query without userId (e.g., admin operations). It
  took careful audit to confirm no caller should ever skip the userId filter.
- **Composite index was underutilized**: Even when userId was passed, the
  conditional WHERE clause sometimes prevented the query planner from using the
  `(id, userId)` composite index, causing slow queries that masked the real
  issue.

---

## The Solution

```typescript
// GOOD: Compiler enforces userId — cannot compile without it
async findByIdsAndUserId(ids: number[], userId: number, includeDeleted = false) {
  return this.repo.find({
    where: { id: In(ids), userId },  // always filtered
  });
}
```

## Why Required > Optional

| Aspect              | Optional userId              | Required userId                  |
| ------------------- | ---------------------------- | -------------------------------- |
| Compile-time safety | No — compiles without userId | Yes — TS error if missing        |
| WHERE clause logic  | Conditional (`if userId`)    | Direct, no branching             |
| Index utilization   | May miss composite index     | Always hits `(id, userId)` index |
| Code review burden  | Must verify every call site  | Compiler does it for you         |
| New developer risk  | May not know to pass userId  | Forced by signature              |

## Design Principle

**Security constraints should be enforced at the type level, not by
convention.** If a function must always filter by userId, make it a required
parameter — not optional with a "please remember to pass it" comment.

## Method Naming Convention

Encode the required filter in the method name:

```typescript
// Name signals that userId is required
findByIdsAndUserIdWithCalendar(ids: number[], userId: number, ...)

// vs ambiguous name that doesn't hint at userId requirement
findByIdsWithCalendar(ids: number[], ...)
```

---

## Options Considered

| Option                           | Pros                                                                    | Cons                                                 |
| -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Required parameter (type-level)  | Compile-time safety, no branching in WHERE, always uses composite index | Breaks existing call sites, requires refactoring     |
| Runtime guard (throw if missing) | No signature change, backward compatible                                | Still compiles without userId, error only at runtime |
| Middleware/decorator check       | Centralized enforcement                                                 | Adds indirection, still no compile-time guarantee    |
| Separate admin vs user methods   | Explicit separation of concerns                                         | Method proliferation, more surface area to audit     |

## Why This Approach

Required parameter (type-level enforcement) was chosen because it shifts the
security check to compile time at zero runtime cost. The one-time cost of fixing
existing call sites is far outweighed by the permanent guarantee that no future
caller can accidentally skip the userId filter. The compiler becomes an
always-on security reviewer.

---

## When to Use

- Any repository method that filters by a user-owned resource (userId, orgId,
  tenantId) where skipping the filter would expose other users' data
- Multi-tenant systems where row-level access control is enforced at the query
  level
- API endpoints that accept resource IDs from client input (the OWASP BOLA/IDOR
  pattern)

---

## When NOT to Use

- **Admin/system operations** that legitimately need to query across all users
  (e.g., background jobs, reporting). Create a separate explicitly-named method
  like `findByIdsAdmin` with appropriate authorization guards instead.
- **Public/anonymous resources** where there is no ownership concept (e.g.,
  product catalog, public posts).
- **Read-only aggregations** that return statistics rather than individual
  records — these do not expose specific user data even without a userId filter.

---

## Key Insight

Moving from `userId?: number` (optional) to `userId: number` (required) is a
zero-cost change that converts a runtime security concern into a compile-time
guarantee. The compiler becomes your security reviewer.
