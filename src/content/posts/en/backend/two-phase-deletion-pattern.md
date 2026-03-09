---
title: Two-Phase Deletion Pattern
description: A safe deletion pattern for systems without rollback capability where external
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - architecture
  - data-integrity
  - patterns
category: backend
draft: false
lang: en
references:
  - url: 'https://www.postgresql.org/docs/current/sql-update.html'
    title: UPDATE — PostgreSQL Documentation
    type: official
---

API calls must succeed before data is permanently removed.

## The Problem

When deleting data that must also be deleted from an external service (e.g.,
Google Calendar), immediate hard-delete is risky:

```typescript
// ❌ RISKY: No recovery if Google API fails
async deleteBlock(id: number) {
  await this.blockRepo.delete(id);        // Gone from DB
  await this.googleApi.deleteEvent(id);   // What if this fails?
}
```

If the Google API call fails, the data is already gone from the database.

## The Solution: Two Phases

### Phase 1: Soft-Delete (Service Layer)

Mark records as "tentatively deleted" without removing them:

```typescript
async deleteBlock(id: number) {
  // Soft-delete: set deletedAt, keep record
  await this.blockRepo.softRemove(block);

  // Queue the external API call
  await this.eventQueue.add('delete', { blockId: id });
}
```

### Phase 2: Hard-Delete (Queue Processor)

After external API confirms, permanently remove:

```typescript
async processDelete(job: Job) {
  const block = await this.blockRepo.findOne({
    where: { id: job.data.blockId },
    withDeleted: true,  // Include soft-deleted
  });

  // Confirm with external API
  await this.googleApi.deleteEvent(block.gcalId);

  // Now safe to hard-delete
  await this.blockRepo.delete(block.id);
}
```

### Phase 3: Safety Net (Sync Layer)

Cleanup orphans that queue processor missed:

```typescript
async sync() {
  // Detect and clean orphaned records
  const orphans = await this.findOrphans();
  for (const orphan of orphans) {
    this.logger.warn('Orphan detected', { id: orphan.id });
    await this.blockRepo.delete(orphan.id);
  }
}
```

## Flow Diagram

```text
User Request → Service Layer (soft-delete) → Queue Job
                                                  ↓
                                            Queue Processor
                                                  ↓
                                            Google API OK?
                                            /           \
                                          Yes            No
                                           ↓              ↓
                                     Hard-delete    Retry/Alert
                                           ↓
                                       Sync Layer (safety net)
```

## When to Use

| Scenario              | Use Two-Phase?        |
| --------------------- | --------------------- |
| External API required | ✅ Yes                |
| Database-only delete  | ❌ No (direct delete) |
| No rollback mechanism | ✅ Yes                |
| Critical user data    | ✅ Yes                |

## Key Implementation Details

### Soft-Delete vs Status Field

For some entities, soft-delete (`deletedAt`) hides them from queries. But
sometimes you need visibility:

```typescript
// T blocks need itemStatus=Deleted (visible to client)
// NOT deletedAt (hidden from queries)
if (isTBlock(block)) {
  block.itemStatus = BlockStatus.Deleted;
  // Do NOT set deletedAt - client needs to see cancelled markers
} else {
  await this.blockRepo.softRemove(block);
}
```

### Orphan Detection

Track both parent and source relationships:

```typescript
// Gap 1: Direct children (originalId)
await this.blockRepo.delete({ originalId: deletedBlockId });

// Gap 2: Divergence chain (recurringEventId in JSON)
await this.blockRepo.delete({
  googleEventData: { recurringEventId: deletedGcalId }
});
```

## Key Lessons

1. **Separate concerns** - Service layer marks, queue confirms, sync cleans
2. **Defense in depth** - Queue processor + sync layer = double safety
3. **Log orphans** - Visibility into missed cleanups
4. **Status vs deletion** - Different semantics for different use cases
5. **Backward compatibility** - Handle existing bad data incrementally
