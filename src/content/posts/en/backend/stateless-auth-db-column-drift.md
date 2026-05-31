---
title: Stateless Auth DB-Column Drift
description: Auth migrated from stateful to stateless JWT validation. Tests pass. Mobile users have access_token populated; web users have NULL. The drift is invisible until ops queries the column.
date: 2026-04-29T00:00:00.000Z
updated: 2026-04-29T00:00:00.000Z
tags:
  - backend
  - auth
  - database
  - migration
  - stateless
  - knowledge
category: backend
draft: false
lang: en
expanded: true
references:
  - url: 'https://github.com/moba-works/backend-v2/pull/860'
    title: PR #860 — fixing the asymmetry on web flow
    type: official
  - url: 'https://oauth.net/2/access-tokens/'
    title: OAuth 2.0 — Access Tokens
    type: official
source_content_hash: e8f8da0e7e8ece8b8e7558b03bd5769c779db9570da5364782cd9cedec28e801
---

Auth works. Mobile users log in fine. Web users log in fine. Both can
hit protected endpoints. But query `users.access_token` and half are
NULL — exactly the half that came in through the web path. The auth
guard doesn't read the column anymore (stateless JWTs), so the drift
is invisible to user-facing behavior. It only surfaces when ops or BI
queries that column expecting data, and the bug is not in auth — auth
is fine. It's a data-integrity contract drift downstream of the
migration.

## Who, When, Where

This pattern shows up for backend engineers migrating auth from
stateful (DB-stored token compared on every request) to stateless
(JWT decrypted/verified, no DB lookup). It bites during partial
migrations where some code paths are updated but others aren't, OR
when the DB column is "kept for backward compatibility" but write
semantics diverge between paths. Look in any auth subsystem with a
`users.access_token` (or equivalent) column that is no longer
load-bearing for authentication itself.

## What Drifts

When you migrate from stateful auth (guard reads `user.access_token`
from DB and string-compares) to stateless auth (guard decrypts the
JWT, never queries the column), the column becomes functionally dead
— but the writes that populate it usually don't get audited at the
same time. Different code paths end up with different write
semantics:

- **Path A** still writes the freshly issued JWT to the column on
  every login.
- **Path B** stops writing entirely (or preserves the old null value
  via a helper that no longer makes sense).

The auth guard works either way (it doesn't read the column), so the
drift is **invisible to user-facing behavior**. It only surfaces when:

- Ops/BI/Sentry queries the column expecting a non-null value.
- A new feature is added that DOES read the column, finding NULL for
  half the users.
- A future engineer trying to understand auth reads the column
  write-sites and gets a contradictory mental model (mobile writes
  JWT, web preserves null).

## Why It's a Gotcha

Two failure modes hide the drift:

1. **Tests pass.** Auth-flow tests check that login succeeds and the
   user can call protected endpoints. They don't assert
   `users.access_token IS NOT NULL` because the column isn't
   load-bearing. Drift is invisible to the test suite.
2. **The "stateless" comment is half-honored.** Adding a comment
   like `// STATELESS APPROACH — column kept for backward compat
   but not used` to one helper convinces the next reader that all
   writes have been audited. They haven't — only the helper they're
   reading was updated.

## Fix #1: Decide the Column's Fate Explicitly

When migrating to stateless auth, two options:

- **Drop the writes.** All paths stop writing. Add a migration to
  set the column nullable with no default. Delete the column in a
  follow-up after a deploy stabilizes. Document in an ADR.
- **Keep writing consistently.** Every issuance path persists the
  freshly issued token, even though no one reads it. Document the
  intent (audit trail / future feature / parity).

The wrong choice is "ambient" — neither documented nor enforced.

## Fix #2: Audit Every Write Site

Grep for the column name (`access_token`, `accessToken`, etc.) and
inspect every callsite. If the helper that wraps the write changed
semantics — for example, `generateRefreshToken` now preserves
whatever was there instead of writing fresh — every caller of that
helper inherits the change silently.

## Fix #3: Pin the Contract with a Test

Even if the column is "not load-bearing," add an integration test
asserting the chosen contract:

```sql
-- write-consistently contract:
SELECT access_token FROM users WHERE email = 'test@example.com'  → NOT NULL

-- drop-writes contract:
SELECT access_token FROM users WHERE email = 'test@example.com'  → NULL
```

This converts an invisible drift into a CI failure. The test costs
twenty lines and eliminates the entire class of "ops noticed in
production" tickets.

## When You Spot Drift in Production

1. **Check the auth guard first.** If it's stateless (decrypts JWT
   only, no DB read), the drift is contract-level, not auth-broken.
   Triage urgency accordingly — this is not a security incident.
2. **Pick a direction that matches the majority of paths.** If 3 of
   4 paths write JWT, fix path 4 to match. If 1 of 4 writes, drop
   the lone writer. Migrating the minority is cheaper than
   migrating the majority.
3. **Don't backfill unless a downstream consumer actually breaks.**
   Affected rows self-heal on next login; backfill migrations cost
   ops time and risk.

## Why Investigation Lands on the Wrong Layer First

The first instinct is "the auth guard must be reading NULL" — but
stateless guards don't read at all. Time spent tracing the guard is
wasted; the drift is downstream of auth, not in it. The fastest path
to the actual cause is to grep for write sites of the column and
diff their behavior across paths.

## The "By-Design" Comment Misleads

A `// STATELESS — column not used` comment near one write site
implies the whole subsystem agreed. Only the helper that comment
lives next to actually behaves that way. Treat localized comments
as evidence about the local code, not the subsystem-wide contract.

## A Specific Trap: Helper Preserves the Old Value

`generateRefreshToken` accepts no token argument and uses
`user.accessToken` (which is NULL on fresh users). The caller's
freshly generated JWT is never persisted because the helper doesn't
see it. Subtle: the bug is in the helper's signature (no token
parameter) plus its choice of source (DB column instead of fresh
JWT), not in any one obvious line.

## Worked Example

```ts
// auth.service.ts (mobile path) — writes JWT to DB
const mAccessToken = this.getAccessToken(user); // fresh JWT
const mRefreshToken = user.refreshToken || randomUUID();
await this.usersService.updateToken(user.id, mAccessToken, mRefreshToken); // ← writes JWT

// auth-v1.service.ts (web path, before fix) — does NOT write JWT
const mAccessToken = this.getAccessToken(user); // fresh JWT (discarded for DB purposes)
const mRefreshToken = await this.usersService.generateRefreshToken(user.id);
// ↑ helper internally calls updateToken(userId, user.accessToken /* NULL */, refreshToken).
//   Web users end up with users.access_token = NULL.

// Fix: web path mirrors mobile pattern.
const mAccessToken = this.getAccessToken(user);
const mRefreshToken = user.refreshToken || randomUUID();
await this.usersService.updateToken(user.id, mAccessToken, mRefreshToken); // ← now writes JWT
```

The fix is mechanical — make the web path mirror the mobile path
explicitly. The next step (which the ADR should commit to) is
deciding whether the column should exist at all once both paths
agree.

## Key Points

- Stateless auth makes the DB token column **dead for auth** but
  not necessarily for ops/BI/audit.
- A subsystem isn't "stateless" until **every** write site agrees.
  One holdout creates path-dependent drift.
- The bug is invisible to user-facing tests because auth still
  works. CI catches it only if you explicitly assert the column
  contract.
- "Backward compatibility" is not a fix-direction — it's a
  deferral. Pick drop-writes OR write-consistently; document the
  choice in an ADR.

## When to Use

- Auditing a partially-migrated auth subsystem.
- Adding stateless JWT validation but keeping the legacy DB column
  "for compat".
- Onboarding to an auth codebase where some paths persist tokens
  and others don't.
- Investigating ops dashboards that show NULL token columns despite
  users being logged in.

## When NOT to Use

- Pure greenfield stateless auth (no DB column at all — no drift
  possible).
- Pure stateful auth (DB column is load-bearing — drift would break
  login, not just dashboards).

## Takeaway

A migration that works for the auth path can still break the data
contract downstream of auth. The fix isn't more clever code — it's
a deliberate, documented decision about whether the column has a
purpose, applied consistently across every path that touches it,
and pinned by a test that fails the day someone adds a new path
that doesn't get the memo.
