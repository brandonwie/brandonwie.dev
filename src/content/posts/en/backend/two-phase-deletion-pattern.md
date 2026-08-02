---
title: Two-Phase Deletion Pattern
description: A safe deletion pattern for systems with no rollback — soft-delete first, hard-delete only after the external API confirms.
date: 2026-01-26T00:00:00.000Z
updated: "2026-08-02"
tags:
  - backend
  - architecture
  - data-integrity
  - patterns
category: backend
draft: false
lang: en
expanded: true
source_content_hash: 4dabaca8d6ed67c397a15b33910f1b0d77557f87a3dc2d6c6a16978e51177e4b
references:
  - url: "https://typeorm.io/docs/working-with-entity-manager/repository-api/"
    title: Repository APIs — TypeORM Documentation
    type: official
  - url: "https://typeorm.io/docs/working-with-entity-manager/find-options/"
    title: Find Options — TypeORM Documentation
    type: official
---

Deleting a row is easy. Deleting a row that also has to disappear from someone
else's system is not, because the second half can fail after the first half has
already committed.

## The Problem

When a record must also be removed from an external service — a calendar
provider, a payment processor, a CRM — an immediate hard-delete is a bet on a
network call you have not made yet:

```typescript
// ❌ RISKY: no recovery if the external call fails
async deleteEntry(id: number) {
  await this.entryRepo.delete(id);          // gone from the database
  await this.calendarApi.deleteEvent(id);   // ...what if this throws?
}
```

There is no rollback to reach for: the transaction already committed. The local
row is gone, the remote event is still there, and nothing left in the system
remembers that the two were ever connected.

## The Solution: Soft-Delete, Then Confirm

### Phase 1: soft-delete (service layer)

Mark the record as tentatively deleted and hand the external call to a queue:

```typescript
async deleteEntry(id: number) {
  const entry = await this.entryRepo.findOneByOrFail({ id });

  // soft-delete: sets the delete timestamp, keeps the row
  await this.entryRepo.softRemove(entry);

  // the external call happens out of band
  await this.eventQueue.add('delete', { entryId: id });
}
```

The caller sees the record disappear immediately. The row is still there.

### Phase 2: hard-delete (queue processor)

Only once the external API confirms does the row actually go:

```typescript
async processDelete(job: Job) {
  const entry = await this.entryRepo.findOne({
    where: { id: job.data.entryId },
    withDeleted: true, // soft-deleted rows are excluded by default
  });

  await this.calendarApi.deleteEvent(entry.externalEventId);

  await this.entryRepo.delete(entry.id);
}
```

Two ORM details carry the ordering here, and they are worth naming because
forgetting either one breaks the pattern quietly. `softRemove` writes a delete
timestamp instead of issuing a `DELETE`
([TypeORM repository API](https://typeorm.io/docs/working-with-entity-manager/repository-api/)),
and `withDeleted` is what lets the processor find the row again — soft-deleted
entities are left out of `find` results by default
([TypeORM find options](https://typeorm.io/docs/working-with-entity-manager/find-options/)).
Without `withDeleted`, the job looks up its own record and sees nothing.

If the external call fails, the job retries, and the row is still there to retry
against. That is the entire reason for the ordering.

### A safety net, which is not a third phase

Queues drop jobs. Processes get killed between the API call and the hard-delete.
So a periodic reconcile sweeps up rows the queue never finished with:

```typescript
async reconcile() {
  const orphans = await this.findOrphans();
  for (const orphan of orphans) {
    this.logger.warn('Orphan detected', { id: orphan.id });
    await this.entryRepo.delete(orphan.id);
  }
}
```

The log line matters more than the delete. A rising orphan count is the signal
that the queue path is broken; without it, the sweep silently hides the failure
it exists to clean up after.

## Flow Diagram

```text
Request → Service layer (soft-delete) → Queue job
                                             ↓
                                      Queue processor
                                             ↓
                                     External API OK?
                                     /              \
                                   Yes               No
                                    ↓                ↓
                              Hard-delete      Retry / alert
                                    ↓
                            Reconcile sweep (safety net)
```

## When to Use

| Scenario                     | Use two-phase?        |
| ---------------------------- | --------------------- |
| External API must also delete | ✅ Yes                |
| Database-only delete          | ❌ No (direct delete) |
| No rollback mechanism         | ✅ Yes                |
| Critical user data            | ✅ Yes                |

## Key Implementation Details

### Soft-delete vs. a status field

Soft-delete hides a row from every default query, which is usually what you
want. Recurring series are where that assumption fails.

A cancelled occurrence of a repeating event is not an absent record — it is a
record whose entire job is to say "this one is off". Soft-delete it and the
series renders as though the cancellation never happened, because the row that
carried the cancellation is now invisible to the read path.

```typescript
// A cancelled occurrence has to stay visible to the caller,
// so change its status instead of soft-deleting it.
if (isRecurringException(entry)) {
  entry.status = EntryStatus.Cancelled;
  await this.entryRepo.save(entry);
} else {
  await this.entryRepo.softRemove(entry);
}
```

The rule of thumb I ended up with: soft-delete means "gone, but recoverable"; a
status field means "still here, and its state is part of the answer".

### Orphan detection needs both edges

Deleting one row can strand two different classes of record, and they are found
in different ways:

1. Rows that point at the deleted row as their parent.
2. Rows that reference the deleted external event id from inside a JSON column.

```typescript
// children that point at the deleted row
await this.entryRepo.delete({ parentId: deletedEntryId });

// rows that reference the deleted event id inside a JSON column
await this.entryRepo.delete({
  externalData: { seriesId: deletedExternalEventId },
});
```

The second one is the one that gets missed. A foreign key would have caught the
first class on its own; a reference buried in a JSON payload has no constraint
behind it, so the only thing standing between you and a stale row is remembering
to query for it.

## Key Lessons

1. **Separate the concerns** — the service layer marks, the queue confirms, the
   reconcile sweeps.
2. **Defense in depth** — queue processor plus reconcile means one failure is
   not data loss.
3. **Log orphans** — the count is your only visibility into missed cleanups.
4. **Status is not deletion** — different semantics, different read-path
   consequences.
5. **Expect existing bad data** — rows stranded before the pattern existed still
   need a path out.
