---
title: Claude Code Agent Teams
description: Experimental feature for orchestrating multiple Claude Code instances as a
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
tags:
  - ai-ml
  - claude-code
  - agent-teams
  - experimental
category: ai-ml
draft: false
lang: en
references:
  - url: "https://code.claude.com/docs/en/agent-teams"
    title: Orchestrate teams of Claude Code sessions
    type: official
---

I was working on a large refactor that touched frontend components, backend API
routes, and test files simultaneously. Switching between files in a single Claude
Code session meant constant context-switching, and the context window was filling
up fast. I knew I could open multiple terminal tabs, but those sessions could
not share state or coordinate their work. Agent teams solve exactly this problem.

## What Agent Teams Are

Agent teams are an experimental Claude Code feature that lets one session (the
"lead") spawn multiple teammate sessions. Each teammate runs in its own context
window with its own set of tools, but they share a task list and can send
messages to each other.

The key concepts:

- **Lead** -- The main session that creates the team, spawns teammates, and
  coordinates work
- **Teammates** -- Separate Claude instances, each with their own context window
- **Task list** -- Shared work items with states (pending, in progress,
  completed) and dependencies
- **Mailbox** -- Direct messaging between any agents, not just back to the lead

This is different from subagents, which are fire-and-forget. Teammates
collaborate. They can ask each other questions, report blockers, and coordinate
on shared resources.

## When to Use Teams vs Subagents vs Solo

The decision framework is simple:

| Need                                    | Use          |
| --------------------------------------- | ------------ |
| Quick focused task, only result matters | Subagent     |
| Workers need to discuss and collaborate | Agent team   |
| Sequential work, same-file edits        | Solo session |

The best cases for agent teams are: parallel code review (one reviewer per
concern), competing hypothesis debugging (each teammate tests a different
theory), cross-layer coordination (frontend/backend/tests), and independent
module development.

I initially tried using agent teams for tasks that were better suited to
subagents. The coordination overhead of spawning a team, managing the task list,
and monitoring teammate progress was not worth it for quick, focused work. The
rule of thumb: if the task takes less than 5 minutes solo, use a subagent. If
teammates need to talk to each other, use a team.

## Setting It Up

Enable the feature in `settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Choose a display mode:

```json
{
  "teammateMode": "in-process"
}
```

The two modes are `"in-process"` (teammates run in the same terminal, output
interleaved) and `"tmux"` (each teammate gets its own pane). I use
`"in-process"` because it does not require tmux setup, but `"tmux"` is better
for monitoring multiple teammates simultaneously.

## Key Patterns That Work

**Delegate mode (Shift+Tab)** restricts the lead to coordination only. The lead
cannot implement anything; it can only manage the task list and communicate with
teammates. This prevents the lead from becoming a bottleneck by doing work that
should be delegated.

**Plan approval** is a pattern where teammates plan their work in read-only mode
first. The lead reviews the plans, and only after approval do teammates switch to
implementation. This catches misunderstandings early before code gets written.

**Task sizing** matters. Aim for 5-6 tasks per teammate. Too few and the
teammate finishes quickly with idle coordination overhead. Too many and the
context window fills up before the work is done.

**Quality hooks** help prevent premature completion. The `TeammateIdle` hook
tells idle teammates to keep working instead of reporting done. The
`TaskCompleted` hook validates that a task is actually finished before marking
it complete.

## What I Learned the Hard Way

**No session resumption for in-process mode.** If a teammate crashes or the
terminal closes, that teammate's work is lost. I discovered this mid-task after
closing a terminal tab by accident. The work was gone. If the task might take
longer than one sitting, use solo sessions with handoff documentation instead.

**Permission inheritance is all-or-nothing.** Teammates inherit the lead's
permission mode at spawn time. You cannot give one teammate read-only access for
reviewing while another gets read-write for implementing. Everyone gets the same
permissions.

**No nested teams.** You cannot create teams within teams. If your workflow
requires hierarchical delegation (a lead spawning sub-leads who spawn their own
teammates), you need to use manual multi-session coordination instead.

## Limitations

- No session resumption for in-process teammates
- One team per session, no nested teams
- Fixed lead (cannot transfer leadership)
- All teammates inherit the lead's permission mode at spawn
- Split panes require tmux or iTerm2

## Example Prompt

Here is an example of spawning a review team:

```text
Create an agent team to review PR #142. Spawn three
reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

Each reviewer works independently in their own context, reading different parts
of the PR. They can message each other if they find related issues, and they
report back to the lead with their findings.

## When NOT to Use Agent Teams

- **Sequential edits to the same file** -- Teammates cannot safely edit the same
  file concurrently. Use a solo session instead.
- **Quick one-shot tasks** -- If the task takes less than 5 minutes solo, the
  coordination overhead is not worth it. Use a subagent for focused delegation.
- **When you need session persistence** -- In-process teammates cannot be resumed
  if interrupted. Use solo sessions with handoff docs for long-running work.
- **Nested orchestration** -- Cannot create teams within teams. Use manual
  multi-session coordination for hierarchical workflows.

## Practical Takeaway

Agent teams shine when you have genuinely parallel work that benefits from
inter-agent communication. The setup is minimal (one environment variable), but
the real skill is choosing the right tool: solo for sequential work, subagent for
quick fire-and-forget tasks, and teams for collaborative parallel work. Start
with delegate mode to force yourself into the coordination role, size tasks at
5-6 per teammate, and remember that in-process mode has no crash recovery.
