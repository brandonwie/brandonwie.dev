---
title: zsh Backtick Evaluation in Claude Code Skills
description: Claude Code SKILL.md files can trigger zsh command substitution errors when
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
tags:
  - general
  - claude-code
  - zsh
  - debugging
category: general
draft: false
lang: en
references:
  - url: null
    title: Backtick eval error in wrap SKILL.md
    type: experience
  - url: 'https://zsh.sourceforge.io/Doc/Release/Expansion.html'
    title: Zsh Command Substitution and Expansion
    type: official
  - url: 'https://docs.anthropic.com/en/docs/claude-code/skills'
    title: Claude Code Skills Documentation
    type: official
source_content_hash: 617b6ed7341f43addd508d419fa10da811baa14f7854c142e38be19ba0817946
---

backtick-formatted markdown text is processed through shell evaluation.

## The Problem

Inline code backticks in SKILL.md can be misinterpreted by zsh as command
substitution. The shell pairs backticks and tries to execute the content between
them.

## Example

This markdown formatting:

```text
entry type: `+` (added), `~` (changed),
   `-` (removed), `!` (fixed)
3. Add entry to `{PATH}/CHANGELOG.md`:
```

Produces this zsh error:

```text
(eval):1: command not found: fixed
(eval):2: command not found: 3.
```

Because zsh interprets `(fixed)` after a backtick pair as a subshell command,
and `3.` on the next line as a command.

## Key Points

- Backtick pairs in markdown can become command substitution in zsh
- `(text)` after a backtick close is interpreted as a subshell
- The `(eval)` prefix in error indicates zsh's eval builtin is processing the
  text
- Errors are non-fatal but produce stderr noise on every skill invocation

## Fix

Remove backtick formatting from text that contains shell- sensitive characters.
Use plain text or different formatting:

```text
# Before (breaks)
`!` (fixed)

# After (works)
fixed = !
```

Avoid backtick-wrapping characters like `!`, `$`, `(`, `)` when followed by text
that could be interpreted as shell syntax.
