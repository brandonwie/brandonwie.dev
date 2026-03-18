---
title: tmux Smart Session Auto-Start
description: >-
  Auto-start tmux via an iTerm2 Profile Command (`tmux-smart-attach`) with
  numeric
date: 2026-02-25T00:00:00.000Z
updated: 2026-03-14T00:00:00.000Z
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
source_content_hash: a619956038f0deae97cfbe4ca72244f8a8efab2c40459e125db52dbbb0a51d4c
---

session naming so each new terminal window (`Cmd+N`) gets its own tmux session,
while reusing detached sessions from closed windows.

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
- **`.zshrc` approach breaks non-terminal zsh contexts** (discovered
  2026-03-14): The original `.zshrc` Section 1a approach used guard conditions
  (`$TERM_PROGRAM`, `[[ -t 0 ]]`) to skip non-iTerm2 contexts, but programs that
  source the zsh profile (VS Code integrated terminal extensions, shell scripts
  using `zsh -l`, etc.) could still trigger the tmux block unexpectedly. The
  fundamental problem: `.zshrc` runs in too many contexts to safely gate. Moving
  tmux startup to an iTerm2 Profile Command eliminates this entirely — the
  script only runs when iTerm2 opens a tab.

---

## The Solution

Use a standalone script (`~/.local/bin/tmux-smart-attach`) invoked as the iTerm2
Profile Command, instead of embedding tmux logic in `.zshrc`.

**Script location:** `~/.local/bin/tmux-smart-attach`

```bash
#!/bin/zsh -l
# tmux-smart-attach — iTerm2 profile startup command
# 1. Attach to first detached session (lowest numbered)
# 2. Create new session named with lowest unused number

# Ensure tmux is found (login shell via -l loads PATH)
detached=$(tmux ls -F '#{session_name} #{session_attached}' 2>/dev/null \
  | awk '$2 == 0 {print $1; exit}')

if [ -n "$detached" ]; then
  exec tmux attach -t "$detached"
else
  # Find lowest unused session number (fills gaps: 0,3 → creates 1)
  taken=$(tmux ls -F '#{session_name}' 2>/dev/null | sort -n)
  n=0
  while echo "$taken" | grep -qx "$n"; do
    ((n++))
  done
  exec tmux new-session -s "$n"
fi
```

**iTerm2 configuration:** Profiles → General → Command → select "Custom Shell" →
set absolute path: `/Users/brandonwie/.local/bin/tmux-smart-attach`

## Key Points

- **`#!/bin/zsh -l` (login shell shebang)** — loads `.zprofile` and `.zshrc`, so
  PATH includes Homebrew, asdf, and all tools. This is why the original concern
  about "breaks .zshrc loading" was wrong — the `-l` flag ensures the full shell
  environment is available.
- **No skip conditions needed** — unlike the `.zshrc` approach, this script only
  runs when iTerm2 opens a tab. VS Code terminals, SSH sessions, and scripts
  never invoke it.
- **Gap-filling session numbering** — if sessions 0 and 3 exist, creates session
  1 (not 4). The `grep -qx "$n"` check iterates from 0 upward until finding an
  unused number.
- **`exec tmux` replaces the script process** — no leftover shell after exiting
  tmux. The terminal window closes cleanly.
- **`#{session_attached}`** — tmux format variable that returns `1` if a client
  is attached, `0` if detached. This is how you distinguish "active window" from
  "saved but closed."

## Session Naming

| Session | Created when                            |
| ------- | --------------------------------------- |
| `0`     | First window, no sessions exist         |
| `1`     | Second window, `0` is attached          |
| `2`     | Third window, both `0` and `1` attached |

Closing a window detaches (not kills) the session. Next `Cmd+N` reattaches to
the first detached numeric session instead of creating a new one.

Gap-fill example: if you kill session 1 (`tmux kill-session -t 1`), sessions 0
and 2 remain. Next `Cmd+N` creates session 1 (fills the gap), not session 3.

---

## Options Considered

| Option                          | Pros                                                   | Cons                                                                |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| iTerm2 "Send text at start"     | Simple, one-line config                                | No conditional logic, same session for all windows                  |
| iTerm2 Profile Command (chosen) | Isolated from shell profile, no skip conditions needed | Known race condition on fast close/open                             |
| .zshrc auto-start (superseded)  | Full shell logic, per-window sessions                  | Breaks non-terminal zsh contexts (VS Code, scripts sourcing .zshrc) |

**Note on the original iTerm2 Profile Command concern:** The v1 of this entry
listed "Replaces login shell, breaks .zshrc loading" as a con. This was
incorrect — using `#!/bin/zsh -l` as the shebang makes the script run as a login
shell, which sources `.zprofile` and `.zshrc` normally. The full shell
environment (PATH, aliases, functions) is available inside tmux.

## Why This Approach

iTerm2 Profile Command chosen because it isolates tmux startup from the shell
profile entirely. The `.zshrc` approach ran in every zsh context (VS Code
integrated terminals, shell scripts, non-interactive shells) and required
fragile guard conditions (`$TERM_PROGRAM`, `[[ -t 0 ]]`). The Profile Command
only executes when iTerm2 opens a tab — no guards needed, no side effects on
other zsh consumers. The `#!/bin/zsh -l` shebang ensures the full shell
environment loads before tmux starts.

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
