---
title: Multi-Agent Message-Race HOLD Discipline
description: >-
  In mailbox-style multi-agent orchestration (a master session sending orders to
  teammate sessions), messages and work interleave without transactional...
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - ai-ml
  - agents
  - orchestration
  - concurrency
  - claude-code
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://code.claude.com/docs/en/agent-teams'
    title: Claude Code agent teams
    type: official
  - url: >-
      https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
    title: Making retries safe with idempotent APIs
    type: authoritative
source_content_hash: 4e0b6e3756d98634c272ac617afecdb0ebf507f3bb92285816caff6999ce8bb7
---

An async agent mailbox does not provide a transaction around "send an order,
execute it, and receive the report." A HOLD can arrive after a push has already
finished, while a completion message can cross a newer correction in transit.

I hit three versions of that race in one orchestration session. Treating them as
disobedience would have made the situation worse: repeating the command could
have created a duplicate commit or a second history rewrite.

## Model orders as target states

The safest instruction describes the state that must be true, not an action that
must run:

```text
Target: branch contains the fix folded into the feature commit.
Guard: if that state is already pushed, do not rewrite it again.
Verify: report the current commit hash and remote branch hash.
```

This shape is idempotent. A teammate that receives the order twice verifies the
same target twice, but performs the irreversible mutation at most once. AWS
describes the same property for retry-safe APIs: retransmitting a request should
not add another side effect.

## Put the stop guard with the executor

Only the executor knows whether it has already committed or pushed. A lead that
sent HOLD cannot assume the message arrived before the guarded action.

Every irreversible order should therefore include a local precondition:

```typescript
type State = { localHash: string; remoteHash: string; targetHash: string };

function shouldRewrite(state: State): boolean {
  return !(
    state.localHash === state.targetHash &&
    state.remoteHash === state.targetHash
  );
}
```

The exact probe changes by operation, but the pattern stays the same: read live
state, compare it with the target, and no-op when it already converged.

## Verify delivery through state evidence

Silence does not prove that an order arrived. In my case, an amend request was
followed by a report containing the unchanged commit hash. Because an amend
necessarily changes the hash, the report proved that the newer order had not
taken effect.

This is stronger than interpreting the teammate's wording. Compare the reported
artifact with the ordered target: commit hashes, file checksums, PR state, or
test results.

## Sequence overlapping work

Agent teams expose a shared task list and direct teammate messaging, but those
coordination tools do not make simultaneous edits transactional. When two tasks
touch the same file or history, make the dependency explicit: the second task
starts only after the first reports a verified state.

Before reissuing an order that might have raced, probe the repository again. The
correct follow-up is often "state confirmed; stand down," not another execution.

## Practical takeaway

Use this discipline whenever orders and completion reports travel
asynchronously, especially around amend, rebase, force-push, deployment, or
other hard-to-reverse actions. It adds little value to a synchronous single-agent
tool loop where the caller blocks until each operation returns.

Duplicate confirmations are the intended safe failure mode. Two agents agreeing
that the target already exists cost a message; executing the mutation twice can
cost the history.
