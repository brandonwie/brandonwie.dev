---
title: tmux Smart Session Auto-Start
description: Auto-start tmux from `.zshrc` with numeric session naming so each new terminal
date: 2026-02-25T00:00:00.000Z
updated: 2026-02-25T00:00:00.000Z
tags:
  - devops
  - tmux
  - zsh
  - terminal
  - iterm2
category: devops
draft: false
lang: en
references:
  - url: 'https://man7.org/linux/man-pages/man1/tmux.1.html'
    title: tmux(1) man page
    type: official
  - url: 'https://iterm2.com/documentation-tmux-integration.html'
    title: iTerm2 tmux Integration
    type: official
---

window (`Cmd+N` in iTerm2) gets its own tmux session, while reusing detached
sessions from closed windows.

---

## The Problem

iTerm2's "Send text at start" setting with `tmux new -A -s main\n` always
attaches to the same `main` session. The `-A` flag means "attach if exists,
create if not." Every `Cmd+N` window reattaches to the same session — you see
the same panes and content in multiple windows instead of getting independent
workspaces.

---

## Difficulties Encountered

- **iTerm2 setting is opaque**: "Send text at start" just injects text into the
  shell. There's no conditional logic — it always runs the same command. You
  can't detect whether the session is already attached from another window.
- **Race condition on fast close/open**: `Cmd+W` then instant `Cmd+N` creates
  duplicate sessions because iTerm2 takes ~1s to fully close a window
  (animation + pty teardown). The tmux server still sees the old session as
  attached. Tried `kill -0` PID checks and sleep-retry, but iTerm2's close
  pipeline is too slow for any non-blocking approach. Documented as known
  limitation.
- **Must not break non-terminal contexts**: VS Code integrated terminal, SSH
  sessions, and non-interactive shells (scripts) should not auto-start tmux.
  Each has different environment variables to detect.

---

## The Solution

Move tmux management from iTerm2 into `.zshrc` Section 1a, placed immediately
after Homebrew PATH setup (so `tmux` binary is findable):

```bash
if [[ -z "$TMUX" ]] && [[ "$TERM_PROGRAM" != "vscode" ]] \
   && command -v tmux &>/dev/null && [[ -t 0 ]]; then
  _detached=$(tmux list-sessions -F '#{session_name} #{session_attached}' \
    2>/dev/null | awk '$1 ~ /^[0-9]+$/ && $2 == "0" { print $1; exit }')

  if [[ -n "$_detached" ]]; then
    exec tmux attach-session -t "$_detached"
  else
    _n=0
    while tmux has-session -t "$_n" 2>/dev/null; do
      ((_n++))
    done
    exec tmux new-session -s "$_n"
  fi
fi
```

## Key Points

- **Numeric names (0, 1, 2, ...)** — matches tmux's default convention. Easy to
  type: `tmux kill-session -t 2`, `tmux attach -t 0`. No special-casing for the
  first session.
- **`exec tmux` replaces the shell process** — no leftover shell after exiting
  tmux. The terminal window closes cleanly. Without `exec`, exiting tmux drops
  you into a bare shell.
- **`#{session_attached}`** — tmux format variable that returns `1` if a client
  is attached, `0` if detached. This is how you distinguish "active window" from
  "saved but closed."
- **awk regex filter `$1 ~ /^[0-9]+$/`** — only manages numeric sessions. Custom
  named sessions (e.g., `dev`, `work`) are untouched by auto-start.
- **Placement after Homebrew** — the tmux binary lives in `/opt/homebrew/bin/`.
  Running this block before PATH setup would fail `command -v tmux`.
- **Double-source lifecycle** — `.zshrc` runs twice: once outside tmux (triggers
  `exec`), once inside tmux (`$TMUX` is set, block skips). All plugins, aliases,
  and tools load on the second pass inside tmux.

## Session Naming

| Session | Created when                            |
| ------- | --------------------------------------- |
| `0`     | First window, no sessions exist         |
| `1`     | Second window, `0` is attached          |
| `2`     | Third window, both `0` and `1` attached |

Closing a window detaches (not kills) the session. Next `Cmd+N` reattaches to
the first detached numeric session instead of creating a new one.

---

## Options Considered

| Option                      | Pros                                                   | Cons                                               |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| iTerm2 "Send text at start" | Simple, one-line config                                | No conditional logic, same session for all windows |
| iTerm2 Profile Command      | Runs before shell init                                 | Replaces login shell, breaks .zshrc loading        |
| .zshrc auto-start (chosen)  | Full shell logic, per-window sessions, skip conditions | Known race condition on fast close/open            |

## Why This Approach

`.zshrc` auto-start chosen because it's the only option that allows conditional
logic (detect attached sessions, skip VS Code, etc.) while still loading the
full shell environment. The `exec` pattern keeps it clean — no performance
overhead since it replaces the shell process rather than forking.

---

## When to Use

- You want each terminal window to have its own tmux session
- You need detached session reuse (close window, reopen, get your session back)
- You use multiple terminal contexts (iTerm2, VS Code, SSH) with different tmux
  needs

## When NOT to Use

- You intentionally want all windows in the same tmux session (pair programming,
  shared view)
- You use iTerm2's `-CC` control mode (requires iTerm2 to manage the lifecycle,
  not shell)
- You're on a server where tmux sessions should persist across SSH disconnects
  (different pattern — no `exec`, use `tmux attach || tmux new`)
