---
title: Per-User Transactional Backfill Atomicity
description: >-
  A large data backfill (classify legacy column into new columns) needs a unit
  of atomicity. Per-row single-statement writes give failure isolation but
  produce...
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - backend
  - backfill
  - transactions
  - typeorm
  - postgresql
  - data-integrity
category: backend
draft: false
lang: en
expanded: true
references:
  - url: 'https://typeorm.io/docs/transactions'
    title: TypeORM transactions
    type: official
  - url: 'https://www.postgresql.org/docs/current/tutorial-transactions.html'
    title: PostgreSQL transactions
    type: official
source_content_hash: 7b1df2de167d2e7a64c9ca712196cbc6620f0c062194058498044b134a60b261
---

A backfill that updates several rows for one user needs a clear failure
boundary. One transaction for the entire dataset holds locks too long, while
independent row updates can leave a single user half migrated.

The middle ground is one transaction per owning user. That sounds mechanical
until one row fails validation: should the backfill keep the valid siblings, or
roll the user's entire batch back?

## Choosing between skip-invalid and prevalidate-then-abort

Skipping the bad row maximizes forward progress, but it violates an all-or-
nothing user contract. The user ends in a mixed state, and verification inherits
a long tail of partially migrated owners.

Prevalidating every row and aborting on the first invalid value keeps the
contract honest. One bad row blocks that user until the data is repaired, while
later users can still proceed in their own transactions.

## Carry failure detail across rollback

A typed error can carry row-level failures out of a transaction that no longer
exists:

```typescript
class BackfillValidationError extends Error {
  constructor(readonly failures: FailureDto[]) {
    super('User backfill validation failed');
  }
}

for (const userId of userIds) {
  try {
    const committed = await dataSource.transaction(async (manager) => {
      const rows = await loadEligibleRows(manager, userId);
      const failures = validate(rows);

      if (failures.length > 0) {
        throw new BackfillValidationError(failures);
      }

      return updateEligibleRows(manager, rows);
    });

    totals.updated += committed.updated;
  } catch (error) {
    if (error instanceof BackfillValidationError) {
      totals.usersFailed += 1;
      totals.failures.push(...error.failures);
      continue;
    }
    throw error;
  }
}
```

TypeORM requires every operation in the callback to use the provided
transactional entity manager. Merge per-user counters into the run totals only
after that callback returns; counts created inside a rolled-back transaction
must contribute nothing.

## Preserve concurrency safety and progress

Each update should repeat the eligibility predicate, such as
`new_col_a IS NULL AND new_col_b IS NULL`. If a legitimate concurrent write
wins, `affected === 0` means "skipped because state changed," not transaction
failure.

That predicate also makes reruns idempotent. Completed rows disappear from the
next selection, so the retry mechanism is another run rather than a hand-built
list of IDs.

Iterate over distinct owner IDs in stable order with keyset pagination:

```sql
SELECT DISTINCT owner_id
FROM items
WHERE new_col_a IS NULL AND owner_id > $1
ORDER BY owner_id
LIMIT $2;
```

The cursor advances on the owner ID, not on the shrinking eligibility set.
Permanently invalid users can keep failing without trapping the entire scan on
one page.

Soft-deleted rows need an explicit decision too. TypeORM reads may exclude them
by default while direct updates still reach them. Include or exclude them
deliberately and prove the choice with a test.

## Practical takeaway

Per-owner transactions fit backfills where one owner's rows must move together
and failures should not stop later owners. They are a poor fit for truly
independent rows, where single-statement updates are simpler, or for owners so
large that one transaction would hold locks for too long.

The final completion signal is not "the endpoint ran." It is that no eligible
unmigrated rows remain and every failed owner has an actionable report.
