---
title: 'Empirical Close: Defer Skill-Side Tests to Natural Exercise'
description: 'Some verification tests need a real trigger that no fixture replicates faithfully — interactive prompts, conversation parsing, AskUserQuestion flows. Marking the test [~] empirical-close-pending and trusting the next natural trigger to verify is hygienic when paired with a friction-log reopen.'
date: 2026-04-30T00:00:00.000Z
updated: '2026-08-02'
tags:
  - general
  - process
  - task-management
  - verification
category: general
draft: false
lang: en
expanded: true
references:
  - url: 'https://martinfowler.com/articles/practical-test-pyramid.html'
    title: The Practical Test Pyramid
    type: authoritative
source_content_hash: 76349e064b41c745d3cce01e24d898a32c3a9326d973fb58d002ae9cc5e72f74
---

Some verification tests require a real trigger that can't be unit-mocked: interactive prompts, conversation parsing, AskUserQuestion flows. Three close-out paths exist on these:

1. **Force staging** — stage a fake trigger to fire the test now. Pollutes real session state; staged fixture often diverges from real input shape.
2. **Defer + leave open** — keep the task folder in `actives/`, let it stale-warn at 7d. Risk: forgotten task, dashboard noise.
3. **Empirical close** — mark the test `[~] empirical-close-pending`, archive the task anyway, trust the next natural trigger to verify. Reopen via friction log on regression.

Without an explicit pattern for path 3, tasks with un-mockable tests sit half-closed indefinitely or get force-staged with low-fidelity fixtures.

## Three options, side by side

| Option              | Pros                                           | Cons                                                           |
| ------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Force staging now   | Test green on close; explicit verification     | Pollutes session state; fixture ≠ reality; cost of restoration |
| Defer + leave open  | No artifice                                    | Stale-warns at 7d; dashboard noise; forgotten-task risk        |
| **Empirical close** | No artifice + folder closes + signal preserved | Trust required; needs reopen mechanism                         |

Empirical close wins when the trigger is genuinely natural-only (e.g., a real conversation said "next session: do X" — no fixture replicates that faithfully) AND a friction-log reopen mechanism backs it. The cost is trust calibration; the benefit is task hygiene without low-fidelity tests.

## What broke before the pattern was explicit

Four things made this messy when there was no recognized name for it:

- **Distinguishing from "skip."** `[-]` skipped means decided-not-to-test; `[~]` empirical-close-pending means deferred-to-natural-exercise. Without the distinction, archive looks like give-up.
- **Reopen mechanism is non-obvious.** Without wiring the friction log to catch regressions matching the deferred test's failure mode, empirical close becomes "delete and pray."
- **Trust calibration.** First instance of a path needs explicit verification; empirical applies on later iterations once design is proven. Misapplying empirical to first-build paths skips the foundation check.
- **Tooling drift.** /wrap and /archive-task didn't originally support `[~]` close states; they'd error or treat them as blocking. The pattern needs `close_mode: empirical` + `close_notes:` frontmatter to communicate.

## The four-step pattern

1. **Annotate the test** in the task's `todos.md`:

   ```markdown
   - [~] **Test N — {name}**: empirical close pending (YYYY-MM-DD). {Why no unit
     coverage}. Will exercise on next natural {trigger}. Reopen via friction log
     if {failure mode} occurs.
   ```

2. **Set task frontmatter:**

   ```yaml
   status: completed
   close_mode: empirical
   close_notes: |
     {N/total} done; {M} empirical close pending (Tests X+Y).
     Reopen if {regression signal}.
   ```

3. **Archive normally** via `/archive-task`. Don't keep the folder open waiting for an empirical signal — that's just a stale folder.

4. **Wire the reopen mechanism:** add a friction-log pattern OR a /wrap warning that fires if the regression signal appears post-archive.

A concrete instance from my own tooling repo — the `wrap-followup-persistence-fix` close-out (2026-04-30), where the `/wrap` skill learned to persist follow-ups across sessions and Tests 4+5 shipped deferred:

```markdown
- [~] **Test 4 — Conversation extraction**: empirical close pending
  (2026-04-30). Skill-side (Step 5.65), no unit coverage. Will exercise on next
  natural /wrap that has a conversation-only follow-up. Reopen via friction log
  if Step 5.65 fails to persist a real candidate.
- [~] **Test 5 — Loss audit**: empirical close pending (2026-04-30). Skill-side
  (Step 9). Pair with Test 4 — first time user chooses "Skip" on a real Step
  5.65 candidate, verify Step 9 lists it under "potentially-lost".
```

Plus frontmatter:

```yaml
status: completed
close_mode: empirical
close_notes: |
  17/19 done; 2 [~] empirical-close pending (Tests 4+5). Reopen via
  friction log if Step 5.65 fails on a real conversation-only follow-up.
```

## When it fits

Use empirical close for:

- **Skill-side behavior tests** that need conversation context (e.g., wrap's Step 5.65 conversation extraction needs a real "next session: do X" mid-chat).
- **AskUserQuestion flows** where forcing the prompt + answering it artificially doesn't validate real-world UX.
- **Side-effect tests** where rolling back the side effect is harder than catching a regression in production.
- **Post-merge close** — task done if PR merged + branch gone, regardless of whether final smoke ran (heuristic from 2026-04-30 embed-interview close).

Don't use empirical close for regression-critical paths (payment, auth, data integrity — force the test), security tests (never trust empirical signal here), tests that CAN be unit-mocked (if a mock exists, write the unit test — empirical close is a fallback for the un-mockable), or the first time the path is built (the first instance needs explicit validation; empirical applies on later iterations once the design is proven).

## Practical takeaway

Empirical close is task hygiene, not test laziness. The test still exists — it just runs in production instead of a fixture. The alternative to running the test is forgetting the task exists. Couple every empirical close with a friction-log reopen pattern; without it, empirical close becomes "delete and pray." The post-merge variant (PR-merged + branch-gone = task done) is the same pattern applied to merge-state instead of test-state — both trust durable signal over local certainty.

## References

- [The Practical Test Pyramid (Ham Vocke / Martin Fowler)](https://martinfowler.com/articles/practical-test-pyramid.html)
