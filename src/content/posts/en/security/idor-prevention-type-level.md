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
---

I found a data leak in our NestJS API during manual testing. A request returned another user's content blocks. The root cause was a single question mark in a TypeScript function signature: `userId?: number`. Here is how I fixed it by making the compiler enforce security.

## Why This Matters

Insecure Direct Object Reference (IDOR) is the #1 vulnerability in the OWASP API Security Top 10. It happens when an API lets users access resources belonging to other users by manipulating IDs. The dangerous part is that IDOR vulnerabilities pass all functional tests -- the code works correctly, it just works correctly for the wrong person.

## The Vulnerable Code

The repository method had `userId` as an optional parameter:

```typescript
// BAD: userId is optional — callers can "forget" to pass it
async findByIds(ids: number[], includeDeleted = false, userId?: number) {
  const where = userId ? { id: In(ids), userId } : { id: In(ids) };
  //                     ^^^ optional = easy to skip
}
```

An internal service calling `findByIds([1,2,3])` without userId would return blocks belonging to ANY user. The code compiled. The tests passed. The vulnerability was invisible.

## The Difficulties

Four things made this harder to catch and fix than you might expect.

**Optional parameters hide the vulnerability.** TypeScript treats optional params as valid when omitted. The IDOR only surfaced during manual API testing when a request returned another user's data. Automated tests all passed because they happened to query data belonging to the test user.

**Existing call sites made refactoring scary.** Multiple services already called `findByIds` without userId. Changing the signature to required immediately broke the build in a dozen places, making it feel like the "fix" was causing more problems than it solved.

**Database queries looked correct at a glance.** The conditional WHERE clause (`userId ? {...} : {...}`) appeared intentional -- as if some callers were legitimately supposed to query without userId (like admin operations). It took a careful audit to confirm that no caller should ever skip the userId filter.

**Composite index was underutilized.** Even when userId was passed, the conditional WHERE clause sometimes prevented the query planner from using the `(id, userId)` composite index, causing slow queries that masked the real issue.

## Options Explored

| Option                           | Pros                                                                    | Cons                                                 |
| -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Required parameter (type-level)  | Compile-time safety, no branching in WHERE, always uses composite index | Breaks existing call sites, requires refactoring     |
| Runtime guard (throw if missing) | No signature change, backward compatible                                | Still compiles without userId, error only at runtime |
| Middleware/decorator check       | Centralized enforcement                                                 | Adds indirection, still no compile-time guarantee    |
| Separate admin vs user methods   | Explicit separation of concerns                                         | Method proliferation, more surface area to audit     |

## The Solution

I chose type-level enforcement -- making `userId` a required parameter:

```typescript
// GOOD: Compiler enforces userId — cannot compile without it
async findByIdsAndUserId(ids: number[], userId: number, includeDeleted = false) {
  return this.repo.find({
    where: { id: In(ids), userId },  // always filtered
  });
}
```

The one-time cost of fixing existing call sites is far outweighed by the permanent guarantee that no future caller can accidentally skip the userId filter. The compiler becomes an always-on security reviewer.

## Why Required Beats Optional

| Aspect              | Optional userId               | Required userId                  |
| ------------------- | ----------------------------- | -------------------------------- |
| Compile-time safety | No -- compiles without userId | Yes -- TS error if missing       |
| WHERE clause logic  | Conditional (`if userId`)     | Direct, no branching             |
| Index utilization   | May miss composite index      | Always hits `(id, userId)` index |
| Code review burden  | Must verify every call site   | Compiler does it for you         |
| New developer risk  | May not know to pass userId   | Forced by signature              |

## Method Naming Convention

I also renamed the method to encode the required filter in the name:

```typescript
// Name signals that userId is required
findByIdsAndUserIdWithCalendar(ids: number[], userId: number, ...)

// vs ambiguous name that doesn't hint at userId requirement
findByIdsWithCalendar(ids: number[], ...)
```

When a method name includes `AndUserId`, every developer who reads the code instantly understands that user scoping is intentional and mandatory.

## Why This Works

The fix shifts the security check from runtime to compile time at zero runtime cost. Before, a developer could write `findByIds([1,2,3])` and the code would compile and run -- returning data from all users. Now, `findByIdsAndUserId([1,2,3])` is a compile error. The developer is forced to provide userId before the code can even build.

The design principle is simple: **security constraints should be enforced at the type level, not by convention.** If a function must always filter by userId, make it a required parameter -- not optional with a "please remember to pass it" comment.

## Practical Takeaway

Apply this pattern to any repository method that filters by a user-owned resource -- userId, orgId, tenantId -- where skipping the filter would expose other users' data. It is especially valuable in multi-tenant systems and API endpoints that accept resource IDs from client input.

Do **not** apply it to admin/system operations that legitimately need to query across all users. Create a separate explicitly-named method like `findByIdsAdmin` with appropriate authorization guards instead. Also skip it for public resources with no ownership concept and for read-only aggregations that return statistics rather than individual records.

The key insight: moving from `userId?: number` to `userId: number` is a zero-cost change that converts a runtime security concern into a compile-time guarantee.
