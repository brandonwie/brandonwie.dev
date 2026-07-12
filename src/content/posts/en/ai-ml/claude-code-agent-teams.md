---
title: Claude Code Agent Teams
description: Experimental feature for orchestrating multiple Claude Code instances as a coordinated team with shared task lists and inter-agent messaging
date: 2026-02-09T00:00:00.000Z
updated: '2026-07-13'
tags:
  - ai-ml
  - claude-code
  - agent-teams
  - experimental
category: ai-ml
draft: false
lang: en
expanded: true
source_content_hash: 15de9f31fcd1dd98232276bdf9779aad9a2906fd567318548f0e16ef3c242005
references:
  - url: "https://code.claude.com/docs/en/agent-teams"
    title: Orchestrate teams of Claude Code sessions
    type: official
  - url: "internal://claude-binary-strings/v2.1.138"
    title: BackendRegistry + persistent-macro evidence (binary strings dump)
    type: verified
    notes: "strings $(which claude) reveals [BackendRegistry] Selected: tmux log + functions yk7/hk7/vk7 managing S_()/e_() macros (preferTmuxOverIterm2, iterm2It2SetupComplete) outside settings.json"
---

I needed three independent code reviews running in parallel (security, performance, and test coverage) on the same PR. Opening three terminal tabs and copy-pasting context between them felt like managing interns over Slack. Agent Teams let one Claude session act as lead, spawn teammates into separate tmux panes, and coordinate through a shared task list. The idea works well, but getting there means knowing where the sharp edges are.

This post documents how Agent Teams work, when they outperform subagents or solo sessions, and every difficulty I hit across weeks of daily use, including the ones that silently degraded my setup without me noticing.

## What Agent Teams are

Agent Teams is an experimental Claude Code feature where one session (the lead) creates a team, spawns teammates, and coordinates work through shared infrastructure. Each teammate runs as an independent Claude instance with its own context window.

The coordination primitives are:

- The lead is the main session that creates the team, assigns tasks, and approves work.
- Teammates are separate Claude instances spawned into their own panes.
- The task list holds shared work items with states (pending, in progress, completed) and dependency tracking.
- The mailbox handles direct messaging between any agents, not just lead-to-teammate pairs.

This is different from subagents (the `Agent` tool), which run in the background and return a result. Teammates are persistent, interactive, and can communicate with each other.

## When to use teams

The distinction between teams, subagents, and solo sessions matters. Picking wrong wastes time on coordination overhead or leaves performance on the table.

| Need                                    | Use          |
| --------------------------------------- | ------------ |
| Quick focused task, only result matters | Subagent     |
| Workers need to discuss and collaborate | Agent team   |
| Sequential work, same-file edits        | Solo session |

Teams work well for parallel code review, competing hypothesis debugging, cross-layer coordination (frontend + backend + tests simultaneously), and independent module development where workers need to share findings.

There is a collect-side caveat that took me a while to internalize. If you need to read a worker's output back into the lead session, prefer a synchronous `Agent` call with no `name` or `team_name`: its final message returns directly as the tool result. A named or background teammate's analysis text is invisible to the orchestrator until (and if ever) a `SendMessage` arrives. Do not rely on a named teammate for a fan-out then collect step where you actually need the payload in hand.

## When NOT to use teams

Not every parallel workload benefits from the coordination overhead.

- Sequential edits to the same file. Teammates cannot safely edit the same file concurrently, so use a solo session instead.
- Quick one-shot tasks. If the task takes less than five minutes solo, spawning a team wastes more time on setup than it saves. Use a subagent for focused delegation.
- Tasks that need session persistence. In-process teammates cannot be resumed if interrupted. If the task might span multiple sittings, use solo sessions with handoff documentation.
- Nested orchestration. Teams cannot create teams within teams. For hierarchical delegation, coordinate multiple solo sessions manually.

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

Both `"tmux"` and `"auto"` should auto-detect iTerm2 via the `it2` CLI, but the iTerm2 backend is broken as of v2.1.74 (issue #24301; details below). In practice, split panes only work inside a tmux session. Without tmux, teammates silently fall back to in-process mode, with no error and no warning. To work around it, launch `tmux -CC` in iTerm2 (control mode) to get native iTerm2 panes via the tmux backend.

## Key patterns

Four patterns emerged from daily use that make teams productive rather than chaotic:

- Delegate mode (Shift+Tab) restricts the lead to coordination only, so it does not implement. This keeps the lead focused on task management and review.
- Plan approval: teammates plan in read-only mode. The lead reviews the plan before authorizing implementation, which prevents wasted work from misunderstood requirements.
- Task sizing: aim for 5-6 tasks per teammate. Fewer tasks underutilize the teammate; more cause context overflow.
- Quality hooks: `TeammateIdle` keeps teammates working instead of stopping early, and `TaskCompleted` prevents premature completion claims.

## Difficulties encountered

This section is the reason this post exists. The official docs cover the happy path. Everything below I learned through broken sessions and lost work, not from the docs.

**Experimental and undocumented edge cases.** The feature is marked experimental. Behavior around error recovery, context limits per teammate, and task dependency resolution was learned through trial and error. Documentation covers the basics but not failure modes.

**No session resumption for in-process mode.** If a teammate crashes or the terminal closes, that teammate's work is lost. I discovered this after losing 20 minutes of implementation progress mid-task. There is no checkpoint or recovery mechanism.

**Permission inheritance is all-or-nothing.** Teammates inherit the lead's permission mode at spawn time. You cannot give different teammates different permission levels. A read-only reviewer and a read-write implementer would need separate permission configs, which is not supported.

**Choosing team vs subagent vs solo.** The distinction is subtle. Early attempts used agent teams for tasks better suited to subagents (quick focused work), which wasted coordination overhead on problems that needed a five-second background task, not a persistent collaborator.

**Gitignored symlinks missing in worktrees.** When teammates work in git worktrees, only tracked files appear. Gitignored symlinks (`CLAUDE.local.md`, `.claude/settings.local.json`, `.claude/skills`) are missing. Personal instructions and settings do not load for worktree teammates. The mitigation is putting critical environment variables in user-level `~/.claude/settings.local.json` and front-loading context in spawn prompts.

**iTerm2 `ITermBackend` NOT functional (known bug #24301).** The binary contains an `ITermBackend` with full `it2 session split` support, but the backend selection logic never activates it. With `teammateMode: "auto"` or `"tmux"`, Claude Code silently falls back to `in-process` when not inside a tmux session, even with `it2` installed, Python API enabled, and all iTerm2 env vars present. Confirmed in v2.1.74 across multiple test cycles. The `teammateMode` setting is snapshotted at session start, so mid-session changes to `settings.json` have no effect. To work around it, use `tmux -CC` (iTerm2 control mode) to get native iTerm2 panes with the tmux backend.

**Backend selector stores macros outside `settings.json` (v2.1.138 audit).** A regression report on Claude Code 2.1.138 sent me into the binary's string table to figure out why split panes still weren't spawning despite `teammateMode: "tmux"` + `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` + an active tmux session. `strings $(which claude)` surfaced two persistent flags managed by a getter/setter pair the binary calls `S_()` / `e_()`:

- `preferTmuxOverIterm2`: set to `true` (via `yk7(true)`) when the user picks "Use tmux instead" on the iTerm2 setup prompt; read by `hk7()`.
- `iterm2It2SetupComplete`: set to `true` after a successful `it2 session list` verify (`vk7()`).

Neither flag lives in `settings.json`, and neither has a CLI read/write surface. The runtime backend selector emits `[BackendRegistry] Selected: tmux (running inside tmux session)` to stderr when `process.env.TMUX` is set. The tmux backend wins for any session launched from inside an existing tmux pane, regardless of what `settings.json` says.

The implication that surprised me: `teammateMode` reads as authoritative in the docs, but the runtime detector is the actual decision point. `settings.json` acts as a hint, not a hard override. If you want to know which backend the binary really picked, run `claude --debug`, attempt a `TeamCreate`, and grep stderr for `[BackendRegistry] Selected:`. The string is the ground truth; everything else is configuration.

**TeamDelete doesn't kill orphaned tmux panes.** When agents shut down, the tmux pane stays alive as a fresh zsh shell. `TeamDelete` cleans team metadata but not panes. You must manually run `tmux kill-pane -t %<id>` for each orphan. Check with `tmux list-panes -a` after team work to avoid accumulating zombie shells.

**Tmux pane race condition on parallel spawn.** Spawning three or more teammates simultaneously can trigger "not in a mode" errors from tmux `send-keys`. The pane gets created, but the agent fails to start. Retrying individually usually works. Spawning teammates sequentially (with a brief pause) avoids the issue entirely.

**Idle agent claims another's work (concurrency hazard).** When a teammate finishes its batch early, it can see unfinished tasks in the shared task list and claim them, even when another teammate is actively working on those files. Two agents writing the same files simultaneously causes data loss or conflicts. I hit this during a 3-agent blog expansion job across 72 posts: the fastest agent finished and claimed another's task, spawning sub-agents against the same files. No data loss only because the original agent had already written first. To prevent it, use `TaskUpdate` with `owner` to explicitly claim tasks at spawn time, and instruct agents not to claim tasks already `in_progress` or owned by another agent.

**Settings.json reorganization side effects.** The Claude Code UI can reorganize `settings.json` when saving changes, silently altering values like `defaultMode`. Always verify settings after UI-driven changes; a quick diff against version control catches silent mutations.

**TeamCreate incorrectly removed from instructions.** This one was particularly insidious. A previous session concluded that `TeamCreate` does not exist because it is a deferred tool, not visible in the tool list until explicitly loaded via `ToolSearch`. The global CLAUDE.md was updated to say "use Agent tool instead," which made all subsequent sessions use background subprocesses instead of split-pane teams. The fix was straightforward: always use `ToolSearch` to check for deferred tools before concluding they do not exist. But the damage was sessions of degraded behavior where I thought teams were working but was getting background subagents instead.

**Deferred tool visibility bias.** Even after documenting TeamCreate correctly, Claude consistently reached for the `Agent` tool without `team_name`, which always runs in-process with no split panes. The root cause: the `Agent` tool is always visible in the primary tool list, while `TeamCreate` requires `ToolSearch` to load. Claude defaults to the visible tool. The fix was a `SessionStart` hook (`session-start-team-preload.py`) that reminds Claude to preload TeamCreate at session start. The advisory output now includes an explicit 3-step workflow: `ToolSearch` → `TeamCreate` → `Agent(team_name)`. The key insight: `Agent` without `team_name` = in-process subprocess; `Agent` WITH `team_name` = tmux split pane. This distinction is invisible unless you know to look for it.

**Teammate summary-field trap (silent deliverable loss).** When a teammate sends a message back, its reply has both a `summary` field (5-10 words for the UI preview) and a `message` field (the full content). Some teammates put _only_ a meta-summary like "X complete, ready to paste" in the summary field and leave the message body empty or just restate the meta. The actual deliverable never arrives. I hit this on a 3-agent prep team in early April: 2 of 3 teammates returned summary-only messages, and an idle notification arrived without any prior content message. The lead session interpreted "idle" as task completion and moved on. Root cause: the teammate prompts didn't explicitly tell them where the deliverable belongs; they treated the summary as the report. The fix: every teammate brief must explicitly say "put the full deliverable in the message body; the summary field is metadata only, max 10 words." Equally important: treat an idle notification _without a prior content message_ as a silent failure, not task completion. Recovery is unreliable: `SendMessage`-ing an idle teammate to ask for the report inline does not deliver in time reliably, and the late payload may arrive a turn or more later, or not before you need it. The durable fix is structural. For any fan-out then collect step, use a _synchronous_ `Agent` call with no `name` or `team_name`, so its final message returns directly as the tool result and the deliverable cannot be stranded in an invisible summary field. Reserve named or background teammates for work whose output you do not need to read back inline.

**Restricted-tool worker types cannot message at all.** The summary-field trap has a harder variant. Worker agent types whose tool list excludes `SendMessage` and `Write` entirely (read-only workers with only Read, Glob, Grep, and Bash) are structurally unable to deliver a background report. The orchestrator receives idle notifications and nothing else, and no amount of re-instruction fixes it because the delivery tool does not exist in the worker's toolbox. I hit this on 2026-07-10 with four background diagnostic workers: four-plus wasted nudges before diagnosing the cause. The fix: when fanning out to restricted-tool agent types in the background, specify a file-drop delivery contract up front ("write your full report via Bash heredoc to `<agreed-path>`") and have the orchestrator read the files on each idle ping. Workers with Bash can always `cat > file <<'EOF'` even without the Write tool. A synchronous unnamed `Agent` call remains the simpler fix when the result must return inline.

## Limitations summary

For quick reference, here is the full constraint set:

- No session resumption for in-process teammates
- One team per session, no nested teams
- Fixed lead (cannot transfer leadership)
- All teammates inherit lead's permission mode at spawn
- Split panes require tmux (iTerm2 ITermBackend exists but is broken, #24301)
- Without tmux, teammates run in-process silently (no error, no split panes)
- Workaround for iTerm2: tmux -CC control mode gives native panes via tmux backend
- Backend selection is decided by the runtime detector (`process.env.TMUX`), not `teammateMode` in `settings.json` (verify with `claude --debug` + grep `[BackendRegistry] Selected:`)
- TeamDelete does not clean up orphaned tmux panes (manual cleanup needed)
- Parallel spawn race condition with 3+ teammates (retry individually)
- Idle teammates can claim another agent's in-progress tasks (use explicit ownership)
- Gitignored files missing in worktrees (teammates lack personal config)
- Deferred tools (like TeamCreate) are invisible until loaded via ToolSearch
- Named/background teammates cannot reliably return a payload inline; use a synchronous `Agent` call for any fan-out then collect step
- Restricted-tool workers (no `SendMessage` or `Write`) cannot deliver a background report at all; use a file-drop contract

## Example prompt

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

Agent Teams solve a real coordination problem: parallel work across a codebase with shared state. The task list and mailbox primitives are well-designed. The rough edges are in infrastructure: tmux pane management, config parsing, worktree isolation, and the deferred tool visibility problem that can silently downgrade your setup.

The most important lesson: verify your tools exist before concluding they do not. Deferred tools in Claude Code are invisible until you search for them. One bad assumption in one session propagated through my configuration and degraded every subsequent session for days. Check with `ToolSearch`, not with the visible tool list.

The second-most important lesson came later, from the v2.1.138 binary-strings audit: configuration files describe intent, runtime detectors decide behavior. When something is not working the way the docs say it should, grep the binary's stderr (`claude --debug`) for what the runtime actually picked. The `[BackendRegistry] Selected:` line is the ground truth in a way that `settings.json` is not.

The third lesson is about collecting work back, not spawning it. A named or background teammate's output is invisible to the lead until a message happens to arrive, and messages do not arrive reliably: sometimes because a teammate buried the deliverable in the summary field, sometimes because the worker's toolbox has no way to send a message at all. When you actually need the payload in hand, a synchronous `Agent` call returns its final message straight to you as the tool result. Reserve named and background teammates for work whose output you never have to read back inline.
