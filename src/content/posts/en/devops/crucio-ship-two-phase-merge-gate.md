---
title: Two-Phase Invocation as a Manual Merge Gate
description: 'When a CI/CD automation skill supports an "all-in-one" mode (`/skill +flag`), the all-in-one mode should be opt-in, not the default. Splitting invocations preserves a meaningful pause point between CI green and the irreversible merge.'
date: 2026-05-05T00:00:00.000Z
updated: 2026-05-06
tags:
  - devops
  - automation
  - ci-cd
  - deployment
  - gating
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://github.com/brandonwie/crucio/pull/138'
    title: 'PR #138 — TF.5.7 Google integration token refresh (the ship case)'
    type: official
source_content_hash: 203e433da9adb3117c78ba17d046a1a1d350d56d5cde89f4552c36d13df5cb34
---

`/crucio-ship` runs three logical phases for a PR-to-prod ship. Each phase has very different reversibility properties, and bundling them into one invocation conflates the easy parts with the irreversible parts.

| Phase | Action                                | Reversibility                        |
| ----- | ------------------------------------- | ------------------------------------ |
| 1     | Dispatch + watch CI on the PR branch  | Read-only                            |
| 1.5   | `gh pr merge --merge --delete-branch` | **Irreversible** (without revert PR) |
| 2     | Dispatch deploy + verify chain fires  | **Production-affecting**             |

The skill supports `+merge` as an arg that runs all three phases in one invocation. Convenient — but it removes the "operator looks at green CI and decides to authorize merge" step. For a portfolio prod environment with manual smoke tests, that gate has real value. The skill itself doesn't need modification — invoking with vs without `+merge` IS the gate.

## Invoke twice, on purpose

The pattern is to invoke twice instead of once with `+merge`:

```text
First invocation:  /crucio-ship       → Phase 1 only (CI dispatch + watch)
                                        → Hard-blocks on red CI
                                        → Reports green/red status
                                        → EXITS

[operator inspects logs, decides to ship]

Second invocation: /crucio-ship +merge → Phase 1 (re-runs — wasteful) +
                                          Phase 1.5 + Phase 2
```

The "Phase 1 re-runs" cost is real but the cycles are cheap (~10min CI run on a small change). For larger CI suites, the skill could grow a `+from=phase1.5` arg to skip already-verified phases, but that's YAGNI for now.

There's an alternative for high-CI-cost cases: instead of re-invoking the skill, manually execute Phase 1.5 + 2 using the loaded skill content as a runbook. This skips the re-CI cost entirely. Trade-off: you're hand-running steps the skill would otherwise script. Fine for an interactive session, not for unattended automation.

## Why the gate is the value

Three reasons this pattern justifies its overhead:

- **High-blast-radius automation should default to multi-step.** The single-shot mode should require an explicit flag, not be the default. Default behavior is what gets used when nobody is paying attention; the safe path should be the default.
- **The gate is the value, not the skill code.** The skill itself doesn't need new code; the invocation pattern provides the gate. Don't conflate "skill design" with "skill use" — sometimes how you call a tool is the design.
- **Cheap re-runs make split-invocation viable.** If Phase 1 cost \$50/run, the re-run penalty would force a different design. Cheap CI is what makes this pattern affordable.
- **Document the split as the recommended path.** Otherwise operators discover `+merge` first, use it once, and never go back.

## What the design got wrong

Two things bit during use:

- **The naming is asymmetric.** `/crucio-ship` (no flag) is "Phase 1 only" and `/crucio-ship +merge` is "all phases." Reading skill docs, it's not obvious that omitting the flag is the gated path. Clearer naming would be `/crucio-ship-check` + `/crucio-ship-execute`, but the flag-based design is already shipped, and renaming a deployed skill costs more than it gains.
- **Re-invoking the skill costs ~10min of CI re-run.** For small changes this is acceptable; for large changes (full test suite) it's not. Workaround: hand-execute Phase 1.5 + 2 from the skill content as a runbook in the same session, skipping the re-CI cost.

## When this fits

Use a multi-invocation split when:

- Production deploys where the operator should consciously authorize the irreversible step (merge, push to main, dispatch deploy).
- Multi-phase automation where intermediate state (CI green) is itself meaningful information the operator wants to inspect.
- Skills with hard-block gates (red CI = abort) — the gate is what you came for; don't bypass it with auto-everything.

Don't bother with the split when the automation is truly low-blast-radius (preview deploys, dev environments, internal tooling — all-in-one is fine), when shipping is unattended/cron-driven (CI bot, Renovate auto-merge — the gate is meaningless when no human is waiting), or when the gate would just be rubber-stamping. If the operator's decision is always "yes, ship," the gate is theater. Either improve pre-merge signals or accept auto-shipping.

## Practical takeaway

For high-stakes automation, opt-in for the all-in-one path and split invocation as the default. The gate between "CI green" and "merge merged" is one of the cheapest places to insert a human check, and a 4-round AI-reviewed PR still benefits from one human "yes, merge now" before the irreversible step. The skill code doesn't need to change — how you call the skill is the design.

## References

- [PR #138 — TF.5.7 Google integration token refresh (the ship case)](https://github.com/brandonwie/crucio/pull/138)
