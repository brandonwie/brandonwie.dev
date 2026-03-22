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
expanded: true
---

I wanted every new iTerm2 window (`Cmd+N`) to open with its own tmux session, while reusing detached sessions from closed windows. The obvious approach — putting `tmux new -A -s main` in iTerm2's "Send text at start" — always reattaches to the same `main` session. Every window shows the same panes and content instead of giving you independent workspaces.

The solution went through three iterations before landing on one that works reliably across all contexts.

## The Problem with the Obvious Approach

iTerm2's "Send text at start" setting with `tmux new -A -s main\n` uses the `-A` flag, which means "attach if exists, create if not." Since every window runs the same command, they all attach to `main`. You get one shared session across all windows instead of independent workspaces.

## The Iterations

I tried three approaches before finding one that works:

| Option                          | Pros                                                   | Cons                                                                |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| iTerm2 "Send text at start"     | Simple, one-line config                                | No conditional logic, same session for all windows                  |
| .zshrc auto-start (superseded)  | Full shell logic, per-window sessions                  | Breaks non-terminal zsh contexts (VS Code, scripts sourcing .zshrc) |
| iTerm2 Profile Command (chosen) | Isolated from shell profile, no skip conditions needed | Known race condition on fast close/open                             |

The `.zshrc` approach seemed promising — I added guard conditions (`$TERM_PROGRAM`, `[[ -t 0 ]]`) to skip non-iTerm2 contexts. But programs that source the zsh profile (VS Code integrated terminals, shell scripts using `zsh -l`) could still trigger the tmux block unexpectedly. The fundamental problem: `.zshrc` runs in too many contexts to safely gate.

## The Solution: iTerm2 Profile Command

Moving tmux startup to an iTerm2 Profile Command eliminates the context problem entirely — the script only runs when iTerm2 opens a tab, never in VS Code, SSH, or scripted contexts.

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

**iTerm2 configuration:** Profiles → General → Command → select "Custom Shell" → set the absolute path: `/Users/<username>/.local/bin/tmux-smart-attach`

## How It Works

The script follows a simple decision tree:

1. Check if any detached tmux sessions exist (sessions where `#{session_attached}` is 0)
2. If yes, attach to the first detached session (lowest numbered)
3. If no, create a new session named with the lowest unused number

### Session Numbering

| Session | Created when                            |
| ------- | --------------------------------------- |
| `0`     | First window, no sessions exist         |
| `1`     | Second window, `0` is attached          |
| `2`     | Third window, both `0` and `1` attached |

Closing a window detaches (not kills) the session. The next `Cmd+N` reattaches to the first detached session instead of creating a new one.

The gap-filling logic means if you kill session 1 (`tmux kill-session -t 1`), sessions 0 and 2 remain. The next `Cmd+N` creates session 1 (fills the gap), not session 3.

## Key Implementation Details

**`#!/bin/zsh -l` (login shell shebang)** — This loads `.zprofile` and `.zshrc`, so PATH includes Homebrew, asdf, and all tools. An earlier concern about "breaks .zshrc loading" was incorrect — the `-l` flag ensures the full shell environment is available inside tmux.

**No skip conditions needed** — Unlike the `.zshrc` approach, this script only runs when iTerm2 opens a tab. VS Code terminals, SSH sessions, and scripts never invoke it.

**`exec tmux` replaces the script process** — No leftover shell after exiting tmux. The terminal window closes cleanly when you exit the tmux session.

**`#{session_attached}` format variable** — tmux returns `1` if a client is attached, `0` if detached. This is how you distinguish "active in a window" from "saved but window closed."

## Known Limitation

There's a race condition on fast close/open: `Cmd+W` then instant `Cmd+N` can create duplicate sessions because iTerm2 takes ~1 second to fully close a window (animation + pty teardown). The tmux server still sees the old session as attached during this window. I tried `kill -0` PID checks and sleep-retry approaches, but iTerm2's close pipeline is too slow for any non-blocking solution. In practice, this rarely causes issues — the duplicate session just gets reused next time.

## When to Use This

- You want each terminal window to have its own tmux session
- You need detached session reuse (close window, reopen, get your session back)
- You use multiple terminal contexts (iTerm2, VS Code, SSH) with different tmux needs

## When NOT to Use This

- You intentionally want all windows in the same tmux session (pair programming, shared view)
- You use iTerm2's `-CC` control mode (requires iTerm2 to manage the lifecycle)
- You're on a server where tmux sessions should persist across SSH disconnects (different pattern — no `exec`, use `tmux attach || tmux new`)

## Takeaway

Auto-starting tmux from `.zshrc` breaks non-terminal zsh contexts. Moving the logic to an iTerm2 Profile Command isolates it completely — the script only runs when iTerm2 opens a tab. The `#!/bin/zsh -l` shebang ensures the full shell environment loads, numeric session naming with gap-filling gives each window its own workspace, and detached session reuse means closing a window doesn't lose your work.

## References

- [tmux(1) man page](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [iTerm2 tmux Integration](https://iterm2.com/documentation-tmux-integration.html)
