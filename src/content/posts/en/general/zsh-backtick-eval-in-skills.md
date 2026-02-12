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
  - url: "https://zsh.sourceforge.io/Doc/Release/Expansion.html"
    title: Zsh Command Substitution and Expansion
    type: official
  - url: "https://docs.anthropic.com/en/docs/claude-code/skills"
    title: Claude Code Skills Documentation
    type: official
---

I spent twenty minutes staring at a `command not found: fixed` error that made zero sense. My `/wrap` skill had been working fine for days, then suddenly zsh was complaining about commands that were just markdown formatting in a SKILL.md file. The culprit was backticks -- the same character used for both inline code in markdown and command substitution in zsh.

## Why This Matters

Claude Code skills are loaded by reading SKILL.md files and passing their content through the shell environment. If your skill file contains backtick-wrapped text, zsh does not see markdown formatting. It sees command substitution syntax. The shell pairs up backticks and tries to execute whatever sits between them, producing errors that look completely unrelated to your actual code.

This is particularly insidious because the errors are non-fatal. Your skill still loads, the output mostly works, but every invocation dumps stderr noise that clutters your terminal and hides real problems.

## The Trigger

Here is the exact markdown that broke my `/wrap` skill:

```text
entry type: `+` (added), `~` (changed),
   `-` (removed), `!` (fixed)
3. Add entry to `{PATH}/CHANGELOG.md`:
```

And the error zsh produced:

```text
(eval):1: command not found: fixed
(eval):2: command not found: 3.
```

The `(eval)` prefix is the giveaway. It tells you zsh's `eval` builtin is processing the text, not a normal command execution.

## How zsh Interprets This

Walk through what zsh sees step by step. When it encounters the backtick before `!`, it starts looking for the closing backtick. It finds one before `(fixed)`. Now zsh has a command substitution containing `(changed),\n   ` and some surrounding text.

The `(fixed)` after the closing backtick gets interpreted as a subshell command. zsh tries to run `fixed` as a program -- it does not exist, so you get `command not found: fixed`.

Then `3.` on the next line gets treated as another command. Same result.

The key points to understand:

- Backtick pairs in markdown become command substitution delimiters in zsh
- `(text)` after a closing backtick is interpreted as a subshell
- The `(eval)` prefix in the error always means zsh's eval builtin is the source
- These errors are non-fatal but produce stderr noise on every skill invocation

## The Fix

Remove backtick formatting from any text that contains shell-sensitive characters. Use plain text or a different formatting approach:

```text
# Before (breaks)
`!` (fixed)

# After (works)
fixed = !
```

The general rule: avoid wrapping characters like `!`, `$`, `(`, `)` in backticks when followed by text that could be interpreted as shell syntax.

## Practical Takeaway

If you are writing Claude Code SKILL.md files and your skill suddenly produces `(eval): command not found` errors, check for backtick formatting first. The fix is always to simplify the formatting -- use plain text descriptions instead of inline code backticks for anything involving shell-sensitive characters.

This applies specifically to SKILL.md files because they are processed through shell evaluation. Regular markdown files rendered in a browser are not affected.
