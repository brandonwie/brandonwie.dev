---
title: State-invariant flag drift — recovery via reconciliation pass
description: 'A boolean lifecycle flag kept getting stuck on entries that could never reach the code path that clears it. Symptom-only fixes recurred. The durable fix was a third workflow that enforces the invariant the flag implies, independent of how the flag got set.'
date: 2026-04-25T00:00:00.000Z
updated: 2026-06-07
tags:
  - devops
  - sync
  - data-lifecycle
  - state-invariant
  - drift-recovery
  - defense-in-depth
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://martinfowler.com/eaaCatalog/identityField.html'
    title: >-
      Patterns of Enterprise Application Architecture — state lifecycle
      discipline
    type: authoritative
source_content_hash: a475945c106937b2d998c5181e9a28c32b1e7450babba77b85236dc02c00d164
---

A boolean lifecycle flag (`needs_resync: true`) was getting stuck on entries that could never reach the code path that clears it. The flag was set by one workflow (`/wrap`) and cleared by another (`sync-from-3b.ts`), but the clearer was gated by a precondition the setter did not check (`ready: true`). Entries with `ready: false` accumulated the flag forever.

Six entries showed the symptom on the first inspection. A manual `git checkout` reverted the frontmatter and the count went to zero. Five days later the count was twelve — the same setter ran again, against a wider set of entries this time. Manual cleanup is treating a symptom; the durable fix has to live somewhere the setter and the clearer cannot independently violate.

## Why one-sided fixes did not stick

Two distinct setters in two different code paths produced the same stuck state. Tightening the setter on one path left the other path untouched, so a portion of the drift continued. The clearer's gate was correct — `ready: true` is a real precondition for sync — but the setter's contract did not reflect that the clearer would refuse to run otherwise.

The bug is structural: the setter and clearer evolved on different schedules, and the implicit contract between them ("if I set this flag, the clearer will eventually clear it") quietly broke when the clearer added a stricter gate. Patching either side is a single-source repair on a multi-source bug.

## The reconciliation pass

The durable fix is a third workflow whose only job is to enforce the **state invariant** that the flag implies, independently of how the flag got set. This is defense-in-depth at the data layer, not the workflow layer.

For `needs_resync: true` the invariant is:

> "Re-sync" is meaningful only if there was a prior sync. Therefore the flag implies `published_at` is non-null. If `published_at` is null, the flag is logically impossible and can be cleared without consulting the setter.

A second invariant covers the "already up to date" case:

> If the local synced post's `source_content_hash` matches the source's current cleaned-body hash, the source has not drifted. Re-sync would be a no-op. The flag can be cleared.

Both invariants are encoded in a `--reconcile` mode that walks the source tree, applies them, and writes back. Idempotent. Safe to re-run.

The pass is opt-in. It does not run during normal sync — it is operator-initiated maintenance, not part of the hot path. Running it during normal sync would conflate "is this safe to clear" (a structural question) with "should we sync this now" (an editorial question), and the two have different failure modes.

## What broke during implementation

Three concrete things tripped the first draft — and a fourth surfaced weeks later, during a routine audit:

- **YAML round-trip serialization corrupted unquoted strings.** The first draft used `stringifyYaml(frontmatter)` to write back. Unquoted strings containing `#` (for example, `context: PR #103 Round 1...`) got truncated at the `#` because YAML treats it as a comment marker. The lesson is documented separately in `general/yaml-serializer-unquoted-hash-corruption.md`.
- **Surgical regex on the frontmatter substring beat YAML round-trip.** Replacing the round-trip with a scoped regex that flips a single key reduced diff size from 348 lines to 12 lines (1 per file), and body content stayed byte-identical regardless of unquoted special characters. The general principle: when the field set is fixed and small, point edits avoid the round-trip blast radius entirely.
- **`replace_all: true` matched one of two near-identical write blocks.** The two blocks sat at different nesting depths — 3 tabs vs 4 tabs — and indent-sensitive matching caught one site while silently missing the other. The defense is mechanical: always grep after `replace_all` to verify the expected match count.
- **Counting the drift by grepping the flag over-counted.** Running `grep -rl "needs_resync: true"` across the knowledge base flagged five files — but four were entries that _describe_ the flag (this post among them), so the string matched their body prose, not any real frontmatter field. Only one was a genuine stuck flag. In a knowledge base that documents its own metadata, a raw string grep can't separate a live field from a sentence about that field; scoping the scan to the frontmatter block — for example `awk '/^---$/{c++; next} c==1'` — before counting is the fix.

## When this approach helps

This pattern fits when:

- A sync system has a metadata field that toggles between two states and the toggling logic is split across multiple workflows.
- The clearer's preconditions are stricter than the setter's, leaving states that cannot be cleaned by normal flow.
- Manual cleanup keeps recurring. Recurrence is the strongest signal that the bug is system-level, not operator-level.

It does not fit when the drift is single-source and can be fixed by tightening the setter alone — adding a reconcile pass is overkill if the bug is in one place. It also does not fit when the metadata field has external consumers that depend on the stuck state for semantic reasons. Verify the invariant is truly invariant before encoding it.

## Practical takeaway

A stuck-state flag means the setter and clearer have diverged. The fastest durable fix is a third workflow that enforces the invariant the flag implies — not patching either setter or clearer alone. Encode the invariant explicitly so it cannot be silently violated by a future workflow change. Mark the cleanup workflow as opt-in. Pair the data-layer fix with an instruction-layer fix at the setter (a checklist, not a prose precondition) to prevent new drift; the reconcile pass is a safety net, the setter checklist is the front line.

## References

- [Patterns of Enterprise Application Architecture — state lifecycle discipline](https://martinfowler.com/eaaCatalog/identityField.html)
