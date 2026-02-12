---
title: Claude Code PostToolUse Hooks
description: >-
  PostToolUse hooks fire after a tool completes. They receive JSON via stdin
  with
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
tags:
  - devops
  - claude-code
  - hooks
category: devops
draft: false
lang: en
references:
  - url: "https://docs.anthropic.com/en/docs/claude-code/hooks"
    title: Claude Code Hooks Documentation
    type: official
---

I wanted to know which Claude Code skills I actually use. Not a guess, not a
feeling -- real data. Claude Code's hook system lets you run arbitrary code after
any tool completes, so I built a lightweight tracker that counts skill
invocations and writes the results to a JSON file.

## Why This Matters

Claude Code supports user-defined hooks that fire at specific lifecycle events.
PostToolUse hooks run after a tool completes, receiving a JSON payload via stdin
that contains the session ID, tool name, input, result, and working directory.
This opens up automation possibilities: formatting code after edits, running
linters after file writes, or tracking usage patterns.

The hook system is powerful but underdocumented in terms of practical patterns.
Understanding the stdin schema and matcher behavior unlocks real productivity
gains.

## How PostToolUse Hooks Work

When Claude Code finishes executing a tool, it fires the PostToolUse event. Any
hook whose matcher regex matches the `tool_name` will run. The hook receives
this JSON payload via stdin:

```json
{
  "session_id": "abc123",
  "tool_name": "Skill",
  "tool_input": { "skill": "wrap", "args": "..." },
  "tool_result": "...",
  "cwd": "/current/dir",
  "hook_event_name": "PostToolUse"
}
```

The matcher is a regex tested against `tool_name`. Using `^Skill$` matches only
the Skill tool, which handles skill and command invocations. Multiple
PostToolUse entries can coexist in your configuration -- all matching entries
fire for each event.

Hook commands run in the user's shell (zsh on macOS, bash on Linux). Always
append `|| true` to the command to prevent hook failures from blocking Claude
Code's execution.

## Building a Skill Usage Tracker

Here is the pattern I use. A PostToolUse hook with matcher `^Skill$` triggers a
Python script that reads the stdin JSON, extracts the skill name from
`tool_input.skill`, and increments a counter in a persistent JSON file.

The script tracks three fields per skill: `count`, `first_used`, and
`last_used`:

```python
# ~/.claude/scripts/track-skill-usage.py
data = json.load(sys.stdin)
skill = data.get("tool_input", {}).get("skill", "")
usage[skill]["count"] += 1
usage[skill]["last_used"] = today
```

The output file at `~/.claude/skill-usage.json` looks like this:

```json
{
  "wrap": {
    "count": 5,
    "first_used": "2026-02-09",
    "last_used": "2026-02-09"
  }
}
```

After a few days of normal usage, this file tells you exactly which skills you
rely on, which ones you never touch, and when you started using each one. It is
a lightweight alternative to full event logging.

## Design Decisions

I chose a counter-based approach instead of an event log. The file stays O(1) in
size regardless of how many times you invoke skills. For frequency analysis,
counts are sufficient. You do not need timestamps for every individual
invocation.

Safety is doubled up: `|| true` in the hook command ensures the shell never
reports a failure, and a bare `except: pass` in the Python script ensures the
script itself never crashes. Hooks must never block Claude Code. A broken hook
that hangs or errors out would interrupt your entire workflow.

The script uses Python stdlib only (json, sys, os). No external dependencies to
install. It lives in both `~/.claude/scripts/` (the live location) and
`global-claude-setup/scripts/` (the bootstrap repo) so it is portable across
machines.

## Practical Takeaway

PostToolUse hooks are the extension point for automating anything that should
happen after Claude Code performs an action. The pattern is always the same:
define a matcher regex, write a script that reads stdin JSON, do your work, and
fail silently.

Use this for skill usage tracking, auto-formatting, linting, notifications, or
any other post-action automation. The key constraint is that hooks must be fast
and must never fail loudly. Append `|| true` and handle exceptions broadly.

If you find yourself manually doing something after every Claude Code action,
that is a hook waiting to be written.
