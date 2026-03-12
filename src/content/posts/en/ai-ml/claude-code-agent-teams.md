---
title: Claude Code Agent Teams
description: Experimental feature for orchestrating multiple Claude Code instances as a coordinated team with shared task lists and inter-agent messaging
date: 2026-02-09T00:00:00.000Z
updated: 2026-03-09T00:00:00.000Z
tags:
  - ai-ml
  - claude-code
  - agent-teams
  - experimental
category: ai-ml
draft: false
lang: en
expanded: true
source_content_hash: 9ea3366f7947ab7b755380317fc054ed8af36ba0ee932a73f27df255eefedb2c
references:
  - url: "https://code.claude.com/docs/en/agent-teams"
    title: Orchestrate teams of Claude Code sessions
    type: official
---

I needed three independent code reviews running in parallel -- security, performance, and test coverage -- on the same PR. Opening three terminal tabs and copy-pasting context between them felt like managing interns over Slack. Agent Teams let one Claude session act as lead, spawn teammates into separate tmux panes, and coordinate through a shared task list. The idea is compelling. The execution requires knowing where the sharp edges are.

This post documents how Agent Teams work, when they outperform subagents or solo sessions, and every difficulty I hit across weeks of daily use -- including the ones that silently degraded my setup without me noticing.

## What Agent Teams Are

Agent Teams is an experimental Claude Code feature where one session (the lead) creates a team, spawns teammates, and coordinates work through shared infrastructure. Each teammate runs as an independent Claude instance with its own context window.

The coordination primitives are:

- **Lead** -- the main session that creates the team, assigns tasks, and approves work
- **Teammates** -- separate Claude instances spawned into their own panes
- **Task list** -- shared work items with states (pending, in progress, completed) and dependency tracking
- **Mailbox** -- direct messaging between any agents, not limited to lead-teammate pairs

This is different from subagents (the `Agent` tool), which run in the background and return a result. Teammates are persistent, interactive, and can communicate with each other.

## When to Use Teams

The distinction between teams, subagents, and solo sessions matters. Picking wrong wastes time on coordination overhead or leaves performance on the table.

| Need                                    | Use          |
| --------------------------------------- | ------------ |
| Quick focused task, only result matters | Subagent     |
| Workers need to discuss and collaborate | Agent team   |
| Sequential work, same-file edits        | Solo session |

Teams shine for parallel code review, competing hypothesis debugging, cross-layer coordination (frontend + backend + tests simultaneously), and independent module development where workers need to share findings.

## When NOT to Use Teams

Not every parallel workload benefits from the coordination overhead.

- **Sequential edits to the same file.** Teammates cannot safely edit the same file concurrently. Use a solo session instead.
- **Quick one-shot tasks.** If the task takes less than five minutes solo, spawning a team wastes more time on setup than it saves. Use a subagent for focused delegation.
- **When you need session persistence.** In-process teammates cannot be resumed if interrupted. If the task might span multiple sittings, use solo sessions with handoff documentation.
- **Nested orchestration.** Teams cannot create teams within teams. For hierarchical delegation, coordinate multiple solo sessions manually.

## Setup

Two settings are needed. First, enable the experimental feature flag:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Then set the display mode. Options are `"in-process"`, `"tmux"`, or `"auto"`:

```json
{
  "teammateMode": "tmux"
}
```

Both `"tmux"` and `"auto"` should auto-detect iTerm2 via the `it2` CLI, but the iTerm2 backend is broken as of v2.1.74 (issue #24301 -- details below). In practice, split panes only work inside a tmux session. Without tmux, teammates silently fall back to in-process mode -- no error, no warning. **Workaround:** Launch `tmux -CC` in iTerm2 (control mode) to get native iTerm2 panes via the tmux backend.

## Key Patterns

Four patterns emerged from daily use that make teams productive rather than chaotic:

- **Delegate mode** (Shift+Tab) -- restricts the lead to coordination only, preventing it from implementing. This keeps the lead focused on task management and review.
- **Plan approval** -- teammates plan in read-only mode. The lead reviews the plan before authorizing implementation. This prevents wasted work from misunderstood requirements.
- **Task sizing** -- aim for 5-6 tasks per teammate. Fewer tasks underutilize the teammate; more tasks cause context overflow.
- **Quality hooks** -- `TeammateIdle` (keeps teammates working instead of stopping early) and `TaskCompleted` (prevents premature completion claims) act as guardrails.

## Difficulties Encountered

This section is the reason this post exists. The official docs cover the happy path. Everything below was learned through broken sessions, lost work, and head-scratching debugging.

**Experimental and undocumented edge cases.** The feature is marked experimental. Behavior around error recovery, context limits per teammate, and task dependency resolution was learned through trial and error. Documentation covers the basics but not failure modes.

**No session resumption for in-process mode.** If a teammate crashes or the terminal closes, that teammate's work is lost. I discovered this after losing 20 minutes of implementation progress mid-task. There is no checkpoint or recovery mechanism.

**Permission inheritance is all-or-nothing.** Teammates inherit the lead's permission mode at spawn time. You cannot give different teammates different permission levels -- a read-only reviewer and a read-write implementer would need separate permission configs, which is not supported.

**Choosing team vs subagent vs solo.** The distinction is subtle. Early attempts used agent teams for tasks better suited to subagents (quick focused work), wasting coordination overhead on problems that needed a five-second background task, not a persistent collaborator.

**Gitignored symlinks missing in worktrees.** When teammates work in git worktrees, only tracked files appear. Gitignored symlinks (`CLAUDE.local.md`, `.claude/settings.local.json`, `.claude/skills`) are missing. Personal instructions and settings do not load for worktree teammates. The mitigation is putting critical environment variables in user-level `~/.claude/settings.local.json` and front-loading context in spawn prompts.

**iTerm2 `ITermBackend` NOT functional (known bug #24301).** The binary contains an `ITermBackend` with full `it2 session split` support, but the backend selection logic never activates it. With `teammateMode: "auto"` or `"tmux"`, Claude Code silently falls back to `in-process` when not inside a tmux session -- even with `it2` installed, Python API enabled, and all iTerm2 env vars present. Confirmed in v2.1.74 across multiple test cycles. The `teammateMode` setting is snapshotted at session start, so mid-session changes to `settings.json` have no effect. **Workaround:** Use `tmux -CC` (iTerm2 control mode) to get native iTerm2 panes with the tmux backend.

**TeamDelete doesn't kill orphaned tmux panes.** When agents shut down, the tmux pane stays alive as a fresh zsh shell. `TeamDelete` cleans team metadata but not panes. You must manually run `tmux kill-pane -t %<id>` for each orphan. Check with `tmux list-panes -a` after team work to avoid accumulating zombie shells.

**Tmux pane race condition on parallel spawn.** Spawning three or more teammates simultaneously can trigger "not in a mode" errors from tmux `send-keys`. The pane gets created, but the agent fails to start. Retrying individually usually works. Spawning teammates sequentially (with a brief pause) avoids the issue entirely.

**Settings.json reorganization side effects.** The Claude Code UI can reorganize `settings.json` when saving changes, silently altering values like `defaultMode`. Always verify settings after UI-driven changes -- a quick diff against version control catches silent mutations.

**TeamCreate incorrectly removed from instructions.** This one was particularly insidious. A previous session concluded that `TeamCreate` does not exist because it is a deferred tool -- not visible in the tool list until explicitly loaded via `ToolSearch`. The global CLAUDE.md was updated to say "use Agent tool instead," which made all subsequent sessions use background subprocesses instead of split-pane teams. The fix was straightforward: always use `ToolSearch` to check for deferred tools before concluding they do not exist. But the damage was sessions of degraded behavior where I thought teams were working but was getting background subagents instead.

## Limitations Summary

For quick reference, here is the full constraint set:

- No session resumption for in-process teammates
- One team per session, no nested teams
- Fixed lead (cannot transfer leadership)
- All teammates inherit lead's permission mode at spawn
- Split panes require tmux (iTerm2 ITermBackend exists but is broken -- #24301)
- Without tmux, teammates run in-process silently (no error, no split panes)
- Workaround for iTerm2: tmux -CC control mode gives native panes via tmux backend
- TeamDelete does not clean up orphaned tmux panes (manual cleanup needed)
- Parallel spawn race condition with 3+ teammates (retry individually)
- Gitignored files missing in worktrees (teammates lack personal config)
- Deferred tools (like TeamCreate) are invisible until loaded via ToolSearch

## Example Prompt

Here is a prompt that demonstrates the team coordination pattern:

```text
Create an agent team to review PR #142. Spawn three
reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

The lead assigns each reviewer a task, the reviewers work independently in their own panes, and findings flow back through the mailbox for the lead to synthesize.

## Takeaways

Agent Teams solve a real coordination problem: parallel work across a codebase with shared state. The task list and mailbox primitives are well-designed. The rough edges are in infrastructure -- tmux pane management, config parsing, worktree isolation, and the deferred tool visibility problem that can silently downgrade your setup.

The most important lesson: verify your tools exist before concluding they do not. Deferred tools in Claude Code are invisible until you search for them. One bad assumption in one session propagated through my configuration and degraded every subsequent session for days. Check with `ToolSearch`, not with the visible tool list.
