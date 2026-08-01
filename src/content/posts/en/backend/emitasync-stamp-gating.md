---
title: emitAsync Stamp Gating for Idempotent Bootstrap Retries
description: A bootstrap that emits sync to a queue then stamps "done" silently strands downstream when Redis blips. emitAsync gates the stamp on enqueue admission.
date: 2026-04-28T00:00:00.000Z
updated: "2026-08-02"
tags:
  - backend
  - nestjs
  - eventemitter2
  - bullmq
  - idempotency
category: backend
draft: false
lang: en
expanded: true
references:
  - url: "https://github.com/EventEmitter2/EventEmitter2#emitteremitasyncevent--eventns-arg1-arg2-"
    title: "EventEmitter2 — emitter.emitAsync"
    type: official
  - url: "https://www.postgresql.org/docs/current/protocol-message-formats.html"
    title: "PostgreSQL — Bind message format (Int16 parameter count)"
    type: official
  - url: "https://docs.bullmq.io/guide/queues/adding-bulks"
    title: "BullMQ — adding jobs in bulk"
    type: official
source_content_hash: 3285f906bc61fcf8432b700b6ac14e8c87bbbc1e5fcc08379f6136bd030952a7
---

A bootstrap path I worked on wrote rows to Postgres, fired off per-row events
to a queue listener, then stamped a `syncedAt` sentinel. The code looked
correct. But when Redis blipped, the listener's `queue.add` rejected into the
void — the emit was synchronous fire-and-forget, so the promise was detached —
and the stamp landed anyway. The next call short-circuited on the stamp, never
re-fanned-out, and the downstream search index stayed empty. Users searched and
got zero results with no exception surfaced anywhere.

## How the Silent Failure Plays Out

A bootstrap path that fans out to a queue and writes a "done" sentinel
afterwards has a silent failure mode when the emit is sync fire-and-forget:

1. Service writes rows to DB.
2. Service loops `eventEmitter.emit('topic', evt)` per row. `emit` is sync
   and does NOT await listener returns. The listener does
   `await queue.add(...)`, but that promise is detached.
3. Service writes `bootstrapped_at = now()`.
4. Listener's `queue.add` rejects (Redis unreachable). The promise rejects
   to nowhere; the service has already committed the stamp.
5. Next request sees `bootstrapped_at IS NOT NULL`, short-circuits to "read
   from local state", and never re-fans-out. The downstream system (search
   index, cache, audit log) is permanently stale for those rows.

The DB rows are correct and the sentinel is set, but downstream has nothing
in it, and nothing throws. The bug only shows up when a user later searches
and gets zero results, by which point logs from the original Redis blip are
long gone.

## The Solution: Make the Emit Awaitable

Use `EventEmitter2.emitAsync` and gate the sentinel write on its resolution.
The contract becomes: the stamp only lands if every listener's returned
promise resolved. Any rejection anywhere leaves the stamp un-set, so the
next call retries the whole bootstrap.

The examples below are a stripped-down version of the shape, with neutral
names — a per-tenant sync source whose rows have to reach a queue before the
"synced" stamp is allowed to land.

### Step 1: Publisher exposes an `*Async` variant

```ts
@Injectable()
export class RecordEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  // Sync fire-and-forget — fine for hot paths where caller doesn't care
  publishRecordUpserted(tenantId: number, recordId: string): void {
    this.eventEmitter.emit("record.upserted", { tenantId, recordId });
  }

  // Awaited — caller blocks until every listener's returned promise resolves
  async publishRecordsBulkUpsertedAsync(
    tenantId: number,
    sourceId: number,
    recordIds: string[]
  ): Promise<void> {
    await this.eventEmitter.emitAsync("record.bulk.upserted", {
      tenantId,
      sourceId,
      recordIds
    });
  }
}
```

`emitAsync` collects the listeners' return values through `Promise.all`, so
it resolves to an array of whatever each listener returned. Reject anywhere
in any listener and the whole thing rejects.

### Step 2: Caller awaits the emit, then stamps

```ts
async syncFromProvider(source: SyncSource): Promise<void> {
  const records = await this.provider.fetchRecords(source.id);
  if (records.length > 0) {
    await this.recordsService.bulkUpsert(source.tenantId, records);
    // Awaited — if the listener's queue.add rejects, this rejects, the stamp
    // below never runs, recordsSyncedAt stays NULL, and the next call retries
    // the whole bootstrap.
    await this.recordEvents.publishRecordsBulkUpsertedAsync(
      source.tenantId,
      source.id,
      records.map((r) => r.id),
    );
  }
  // Only lands if the emit succeeded — gates the sentinel on enqueue admission
  await this.sourceRepo.update(
    { id: source.id },
    { recordsSyncedAt: new Date() },
  );
}
```

### Step 3: Listener does its work inside an awaited handler

```ts
@OnEvent('record.bulk.upserted')
async onRecordsBulkUpserted(evt: RecordsBulkUpsertedEvent): Promise<void> {
  if (evt.recordIds.length === 0) return;
  await this.queue.addBulk(/* N chunked jobs */);
}
```

Returning the promise (or `await`ing inside an `async` handler) is what
makes `emitAsync` actually wait. A handler that swallows the promise
(`void` return, fire-and-forget inside) defeats the gating.

## Key Points

- **Gating contract:** sentinel writes only land if `await emitAsync`
  resolves. Any rejection in any listener leaves the sentinel un-set, so the
  next call retries.
- **Idempotency is mandatory.** The retry has to be safe, so `bulkUpsert`
  needs `ON CONFLICT DO UPDATE` and the downstream writes need upsert
  semantics rather than plain inserts. Without idempotency, retry creates
  duplicates instead of healing the gap.
- **Transience is mandatory too.** This is the precondition I never wrote
  down. "Un-stamped gate, so the next call retries" only heals if the next
  call can plausibly succeed. Redis being unreachable qualifies. A
  deterministic failure does not: the gate then re-runs the identical doomed
  work forever. Idempotency and transience are separate requirements, and I
  only checked the first one.
- **Naming convention.** The `*Async` suffix on the publisher method signals
  that callers must `await`. Sync `publishX` and async `publishXAsync` can
  coexist on the same publisher, since different call sites care about
  different things.
- **Empty payload edge case.** Skipping the emit on empty input is the
  easy half, since there is no work to enqueue. Whether to still stamp is
  the harder half. Stamping on empty avoids a pointless re-fetch when the
  source genuinely has no data; not stamping forces a retry that will also
  fan out nothing. Either is defensible; pick one and write the choice
  down.

## Listener-Side Swallowing Breaks the Gate Silently

If any `@OnEvent` handler is declared `async` but its body fires
`queue.add` without `await`, the handler returns `undefined` immediately
and `emitAsync` sees a resolved listener even though enqueue is in flight.
Worse: a post-resolve rejection becomes an unhandled rejection with no
visible error on the gating path.

The fix is mechanical: every awaited-emit handler has to `return await`
(or just `await`) the work it depends on. A unit test that mocks
`queue.add` to reject and asserts the publisher's `*Async` method rejects
is what pins the contract in place.

## A Deterministic Failure Turns the Gate Into a Permanent Loop

Three months after shipping this pattern, the same bootstrap path produced
the exact silent-staleness bug the gate was written to prevent, reached
from the other side. That one surprised me, because the gate itself never
misbehaved.

`bulkUpsert` built a single `INSERT ... ON CONFLICT` binding six params per
row, so any source above 10,922 rows exceeded Postgres' 65,535
bind-parameter ceiling and threw. That ceiling is not a tunable: the wire
protocol's Bind message counts parameters in an `Int16`, so one statement
can never carry more. And that throw is *deterministic*: same input, same
failure, every time. The gate did precisely what it promised.
`recordsSyncedAt` stayed `NULL`, so the next call retried, and the retry
re-fetched from the upstream provider and threw again. Every request,
indefinitely.

What made it invisible was the caller's error isolation, which read as
correct on its own:

```ts
// Degrade to an empty wrapper so one broken source can't 500 the endpoint
const result = await this.bootstrapOne(tenantId, sourceId, source).catch(
  (err) => {
    this.logger.error(`Bootstrap failed for tenant=${tenantId}: ${err.message}`);
    return { tenantId, sourceId, label: source.label, records: [] };
  },
);
```

Composed with the gate, those two reasonable pieces produce a state no
reviewer of either one would predict: affected tenants get zero records
forever, every request burns a full upstream fetch, and the only trace
is a log line that reads like a transient blip precisely because it recurs
so often.

The fix I landed on kept the gate and went after the determinism instead,
chunking the upsert so the bind-parameter ceiling stops being reachable.
Two diagnostics look worth building in from the start, and I wish they had
been there:

- **Count the retries.** A gate that has left the same sentinel un-set N
  times for the same key is reporting a deterministic failure rather than a
  flaky dependency, and logging at a higher severity past a small N would
  have made this loud.
- **Ask whether the catch can distinguish.** A `catch` that degrades
  identically for "token expired" (transient, user-fixable) and "input too
  large for one statement" (deterministic, code bug) has erased the exact
  distinction the gate depends on.

## Multiple Listeners on the Same Topic

`emitAsync` waits for ALL listeners. If you add a downstream consumer
(e.g., analytics) that does slow IO inside the same handler, every
bootstrap call now blocks on it. Either move slow consumers to a
different topic or fire them on a separate sync `emit` from inside the
awaited handler so the listener-of-listeners decoupling is explicit.

## Wrapping in a TypeORM Transaction Is Usually Not the Answer

A common impulse: "make the DB write + sentinel atomic in a txn." For
the bootstrap case there's typically only one DB write before the emit,
so the txn wraps a single statement (already atomic via Postgres
autocommit). The real bug is sequencing (sentinel between writes), not
atomicity. A txn doesn't fix the gating problem, and it adds a
long-running transaction holding row locks across an `await` to a queue
server, which is bad practice.

## When to Use

- One-shot bootstrap paths where a sentinel decides whether to
  re-fan-out (TTL stamps, "first sync done" flags, materialized-view
  refresh markers).
- Any flow where the upstream side-effect (DB write) must precede the
  downstream side-effect (queue enqueue), but failure of the downstream
  must prevent declaring "done".
- Multi-listener fan-outs where all listeners must succeed before the
  caller can claim the operation completed.

## When NOT to Use

- Hot-path single-emit fire-and-forget, where `emit` stays the right
  call for low-latency cases, provided the listener failure is
  recoverable by other means (e.g., per-row retry from a poll loop).
- Cases where the listener's work is slow and the caller can't afford
  to block on it. Split those into a fast acknowledgement listener + a
  separate slow worker.
- When you have no idempotent retry path, since gating without idempotency
  just trades one bug (silent stale state) for another (duplicate rows
  on retry).
- When the failure on the gated path is deterministic rather than
  transient. An un-stamped gate only heals a gap the next call can
  plausibly close, so a failure that reproduces on identical input turns
  the gate into a permanent retry loop instead (see "A Deterministic
  Failure Turns the Gate Into a Permanent Loop" above).

## Takeaway

Sync emit + post-emit stamp is one of those patterns that looks correct
in code review and survives every happy-path test. The bug only appears
when an external dependency blips at exactly the wrong moment. `emitAsync`
plus listener `await` plus stamp-after-emit composes a gate that turns
that silent failure into a clean retry, assuming the bootstrap path is
already idempotent. The part I'd add now: also check that the failures
you're gating against are actually transient. A retry loop only heals a
gap it can eventually close, and I found that out the slow way.
