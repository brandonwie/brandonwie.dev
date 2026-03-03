---
title: Claude Code PostToolUse Hooks
description: >-
  PostToolUse hooks fire after a tool completes. They receive JSON via stdin
  with
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-25T00:00:00.000Z
tags:
  - devops
  - claude-code
  - hooks
category: devops
draft: false
lang: en
references:
  - url: 'https://docs.anthropic.com/en/docs/claude-code/hooks'
    title: Claude Code Hooks Documentation
    type: official
---

session, tool name, input, result, and working directory.

## Hook Stdin Schema

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

## Key Points

- Matcher is a regex tested against `tool_name`
- `^Skill$` matches only the Skill tool (skill/command invocations)
- Multiple PostToolUse entries can coexist; all matching entries fire
- Hook commands run in the user's shell (zsh on macOS)
- Always append `|| true` to prevent hook failures from blocking Claude

## Skill Usage Tracking Pattern

A lightweight counter-based approach for tracking which skills are used and how
often:

1. PostToolUse hook with matcher `^Skill$`
2. Python script reads stdin JSON, extracts skill name from `tool_input.skill`
3. Increments counter in a persistent JSON file
4. Tracks `count`, `first_used`, `last_used` per skill

```python
# ~/.claude/scripts/track-skill-usage.py
data = json.load(sys.stdin)
skill = data.get("tool_input", {}).get("skill", "")
usage[skill]["count"] += 1
usage[skill]["last_used"] = today
```

Output file (`~/.claude/skill-usage.json`):

```json
{
  "wrap": {
    "count": 5,
    "first_used": "2026-02-09",
    "last_used": "2026-02-09"
  }
}
```

## Gotchas

- **Hook merging, not replacing:** Claude Code **merges** hooks from all config
  layers (global `~/.claude/settings.json` + project `settings.local.json`). If
  the same matcher + script appears in both, it fires **twice** per tool call.
  This is different from permissions, where project-level can override global.
  For hooks, both always fire.
- **Double-counting footgun:** A `^Skill$` → `track-skill-usage.py` hook in both
  global and project configs causes every skill invocation to increment the
  counter twice. Existing counts become ~2x inflated. Fix: keep the hook in
  global config only; remove from project `settings.local.json`.
- **Execute permissions optional:** Hook scripts invoked as
  `python3 ~/.claude/scripts/script.py` don't need execute permission. The
  shebang is decorative. But set `chmod +x` for consistency and direct
  invocation.

## Design Decisions

- **Counter, not log:** O(1) file size, sufficient for frequency analysis
- **Double safety:** `|| true` in hook command + bare `except: pass` in Python =
  hooks never block Claude
- **No dependencies:** Python stdlib only (json, sys, os)
- **Portable:** Script lives in both `~/.claude/scripts/` (live) and
  `global-claude-setup/scripts/` (bootstrap)
