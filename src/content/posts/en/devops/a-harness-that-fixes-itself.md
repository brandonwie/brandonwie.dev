---
title: A Harness That Fixes Itself - And Prunes Its Own Fixes
description: The most expensive agent mistakes are not the dramatic ones.
date: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T00:00:00.000Z
expanded: true
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: en
references:
  - url: 'https://nodejs.org/api/cli.html'
    title: Node.js CLI documentation
    type: official
source_content_hash: 324d4a676c8ae93bc9c3a170c3652d03534a0de8758ea242cdf0ec0c6e8bdbfc
---

They are the repeat mistakes: the wrong command shape, the stale instruction, the
permission workaround, the search path that should have been obvious by now. One
session notices, fixes the immediate problem, and moves on. A week later another
session makes the same mistake because the learning never became part of the
system.

3B treats that as an architecture problem.

Friction is not only a feeling. It is data. If an agent hits a tool footgun,
makes a wrong assumption, finds a missing rule, or gets blocked by permissions,
the system wants that captured while the context is still fresh.

## Capture happens at the moment of pain

The capture surface is intentionally cross-agent.

Codex, AGY, and Claude can all use the same runtime-agnostic script:

```text
node scripts/report-friction.js --target <type> --severity <sev> --description "..."
```

The script validates the target and severity, builds a `[FRICTION]` block, and
appends it to `.agents/buffer.md` through the shared buffer writer. The buffer is
not the final store. It is the capture queue.

That distinction matters. If friction waits until the end of the session, the
agent may forget the exact failure mode. If it goes straight into a permanent
rule, the system overfits to one annoyance. The buffer gives the observation a
place to live until `/wrap` can process it with the rest of the session context.

## `/wrap` turns observations into patterns

During `/wrap`, the friction analysis step reads buffer entries, parses them
into structured observations, groups similar observations, and updates
`.agents/friction-log.json`.

A single observation is not automatically a rule. The default path requires
recurrence: the same kind of friction must appear enough times, across enough
sessions, to prove it is a pattern rather than a one-off mistake. Severe
incidents can skip that waiting period, but ordinary friction has to earn a
fix.

This is the important discipline. A self-improving harness has to resist two
bad instincts at once:

- Ignore friction because it is "just workflow annoyance."
- Turn every annoyance into a rule immediately.

3B sits between those extremes. Capture everything worth remembering. Promote
only what recurs or what is severe enough to justify immediate attention.

## Policy and mechanism are separate on purpose

The friction system has two lifecycle descriptions.

The governance view is simple: observation -> accumulating -> ready -> resolved.
That is the policy story. It says when a pattern is mature enough to consider a
fix and when a fix can be archived.

The operational view is richer because `/wrap` has to run the actual workflow.
It includes states like proposed, applied, verified, dismissed, ineffective, and
strengthened. That is the mechanism story. It describes what happens when the
human says apply, later, dismiss, strengthen, or revert.

At first glance, two lifecycle models can look like drift. In this case the
split is useful. The four-stage model is for rule authors and governance. The
runtime state machine is for the session engine. One explains why a pattern
should graduate. The other explains how the graduation is executed.

## Fixes are proposed, not silently applied

The system can draft fixes. It can prepare diffs. It can show a pattern card
with evidence, recurrence counts, affected target, and proposed improvement.

It still does not silently apply the fix.

That is a load-bearing rule. Friction fixes often touch settings, rules, hooks,
or skill instructions. Those are control-plane surfaces. A bad fix can make
future sessions worse. So the system presents options: apply, dismiss, later,
strengthen, revert. The human remains in the loop.

This is where post #8's gate story and post #9's friction story meet. Gate B
governs risky mutations. The friction lifecycle proposes some of those
mutations. The proposal can be smart; the application is still gated.

## Verification is about recurrence

A friction fix is not proven when the patch lands.

It is proven when the mistake stops recurring.

After a pattern is applied, later `/wrap` sessions watch for new observations
that match the same pattern. If the same friction appears again, the system
increments post-apply recurrence. If recurrence crosses the ineffective
threshold, the pattern is not considered solved. It moves into a strengthening
path.

This is a better model than "we added a rule, therefore done." Rules can be too
weak, too vague, too broad, or pointed at the wrong target. Recurrence is the
feedback signal.

If the verification window passes without recurrence, the pattern can become
verified and eventually move out of the active log.

## The harness also prunes itself

Self-improvement systems tend to accumulate scar tissue.

Every old failure leaves behind one more reminder, one more hook, one more rule,
one more warning. At first that feels safer. Eventually the agent spends more
context on avoiding old mistakes than solving the current problem.

3B counters that with retirement paths.

Resolved and verified friction can move from the active log into an archive, and
later into knowledge if it is still useful as historical context. Applied fixes
can hit sunset review after enough time. Cluster-detection heuristics can be
retired if users dismiss them too often. Known-failure-mode rows can be skipped
when a structural fix makes the failure mechanically impossible.

That last idea matters: not every lesson deserves to stay in the prompt forever.
If a pre-commit hook now blocks the bad state, a warning about remembering not to
do it may be redundant. The machine should not keep paying context for a trap it
can no longer fall into.

## What I would copy

The reusable design is the loop:

1. Capture friction immediately.
2. Store it as structured observations.
3. Promote only recurring or severe patterns.
4. Present fixes with evidence and human choice.
5. Verify by watching for recurrence.
6. Strengthen or revert when the fix fails.
7. Retire active heuristics when they stop earning their cost.

That loop is more important than any individual script.

The lesson is not that agents can autonomously rewrite their own rules whenever
they feel pain. The lesson is that agent pain can become governed evidence. Once
the evidence is durable, the system can decide what deserves a rule, what
deserves a hook, what deserves a knowledge entry, and what deserves deletion.

That is a harness that fixes itself without pretending every fix should live
forever.
