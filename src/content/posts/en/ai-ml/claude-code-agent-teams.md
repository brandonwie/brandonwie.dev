---
title: Claude Code Agent Teams
description: >-
  Experimental feature for orchestrating multiple Claude Code instances as a
  coordinated team with shared task lists and inter-agent messaging.
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-25T00:00:00.000Z
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

## The Problem

Complex tasks often require parallel work across multiple areas of a codebase
(frontend, backend, tests), but a single Claude Code session is limited to one
context window and one file at a time. Manual parallelism (multiple terminal
tabs) lacks coordination: sessions cannot share task state, communicate
findings, or avoid conflicting edits. Agent teams formalize this pattern with
shared task lists and inter-agent messaging.

---

## Difficulties Encountered

- **Experimental and undocumented edge cases:** The feature is marked
  experimental, so behavior around error recovery, context limits per teammate,
  and task dependency resolution was learned through trial and error.
- **No session resumption for in-process mode:** If a teammate crashes or the
  terminal closes, that teammate's work is lost. Only discovered after losing
  progress mid-task.
- **Permission inheritance is all-or-nothing:** Teammates inherit the lead's
  permission mode at spawn time. Cannot give different teammates different
  permission levels (e.g., read-only reviewer vs read-write implementer).
- **Choosing team vs subagent vs solo:** The distinction is subtle. Early
  attempts used agent teams for tasks better suited to subagents (quick focused
  work), wasting coordination overhead.
- **Gitignored symlinks missing in worktrees:** When teammates work in git
  worktrees, only tracked files appear. Gitignored symlinks (`CLAUDE.local.md`,
  `.claude/settings.local.json`, `.claude/skills`) are missing. Personal
  instructions and settings don't load for worktree teammates. Mitigated by
  putting critical env vars in user-level `~/.claude/settings.local.json` and
  front-loading context in spawn prompts.
- **`teammateMode: "tmux"` config parsing bug (#24292):** The explicit `"tmux"`
  value in `settings.json` is not read correctly. Workaround: use `"auto"` mode
  (detects `$TMUX` env var) or pass `--teammate-mode tmux` CLI flag.
- **TeamDelete doesn't kill orphaned tmux panes:** When agents shut down, the
  tmux pane stays alive as a fresh zsh shell. `TeamDelete` cleans team metadata
  but not panes. Must manually run `tmux kill-pane -t %<id>` for each orphan.
  Check with `tmux list-panes -a` after team work.
- **Tmux pane race condition on parallel spawn:** Spawning 3+ teammates
  simultaneously can hit "not in a mode" errors from tmux `send-keys`. The pane
  gets created but the agent fails to start. Retry individually usually works.
- **Settings.json reorganization side effects:** Claude Code UI can reorganize
  `settings.json` when saving changes, silently altering values like
  `defaultMode`. Always verify settings after UI-driven changes.

---

## Key Concepts

- **Lead:** Main session that creates team, spawns teammates, coordinates work
- **Teammates:** Separate Claude instances with own context
- **Task list:** Shared work items with states (pending, in progress, completed)
  and dependencies
- **Mailbox:** Direct messaging between any agents (not just back to lead)

## When to Use (vs Subagents vs Solo)

| Need                                    | Use          |
| --------------------------------------- | ------------ |
| Quick focused task, only result matters | Subagent     |
| Workers need to discuss and collaborate | Agent team   |
| Sequential work, same-file edits        | Solo session |

Best cases: parallel code review, competing hypothesis debugging, cross-layer
coordination (frontend/backend/tests), independent module development.

## When NOT to Use

- **Sequential edits to the same file:** Teammates cannot safely edit the same
  file concurrently. Use a solo session instead.
- **Quick one-shot tasks:** If the task takes less than 5 minutes solo, the
  coordination overhead of spawning a team is not worth it. Use a subagent for
  focused delegation.
- **When you need session persistence:** In-process teammates cannot be resumed
  if interrupted. If the task might take longer than one sitting, use solo
  sessions with handoff docs.
- **Nested orchestration:** Cannot create teams within teams. If your workflow
  requires hierarchical delegation, use manual multi-session coordination
  instead.

---

## Setup

Enable in `settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Display mode (`"in-process"`, `"tmux"`, or `"auto"`):

```json
{
  "teammateMode": "auto"
}
```

**Note:** Use `"auto"` (recommended). It detects `$TMUX` and uses split panes
automatically. The explicit `"tmux"` value has a config parsing bug (#24292) as
of v2.1.52.

## Key Patterns

- **Delegate mode** (Shift+Tab): restricts lead to coordination only - no
  implementing
- **Plan approval:** teammates plan in read-only mode, lead approves before
  implementation
- **Task sizing:** aim for 5-6 tasks per teammate
- **Quality hooks:** `TeammateIdle` (keep working) and `TaskCompleted` (prevent
  premature completion)

## Limitations

- No session resumption for in-process teammates
- One team per session, no nested teams
- Fixed lead (can't transfer leadership)
- All teammates inherit lead's permission mode at spawn
- Split panes require tmux or iTerm2
- `teammateMode: "tmux"` has config parsing bug; use `"auto"` instead
- TeamDelete doesn't clean up orphaned tmux panes (manual cleanup needed)
- Parallel spawn race condition with 3+ teammates (retry individually)
- Gitignored files missing in worktrees (teammates lack personal config)

## Example

```text
Create an agent team to review PR #142. Spawn three
reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```
