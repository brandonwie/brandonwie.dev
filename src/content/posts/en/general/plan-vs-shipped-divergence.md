---
title: Plan-vs-Shipped Divergence Detection on Task Resume
description: 'When resuming a multi-session task, the plan.md written at task start may not reflect what is actually shipped now. Implementations evolve mid-flight, scope shifts, branches merge. A 3-minute pre-flight check prevents hours of executing obsolete work.'
date: 2026-04-30T00:00:00.000Z
updated: 2026-05-06
tags:
  - general
  - process
  - task-resume
  - verify-before-execute
category: general
draft: false
lang: en
expanded: true
references:
  - url: 'https://docs.github.com/en/issues/planning-and-tracking-with-projects'
    title: GitHub — Planning and tracking with Projects
    type: official
  - url: 'https://github.com/brandonwie/3b/commit/46e23c05'
    title: Implementation that diverged from plan.md A-G framing
    type: experience
source_content_hash: 0a9dcc3cfd2296901f35e3b5a63ece8a4e1d664efc0f36389295c9ae78de52c9
---

When resuming a multi-session task, the `plan.md` written at task start may not reflect what's actually shipped now. Implementations evolve mid-flight: design decisions get revised, scope shifts, branches merge. Without a pre-flight check, a resume executes the plan's framing literally — running obsolete tests, restating retired decisions, opening already-merged PRs.

**Trust the repo state, not the plan narrative.** A 3-minute pre-flight prevents hours of executing obsolete work.

## Why plans drift quietly

Four ways plans can mislead a resume:

- **Plan narrative is sticky.** Once a plan says "Path A/B/C decision pending," that framing carries forward into triage outputs, journal Next bullets, and ACTIVE-STATUS Priorities. The framing persists past the reality. By the time of resume, multiple downstream artifacts repeat the outdated framing — easy to mistake for canonical truth.
- **Section labels mislead.** Plan §A, §B, §C may be COMPONENTS of one design (additive) or ALTERNATIVES (exclusive). The reader can't tell without reading every section. The 2026-04-30 wrap-followup case had sections A-G as components, misread (in journal + triage) as A/B/C exclusive options.
- **Branch state lies.** Locally-deleted branches look like "task hasn't started" until you check the merge commit on main. `git branch -a` doesn't surface remote-only branches that were merged + auto-deleted.
- **Tests evolve faster than plans.** Implementation may add unit tests that obsolete plan's manual verification list. Plan-driven resume re-runs manual tests; reality has unit suite covering the same intent.

## Three options, side by side

| Option                         | Pros                                          | Cons                                                                    |
| ------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| Trust plan as-written          | Fast resume; no exploration cost              | Risk of executing obsolete work; high cost on missed-divergence         |
| Re-spec from scratch           | Guaranteed fresh framing                      | Throws away plan's reasoning + decision context                         |
| **Pre-flight check + reframe** | Catches divergence in 3 min; reuses plan core | Requires discipline; user/agent must remember to run it on every resume |

Pre-flight check is cheap (3 min) and high-leverage (saves hours on missed-divergence). Re-spec is overkill for routine evolution; trust-as-written fails on multi-session tasks. The pre-flight reframes the plan in light of reality without throwing away its decision context.

## What "divergence" looks like in practice

Concrete case from 2026-04-30: plan.md from 2026-04-25 said "Phase 5 blocks on Path A/B/C decision." Reality 5 days later:

- Branch `feat/wrap-followup-persistence` no longer existed locally
- Implementation merged to main as commit `46e23c05`
- Design evolved: carry-forward merge (plan §B) was REPLACED by durable-source-only generator (`scripts/regenerate-active-status.js`) for parallel-wrap concurrency safety
- "Path A/B/C" was a misread — sections A-G were components, not alternatives
- 4 of 7 verification tests were already covered by 20 generator unit tests (all green)
- 1 test (carry-forward) was DESIGN-OBSOLETE because the path it tested was intentionally retired

Naive resume would execute all 7 manual tests. ~3 hours wasted.

## The 3-minute pre-flight check

Before treating plan.md as ground truth on resume, run four mechanical checks:

1. **Branch state:**

   ```bash
   git branch --show-current
   git branch -a | grep -i {task-slug}
   git log --oneline main..HEAD       # commits ahead of main
   ```

   - Branch missing locally? → likely already merged
   - Branch exists but no commits ahead? → already merged + branch stale

2. **Commit history on critical files:**

   ```bash
   git log --oneline -15 main -- {plan-mentioned-files}
   # e.g., -- '.agents/skills/wrap/SKILL.md'
   ```

   - Recent commits referencing the task → implementation likely landed
   - No commits → plan still pending

3. **Peek at the actual files:**

   For each `## Critical Files to Modify` entry in plan.md, verify the plan-described changes are present. If the file content matches plan intent → plan is implemented.

4. **Test suite for the area:**

   ```bash
   ls scripts/{task-area}.test.* 2>/dev/null
   node --test scripts/{task-area}.test.js
   ```

   Existing test suite that postdates the plan → implementation evolved past the plan and added its own verification. Map plan tests to existing units before writing new ones.

## Reframe the resume plan

After the pre-flight, the resume plan reframes:

| Plan said            | Reality is                      | Action                                            |
| -------------------- | ------------------------------- | ------------------------------------------------- |
| "Decision pending"   | "Decision was made + shipped"   | Skip decision; verify shipped state               |
| "Implement Phase N"  | "Phase N already merged"        | Skip; verify outputs                              |
| "Run 7 manual tests" | "20 unit tests cover 4+ of 7"   | Map plan tests → unit tests; manual only the rest |
| "Open PR"            | "Already direct-merged to main" | Skip PR step; mark `[-]`                          |

Mark obsolete plan items `[-] superseded` with rationale citing the divergence evidence (commit hash, file location, test name).

## When this fits

The pattern applies on **mid-flight task resume** after >3 days idle, **multi-session tasks** where multiple agents/sessions touched the work, **post-merge close-out** where the task was operationally done before plan's verification phase ran, and **refactor handoffs** where the original plan was outpaced by reality.

It does not apply to **same-session resume** (plan ≈ reality by definition), **greenfield work** (no shipped reality to diverge from yet), or **plan-mode-only sessions** (no implementation to compare against).

## Practical takeaway

Repo state is canonical. Plan.md is a historical record of intent; shipped state is reality. On conflict, repo wins. Divergence is normal, not failure — implementation evolution is healthy. Pre-flight is cheap (3 min); missed-divergence is expensive (hours of executing obsolete tests). Document the divergence in the close so the next resume sees the why. Pair with empirical close — divergence often shifts tests from "manual" to "covered by unit suite" or "obsolete by design," and the remaining un-coverable tests close empirically.

## References

- [GitHub — Planning and tracking with Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [Implementation that diverged from plan.md A-G framing](https://github.com/brandonwie/3b/commit/46e23c05)
