---
title: IDOR Prevention via Required Parameters (Type-Level Enforcement)
description: Insecure Direct Object Reference (IDOR) occurs when an API allows users to
date: 2026-02-11T00:00:00.000Z
updated: '2026-03-22'
tags:
  - security
  - backend
  - typescript
category: security
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
    title: OWASP API Security - Broken Object Level Authorization (BOLA/IDOR)
    type: official
source_content_hash: e2de86c527992b0c7e37eea7ffe108c5335a32ab492a6641a20a8de6c4dcd167
---

I shipped an IDOR vulnerability to production because of a question mark. Not a missing auth check, not a broken middleware -- a single `?` character in a TypeScript function signature that made `userId` optional instead of required. The code compiled, the tests passed, and for weeks a service endpoint could return any user's data to any authenticated caller who knew the right IDs.

This is the story of how I fixed it by making the compiler do the security review.

## What IDOR Looks Like in Code

Insecure Direct Object Reference (IDOR) happens when an API lets users access resources belonging to other users by manipulating IDs. OWASP ranks it as the number one API security risk (they call it "Broken Object Level Authorization"). The classic example is changing `/api/orders/123` to `/api/orders/456` and seeing someone else's order.

In my case, the vulnerability was buried inside a repository method:

```typescript
// BAD: userId is optional — callers can "forget" to pass it
async findByIds(ids: number[], includeDeleted = false, userId?: number) {
  const where = userId ? { id: In(ids), userId } : { id: In(ids) };
  //                     ^^^ optional = easy to skip
}
```

The conditional WHERE clause looked intentional -- as if some callers were supposed to query without `userId` for admin operations. But no caller should have ever skipped the filter. An internal service calling `findByIds([1,2,3])` without `userId` would return blocks belonging to ANY user. That is a data leak.

## Why Optional Parameters Hide Vulnerabilities

The dangerous thing about this bug is how invisible it is. TypeScript treats optional parameters as valid when omitted. There is no warning, no lint error, no test failure. The code compiles cleanly, and every call site that forgets `userId` silently queries across all users.

I discovered the bug during manual API testing when a request returned another user's data. Not through code review, not through automated testing -- through accident.

Making it worse, the conditional WHERE clause sometimes prevented the query planner from using the `(id, userId)` composite index. So on top of the security issue, some queries were slow. The performance problem masked the real issue because the investigation focused on query optimization rather than access control.

## The Options I Considered

Once I understood the problem, I evaluated four approaches:

| Option                           | Pros                                                                    | Cons                                                 |
| -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Required parameter (type-level)  | Compile-time safety, no branching in WHERE, always uses composite index | Breaks existing call sites, requires refactoring     |
| Runtime guard (throw if missing) | No signature change, backward compatible                                | Still compiles without userId, error only at runtime |
| Middleware/decorator check       | Centralized enforcement                                                 | Adds indirection, still no compile-time guarantee    |
| Separate admin vs user methods   | Explicit separation of concerns                                         | Method proliferation, more surface area to audit     |

The runtime guard was tempting because it would not break any existing call sites. But it trades compile-time safety for runtime safety, which is the wrong direction. The whole point is to make the wrong thing impossible to write, not to catch it after it runs.

The middleware approach centralizes the check, but "centralized" also means "easy to bypass if someone adds a new route and forgets the decorator."

Separate methods seemed clean until I imagined auditing a codebase with `findByIds`, `findByIdsAdmin`, `findByIdsAndUserId`, `findByIdsAndUserIdWithCalendar` -- method proliferation makes the surface area harder to review, not easier.

## The Fix: Make the Compiler Enforce It

The answer was the simplest option: make `userId` required.

```typescript
// GOOD: Compiler enforces userId — cannot compile without it
async findByIdsAndUserId(ids: number[], userId: number, includeDeleted = false) {
  return this.repo.find({
    where: { id: In(ids), userId },  // always filtered
  });
}
```

This change did three things at once. First, every call site that omitted `userId` became a compile error. The TypeScript compiler surfaced a dozen places where the filter was missing -- twelve potential IDOR vulnerabilities that had been invisible. Second, the WHERE clause became unconditional, removing the branching logic that confused the query planner. Every query now hits the `(id, userId)` composite index. Third, the method name itself (`findByIdsAndUserId`) signals that `userId` is required. A new developer reading the codebase does not need to check the signature to understand the contract.

| Aspect              | Optional userId              | Required userId                  |
| ------------------- | ---------------------------- | -------------------------------- |
| Compile-time safety | No -- compiles without userId | Yes -- TS error if missing        |
| WHERE clause logic  | Conditional (`if userId`)    | Direct, no branching             |
| Index utilization   | May miss composite index     | Always hits `(id, userId)` index |
| Code review burden  | Must verify every call site  | Compiler does it for you         |
| New developer risk  | May not know to pass userId  | Forced by signature              |

The one-time cost was fixing those twelve call sites. Every one of them needed `userId` anyway -- they were getting it from the auth context and passing it through. The refactoring took an afternoon. The permanent guarantee it provides is worth infinitely more.

## The Refactoring Fear

I want to address the hesitation I felt when I first saw the build break in a dozen places. My gut reaction was "the fix is causing more problems than the bug." That reaction is wrong, and recognizing it matters.

Those twelve compile errors were not problems caused by the fix. They were twelve existing vulnerabilities that the fix made visible. Every broken call site was a place where user data could leak. The compiler was showing me the blast radius of the original bug.

## When to Apply This Pattern

Use type-level enforcement for any repository method that filters by a user-owned resource -- `userId`, `orgId`, `tenantId` -- where skipping the filter would expose other users' data. This covers multi-tenant systems with row-level access control and any API endpoint that accepts resource IDs from client input.

For **admin or system operations** that legitimately need to query across all users (background jobs, reporting), create a separate explicitly-named method like `findByIdsAdmin` with appropriate authorization guards. Do not make `userId` optional to accommodate admin use cases -- that re-introduces the exact vulnerability you are trying to prevent.

Skip this pattern for **public resources** where there is no ownership concept (product catalogs, public posts) and for **read-only aggregations** that return statistics rather than individual records.

## Takeaway

Security constraints belong at the type level, not in conventions, comments, or code review checklists. Moving from `userId?: number` to `userId: number` is a zero-cost change that converts a runtime security concern into a compile-time guarantee. The compiler becomes your security reviewer -- and unlike human reviewers, it never forgets to check.
