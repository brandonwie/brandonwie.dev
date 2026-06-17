---
title: Byte-aware vs Count-based Chunking for Typesense documents/import
description: Two chunking strategies for Typesense bulk import. Picking the wrong one silently fails the day a single power user creates a multi-MB document.
date: 2026-04-28T00:00:00.000Z
updated: 2026-04-29T00:00:00.000Z
tags:
  - backend
  - typesense
  - batch
  - search
category: backend
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://typesense.org/docs/27.1/api/documents.html#index-multiple-documents
    title: Typesense — Index multiple documents (documents/import)
    type: official
source_content_hash: e30001ad020655c421f8913a4255af982498b8ada3a25b4276130e0273eeb947
---

The contact-bulk-upsert worker shipped with `CHUNK_SIZE = 500` and ran fine
for months — small fixed-string documents, comfortable headroom under the 40
MB Typesense import cap. Then came the calendar-block worker, same chunking
strategy, and the math broke. A single block can carry a multi-MB rich-text
note, and the moment one chunk crossed the cap, the entire import failed and
the bootstrap stalled. The fix wasn't lowering the count; it was switching
strategies entirely.

## The Two Strategies

Typesense's `documents/import` endpoint accepts a JSON body with a hard cap
(40 MB at the time of writing — verify against your version). Any service
batch-syncing N documents needs a chunking strategy that keeps every HTTP
body under that cap. There are two natural strategies, with very different
failure modes:

| Strategy    | Split by                   | Always safe?             |
| ----------- | -------------------------- | ------------------------ |
| Count-based | Fixed N docs/chunk         | Only if `N×max_doc < cap`  |
| Byte-aware  | Cumulative serialized size | Yes (with safety margin) |

The mistake is defaulting to count-based for everything because "500 docs
felt fine in dev." Then a power user creates a single document with a
multi-MB note, the chunk crosses 40 MB, the entire batch fails, and the
bootstrap never completes.

## When Count-Based Is Fine

Count-based is the right call when ALL of:

- Document shape is uniform (no large free-text or blob fields).
- Worst-case single doc fits with room to spare (e.g., `< 100 KB`).
- Chunk size × worst-case doc size leaves an order-of-magnitude headroom
  below the import cap.

Contacts is the textbook case. Schema is small fixed strings (`email`,
`displayName`, `photoUrl`, `integrationId`). Worst case ~2 KB/doc; 500 × 2 KB
= 1 MB; 40 MB cap. Two orders of magnitude headroom — count-based is fine:

```ts
const CHUNK_SIZE = 500;
for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
  const chunk = emails.slice(i, i + CHUNK_SIZE);
  await queue.add("contact-bulk-upsert", { emails: chunk });
}
// processor:
await typesense
  .collections("contacts")
  .documents()
  .import(docs, { action: "upsert" });
```

## When You Need Byte-Aware

Switch to byte-aware splitting when ANY of:

- Schema has free-text fields (notes, descriptions, embedded markdown).
- Worst-case single doc could approach the cap.
- You can't bound payload size at write time (user-generated content).

Calendar blocks fit all three. A single block's note can be MB-sized. 200
docs × worst-case 200 KB = 40 MB before any single outlier — count-based
would be a coin flip. Byte-aware tracks cumulative serialized size and
splits before the cap:

```ts
import { Buffer } from "node:buffer";

const MAX_IMPORT_BYTES = 30 * 1024 * 1024; // 30 MB — 25 % margin under 40 MB cap

export function splitByByteSize<T extends { id?: string }>(
  docs: T[],
  maxBytes: number = MAX_IMPORT_BYTES
): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const doc of docs) {
    const docBytes = Buffer.byteLength(JSON.stringify(doc), "utf8");

    if (docBytes > maxBytes) {
      // Single-doc overflow — flag and skip; do not silently truncate.
      Sentry.captureMessage("Document exceeds Typesense import byte limit", {
        level: "warning",
        extra: { docId: doc.id, docBytes, maxBytes }
      });
      continue;
    }

    if (currentBytes + docBytes > maxBytes) {
      groups.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(doc);
    currentBytes += docBytes;
  }

  if (current.length > 0) groups.push(current);
  return groups;
}
```

## Pair Byte-Aware with a Count Cap

Pure byte-aware can produce one huge job containing thousands of tiny docs,
which is bad for retry granularity — a single failure forces a re-import of
everything in that group. The robust shape is a count cap at the queue layer
plus byte-aware splitting inside the processor:

```ts
// Listener already capped at 200 IDs/job for retry granularity;
// processor's byte-split handles the long-note tail within those 200.
const groups = splitByByteSize(docs);
for (const group of groups) {
  await typesense
    .collections("blocks")
    .documents()
    .import(group, { action: "upsert" });
}
```

The count cap (e.g., 200 IDs/job) bounds the retry surface; the byte-split
inside handles outliers within those 200.

## Key Points

- **Cap with a safety margin.** 40 MB Typesense cap → use 30 MB budget.
  UTF-16 strings, protocol framing, and gzip header overhead all eat into
  the budget, and the `JSON.stringify` estimate is approximate.
- **Single-doc overflow is its own decision.** If one document already
  exceeds the cap, you have three choices: (1) skip + log, (2) fail the
  batch, (3) truncate field content. Skip + log preserves the rest of the
  batch and surfaces the outlier without corrupting search behavior.
  Truncating silently is the worst — search starts returning incomplete docs
  and nobody knows why.
- **Count cap PLUS byte-aware is the robust shape for variable docs.** The
  count cap (e.g., 200) bounds retry surface; the byte-split inside handles
  outliers.
- **Estimate by `Buffer.byteLength(JSON.stringify(doc), 'utf8')`.** Don't
  use `string.length` — it counts code units, not bytes, and UTF-8
  multibyte chars silently underestimate. Don't use
  `JSON.stringify(doc).length` either, for the same reason.

## Why Count-Based Slips Through Tests

CI seed fixtures and local-dev databases rarely contain the multi-MB docs
that prod accumulates after years of use. A 500-per-job count-based limit
will pass every test and ship; the production bootstrap fails on day one
for a single power user. A useful code review heuristic: any field that
maps to a textarea or markdown editor in the UI is unbounded — use
byte-aware.

## Per-Job vs Per-Import Cap Confusion

A BullMQ job can carry the IDs of N documents to fetch and import. The job
data payload (IDs only) is small; the eventual Typesense HTTP body
(fetched + projected docs) is what hits the cap. Don't mix the two: the
count cap on job data limits retry surface; the byte-aware split inside the
processor limits HTTP body size.

## Sentry Signal Noise on the Single-Doc Overflow Path

Logging every overflow at `error` level floods alerts when a single bad
document recurs across N retries. Use `warning` level + tag
`area: search-integration, issue: oversized_document` so it groups and
suppresses by docId.

## The Caller-Blind Trap

The first version of `splitByByteSize` returned just `T[][]`. Oversized
docs were skipped with a Sentry warning and `continue`. The caller
(`bulkUpsertBlocks`) had no signal — the doc was lost from Typesense
without surfacing in processor logs, and `Bulk upserted N/M blocks`
printed `M = blockIds.length` even when some docs were dropped, hiding
the discrepancy.

PR #858's proactive review flagged it (F-T-3). The return shape evolved
to:

```typescript
export interface SplitByByteSizeResult<T> {
  groups: T[][];
  skippedIds: string[];
}
```

Caller pattern:

```typescript
const { groups, skippedIds } = splitByByteSize(docs);
for (const group of groups) {
  await import(group, { action: "upsert" });
}
if (skippedIds.length > 0) {
  this.logger.warn(
    `Bulk upsert dropped ${skippedIds.length} oversize block doc(s) ` +
      `user=${userId} calendar=${calendarId} blockIds=[${skippedIds.join(",")}]`
  );
}
this.logger.debug(
  `Bulk upserted ${rows.length - skippedIds.length}/${blockIds.length} blocks ...`
);
```

The per-doc Sentry breadcrumb is retained for deep observability;
processor-level tail-warning gives operators a single log line per batch
with full `(userId, calendarId, skippedBlockIds)` context the util can't
see. The `Bulk upserted` debug log subtracts skipped count so the ratio is
honest.

## The Generalizable Lesson

Any utility that silently drops items must surface what was dropped. There
are three reasonable shapes:

| Option        | When                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| Throw         | Caller can't reasonably continue without all items                               |
| Truncate      | Each item has a "shortened but valid" form                                       |
| Drop + report | Items are independent; partial completion is acceptable; caller decides recovery |

`splitByByteSize` uses option 3 because (a) blocks are independent —
dropping one shouldn't block the other 199, and (b) truncating note text
would corrupt search behavior. The return tuple is what makes option 3
honest — without it, the choice degenerates into "silently lose data."

## When to Use

- **Count-based:** uniform-shape collections — contacts, user accounts,
  reference codes, anything with bounded fixed-size fields.
- **Byte-aware (with count cap):** any collection with free-text — notes,
  descriptions, blog posts, comments, support tickets, audit log entries
  with payload field.

## When NOT to Use

- Skip both and use individual `documents().upsert` per doc when the volume
  is naturally small (`< 50 docs` per operation) — chunking adds complexity
  for no throughput win at low volume.
- Skip byte-aware splitting if the only "large" field is bounded
  server-side (e.g., max-length validator at write time). Count-based with
  a generous cap is simpler and fits.

## Takeaway

The strategy choice depends on whether your worst-case document is
bounded. If schema guarantees a small upper bound, count-based wins on
simplicity. If any field is user-generated free text, byte-aware is the
only safe choice — and the moment you skip a doc, surface it back to the
caller so the loss isn't silent.
