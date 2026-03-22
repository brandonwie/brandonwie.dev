---
title: zsh Backtick Evaluation in Claude Code Skills
description: Claude Code SKILL.md files can trigger zsh command substitution errors when
date: 2026-02-09T00:00:00.000Z
updated: '2026-03-22'
tags:
  - general
  - claude-code
  - zsh
  - debugging
category: general
draft: false
lang: en
expanded: true
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

I was writing a Claude Code SKILL.md file -- a markdown document that defines instructions for Claude's `/wrap` command. The skill worked fine on my colleague's machine. On mine, every invocation printed two lines of errors to stderr before doing anything useful:

```text
(eval):1: command not found: fixed
(eval):2: command not found: 3.
```

The errors were non-fatal. The skill still ran. But "non-fatal stderr noise on every invocation" is the kind of thing that erodes trust in tooling. I spent an hour tracking down the cause, and the answer was not where I expected.

## The Culprit: Markdown Backticks Meet zsh

The problem was in the SKILL.md file itself. Claude Code processes skill files through a pipeline that, at some point, passes the content through zsh's `eval` builtin. That means anything in the markdown that looks like shell syntax gets interpreted as shell syntax.

Here is the line that broke:

```text
entry type: `+` (added), `~` (changed),
   `-` (removed), `!` (fixed)
3. Add entry to `{PATH}/CHANGELOG.md`:
```

To a markdown renderer, those backticks are inline code formatting. To zsh, they are command substitution delimiters.

## How zsh Parses This

The shell pairs backticks and tries to execute whatever is between them. Here is what zsh sees:

1. The backtick before `+` opens a command substitution
2. The backtick after `+` closes it -- zsh tries to execute `+`, which is not a command but happens to not error
3. The next backtick before `~` opens another substitution
4. The backtick after `~` closes it
5. When it hits `` `!` (fixed) ``, zsh interprets `(fixed)` after the backtick-close as a subshell command
6. The `(eval)` prefix in the error message confirms this: zsh's eval builtin is processing the text

The second error, `command not found: 3.`, comes from the next line. After the backtick pairing goes wrong, `3. Add entry to` gets interpreted as a command named `3.`.

The `(eval)` prefix in the error messages is the key diagnostic clue. It tells you that zsh's `eval` builtin is processing the text, not the regular shell parser. This narrows the search: something is passing your markdown content to `eval`.

## Why This Only Affects Some Machines

This bug is shell-specific. If your default shell is bash, backticks inside `eval` behave differently -- bash is more lenient about what constitutes a valid command substitution in certain contexts. The error surfaces on zsh, which is the default shell on macOS since Catalina. So a SKILL.md file that works fine on a Linux CI server with bash will break on a developer's MacBook.

## The Fix

Remove backtick formatting from text that contains shell-sensitive characters. The content does not need inline code styling to be readable.

```text
# Before (breaks in zsh)
`!` (fixed)

# After (works everywhere)
fixed = !
```

The general rule: avoid backtick-wrapping characters like `!`, `$`, `(`, `)` when followed by text that could be interpreted as shell syntax. In a SKILL.md file, plain text communicates the same information without triggering the shell parser.

If you need to preserve the formatting, consider restructuring the content so that backtick pairs do not surround shell-sensitive characters. For example, instead of `` `!` (fixed) ``, write `type "!" means fixed`. The goal is to break the pattern that zsh recognizes as command substitution.

## Diagnosing Similar Issues

If you see `(eval):N: command not found` errors in Claude Code, check these things:

1. **Look for backtick pairs in your SKILL.md files** that surround characters with shell meaning (`!`, `$`, `()`, `{}`)
2. **Check if the error text matches content in your skill file** -- the "command not found" string will be a word from your markdown
3. **Verify your shell** -- run `echo $SHELL` to confirm you are on zsh
4. **Test with bash** -- if the error disappears under `bash -c`, the issue is zsh-specific backtick handling

## Takeaway

When writing SKILL.md files for Claude Code, treat the content as shell-adjacent text, not pure markdown. Backticks are not safe formatting -- they are command substitution delimiters that zsh will try to evaluate. Strip backtick formatting from any text that contains shell-meaningful characters. The errors are non-fatal, but eliminating them means one less thing to investigate when something else goes wrong.
